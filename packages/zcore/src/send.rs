//! Planning a send with upstream's policy: `zcash_client_backend` picks the
//! notes, change and fee; this module only feeds it our wallet ([`Wallet`])
//! and reports the plan.

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
use zcash_address::ZcashAddress;
use zcash_client_backend::data_api::anchor_retention::{
    AnchorRetentionInterval, PoolMigrationParams,
};
use zcash_client_backend::data_api::wallet::input_selection::{
    GreedyInputSelector, InputSelector, InputSelectorError, NoteSelection, ShieldingSelector,
    SpendPolicy, TransparentSpendPolicy,
};
use zcash_client_backend::data_api::wallet::{ConfirmationsPolicy, TargetHeight};
use zcash_client_backend::fees::zip317::SingleOutputChangeStrategy;
use zcash_client_backend::fees::{DustOutputPolicy, StandardFeeRule, TransparentChangePolicy};
use zcash_client_backend::proposal::Proposal;
use zcash_client_backend::zip321::{Payment, TransactionRequest};
use zcash_primitives::transaction::fees::zip317::MARGINAL_FEE;
use zcash_protocol::consensus::{NetworkUpgrade, Parameters};
use zcash_protocol::memo::{Memo, MemoBytes};
use zcash_protocol::value::Zatoshis;
use zcash_protocol::zip318::PoolMigrationConstants;
use zcash_protocol::{PoolType, ShieldedPool};

use crate::parse_network;
use crate::wallet::{Wallet, WalletData, ACCOUNT};
use zcash_client_backend::data_api::InputSource;

/// What the user asked to send.
#[derive(Deserialize)]
pub(crate) struct SendRequest {
    to: String,
    amount: u64,
    memo: Option<String>,
    /// A binary memo, hex (a payment link's), instead of a text one.
    memo_hex: Option<String>,
    /// `"shielded"` or `"transparent"`: which balance pays. Within the
    /// shielded one, upstream picks the pools.
    from: String,
}

type WalletProposal = Proposal<StandardFeeRule, u32>;

fn spend_policy(from: &str) -> Result<SpendPolicy, String> {
    match from {
        "shielded" => Ok(SpendPolicy::shielded_pools([
            ShieldedPool::Sapling,
            ShieldedPool::Orchard,
            ShieldedPool::Ironwood,
        ])),
        "transparent" => Ok(SpendPolicy::shielded_pools([])
            .with_transparent(TransparentSpendPolicy::any_account_addr())),
        // Moving Orchard funds to Ironwood (product.md 2.9): upstream's pool
        // preference would otherwise spend Ironwood notes first.
        "orchard" => Ok(SpendPolicy::shielded_pools([ShieldedPool::Orchard])),
        _ => Err(format!("unknown source {from}")),
    }
}

fn request(send: &SendRequest, amount: Zatoshis) -> Result<TransactionRequest, String> {
    let to = ZcashAddress::try_from_encoded(&send.to)
        .map_err(|e| format!("not a Zcash address: {e}"))?;
    let text = send
        .memo
        .as_deref()
        .filter(|m| !m.is_empty())
        .map(|m| {
            m.parse::<Memo>()
                .map(|memo| MemoBytes::from(&memo))
                .map_err(|e| format!("{e:?}"))
        })
        .transpose()?;
    let binary = send
        .memo_hex
        .as_deref()
        .map(|m| {
            let bytes = hex::decode(m).map_err(|e| format!("memo isn't hex: {e}"))?;
            MemoBytes::from_bytes(&bytes).map_err(|e| format!("{e:?}"))
        })
        .transpose()?;
    let memo = match (text, binary) {
        (Some(_), Some(_)) => return Err("a send carries one memo".into()),
        (text, binary) => text.or(binary),
    };
    let payment =
        Payment::new(to, Some(amount), memo, None, None, vec![]).map_err(|e| format!("{e}"))?;
    TransactionRequest::new(vec![payment]).map_err(|e| format!("{e}"))
}

/// Upstream's `propose_transfer` with our wallet in place of its storage.
///
/// Ported from zcash_client_backend 0.24.0 `data_api/wallet.rs` lines 778–965,
/// which needs a full `WalletWrite`: a payment of a canonical ZIP 318
/// denomination into Ironwood is first tried as a canonical crossing (one
/// Orchard note, bucketed anchor) so it looks like a migration transfer, and
/// only otherwise planned normally. Re-port on every librustzcash bump.
///
/// TODO: call upstream's `propose_transfer` instead once it takes only an
/// `InputSource` (our `Wallet`); on every bump, check its bounds, or ask
/// upstream for that variant.
fn propose(
    wallet: &Wallet,
    send: &SendRequest,
    amount: Zatoshis,
) -> Result<WalletProposal, String> {
    let params = wallet.network;
    let request = request(send, amount)?;
    let spend_policy = spend_policy(&send.from)?;
    let policy = ConfirmationsPolicy::default();
    let target_height = TargetHeight::from(wallet.tip + 1);
    let anchor_height = policy.anchor_height(target_height);
    let zip318 = PoolMigrationParams::new(AnchorRetentionInterval::ZIP_318);
    let selector = GreedyInputSelector::<Wallet>::new();
    // A fully transparent send keeps its change transparent, on an internal
    // address: shielding it would need a proof and an anchor, cost more, and
    // move funds the user chose to send transparently (product.md 1).
    let change = SingleOutputChangeStrategy::<StandardFeeRule, Wallet>::new(
        StandardFeeRule::Zip317,
        None,
        ShieldedPool::Ironwood,
        DustOutputPolicy::default(),
    )
    .with_transparent_change_policy(TransparentChangePolicy::TransparentChangeAllowed);

    // The canonical-crossing attempt (upstream's `canonical_crossing_candidate`).
    let nu6_3 = params.activation_height(NetworkUpgrade::Nu6_3);
    let candidate = params.is_nu_active(NetworkUpgrade::Nu6_3, target_height.into())
        && request.payments().len() == 1
        && request.payments().values().all(|p| {
            p.amount()
                .is_some_and(zcash_protocol::zip318::is_canonical_denomination)
        });
    let canonical_fee =
        zcash_client_backend::fees::canonical_crossing_fee(&params, target_height.into()).ok();
    let bucketed = candidate
        .then_some(nu6_3)
        .flatten()
        .and_then(|activation| {
            policy.bucketed(zip318.anchor_bucket_interval(), target_height, activation)
        })
        .filter(|_| spend_policy.permits_shielded(ShieldedPool::Orchard));
    // Only if the tree root at the bucket boundary can be had.
    let bucketed = match bucketed {
        Some(b) => wallet
            .anchor_computable(ShieldedPool::Orchard, b.anchor_height(target_height))?
            .then_some(b),
        None => None,
    };
    let canonical = match bucketed.map(|bucketed| {
        let orchard_only = SpendPolicy::shielded_pools([ShieldedPool::Orchard])
            .with_locked_input_policy(spend_policy.locked_input_policy().clone())
            .with_note_selection(NoteSelection::PreferSingle);
        selector.propose_transaction(
            &params,
            wallet,
            target_height,
            bucketed.anchor_height(target_height),
            &zip318,
            bucketed,
            ACCOUNT,
            request.clone(),
            &change,
            &orchard_only,
            None,
        )
    }) {
        Some(Ok(proposal)) => (proposal.steps().len() == 1
            && canonical_fee
                .is_some_and(|fee| proposal.steps().first().is_canonical_crossing(&zip318, fee)))
        .then_some(proposal),
        Some(Err(InputSelectorError::InsufficientFunds { .. })) | None => None,
        Some(Err(e)) => return Err(e.to_string()),
    };

    let proposal = match canonical {
        Some(proposal) => proposal,
        None => selector
            .propose_transaction(
                &params,
                wallet,
                target_height,
                anchor_height,
                &zip318,
                policy,
                ACCOUNT,
                request,
                &change,
                &spend_policy,
                None,
            )
            .map_err(|e| e.to_string())?,
    };
    proposal
        .check_transaction_size()
        .map_err(|e| e.to_string())?;
    Ok(proposal)
}

/// Least a shielding may move: below it the fee eats too much of the value.
/// The previous app's rule, and the mobile Zcash SDKs' default.
const SHIELDING_THRESHOLD: Zatoshis = Zatoshis::const_from_u64(100_000);

/// Upstream's shielding: every transparent coin into the account's own
/// Ironwood, as change on its internal address.
fn propose_shield(
    wallet: &Wallet,
) -> Result<Proposal<StandardFeeRule, std::convert::Infallible>, String> {
    let params = wallet.network;
    let policy = ConfirmationsPolicy::default();
    let target_height = TargetHeight::from(wallet.tip + 1);
    let mut from: Vec<_> = wallet
        .utxos
        .iter()
        .map(|(o, _, _)| *o.recipient_address())
        .collect();
    from.sort_unstable();
    from.dedup();
    let change = SingleOutputChangeStrategy::<StandardFeeRule, Wallet>::new(
        StandardFeeRule::Zip317,
        None,
        ShieldedPool::Ironwood,
        DustOutputPolicy::default(),
    );
    let proposal = GreedyInputSelector::<Wallet>::new()
        .propose_shielding(
            &params,
            wallet,
            &change,
            SHIELDING_THRESHOLD,
            &from,
            ACCOUNT,
            target_height,
            policy.anchor_height(target_height),
            &PoolMigrationParams::new(AnchorRetentionInterval::ZIP_318),
            policy,
            zcash_client_backend::data_api::CoinbaseFilter::default(),
        )
        .map_err(|e| e.to_string())?;
    proposal
        .check_transaction_size()
        .map_err(|e| e.to_string())?;
    Ok(proposal)
}

/// The largest amount upstream will plan: its own fees decide, so this only
/// searches. ponytail: ~40 plans per call. TODO: switch to upstream's
/// `propose_send_max_transfer` once it takes only an `InputSource` (0.24's
/// needs `WalletWrite`; the `propose_send_max` it wraps is crate-private).
fn max_amount(wallet: &Wallet, send: &SendRequest) -> Result<u64, String> {
    let plans = |amount: u64| -> Result<Option<WalletProposal>, String> {
        let amount = Zatoshis::from_u64(amount).map_err(|_| "amount out of range")?;
        Ok(propose(wallet, send, amount).ok())
    };
    let (mut low, mut high) = (0u64, wallet.total(&send.from) + 1);
    while low + 1 < high {
        let mid = low + (high - low) / 2;
        if plans(mid)?.is_some() {
            low = mid;
        } else {
            high = mid;
        }
    }
    // The search assumes that whatever is below a plannable amount plans too.
    // Spending everything with nothing left over breaks that: no change output
    // means fewer actions and a lower fee, so that amount can sit above ones
    // that fail. Try it for each fee `low`'s plan could come down to, largest
    // amount first.
    let Some(plan) = plans(low)? else {
        return Ok(low);
    };
    let summary = summarize(&plan);
    let inputs: u64 = summary
        .steps
        .iter()
        .flat_map(|s| &s.inputs)
        .map(|f| f.value)
        .sum();
    let marginal = u64::from(MARGINAL_FEE);
    for fee in (2..=summary.fee / marginal).map(|k| k * marginal) {
        match inputs.checked_sub(fee) {
            Some(amount) if amount > low => {
                if plans(amount)?.is_some() {
                    return Ok(amount);
                }
            }
            _ => break,
        }
    }
    Ok(low)
}

fn pool_name(pool: PoolType) -> &'static str {
    match pool {
        PoolType::Transparent => "transparent",
        PoolType::Shielded(ShieldedPool::Sapling) => "sapling",
        PoolType::Shielded(ShieldedPool::Orchard) => "orchard",
        PoolType::Shielded(ShieldedPool::Ironwood) => "ironwood",
    }
}

#[derive(Serialize)]
struct Flow {
    pool: &'static str,
    value: u64,
}

/// A note a plan spends: its witness needs its pool's tree at `position`.
#[derive(Serialize)]
struct Spent {
    pool: &'static str,
    position: u64,
}

/// One transaction of a plan: what it spends, pays, keeps as change, and costs.
#[derive(Serialize)]
struct StepSummary {
    inputs: Vec<Flow>,
    notes: Vec<Spent>,
    payments: Vec<Flow>,
    change: Vec<Flow>,
    fee: u64,
}

#[derive(Serialize)]
struct PlanSummary {
    steps: Vec<StepSummary>,
    fee: u64,
}

fn summarize<N>(proposal: &Proposal<StandardFeeRule, N>) -> PlanSummary {
    let steps: Vec<_> = proposal
        .steps()
        .iter()
        .map(|step| {
            let mut inputs: Vec<_> = step
                .transparent_inputs()
                .iter()
                .map(|o| Flow {
                    pool: "transparent",
                    value: o.value().into(),
                })
                .collect();
            let mut notes = Vec::new();
            if let Some(shielded) = step.shielded_inputs() {
                for n in shielded.notes() {
                    let pool = pool_name(PoolType::Shielded(n.note().pool()));
                    inputs.push(Flow {
                        pool,
                        value: n.note().value().into(),
                    });
                    notes.push(Spent {
                        pool,
                        position: n.note_commitment_tree_position().into(),
                    });
                }
            }
            let request = step.transaction_request();
            let payments = step
                .payment_pools()
                .iter()
                .map(|(i, pool)| Flow {
                    pool: pool_name(*pool),
                    value: request
                        .payments()
                        .get(i)
                        .and_then(|p| p.amount())
                        .map_or(0, u64::from),
                })
                .collect();
            let change = step
                .balance()
                .proposed_change()
                .iter()
                .map(|c| Flow {
                    pool: pool_name(c.output_pool()),
                    value: c.value().into(),
                })
                .collect();
            StepSummary {
                inputs,
                notes,
                payments,
                change,
                fee: step.balance().fee_required().into(),
            }
        })
        .collect();
    PlanSummary {
        fee: steps.iter().map(|s| s.fee).sum(),
        steps,
    }
}

fn inputs(network: &str, wallet: JsValue, send: JsValue) -> Result<(Wallet, SendRequest), String> {
    let network = parse_network(network)?;
    let data: WalletData = serde_wasm_bindgen::from_value(wallet).map_err(|e| e.to_string())?;
    let send: SendRequest = serde_wasm_bindgen::from_value(send).map_err(|e| e.to_string())?;
    Ok((Wallet::new(network, &data)?, send))
}

/// Plans a send: `wallet` is `{ tip, notes, utxos }` (unspent only), `send`
/// is `{ to, amount, memo?, from }`. Returns `{ steps: [{ inputs, payments,
/// change, fee }], fee }`, values in zatoshis.
#[wasm_bindgen]
pub fn plan_send(network: &str, wallet: JsValue, send: JsValue) -> Result<JsValue, JsError> {
    let (wallet, send) = inputs(network, wallet, send).map_err(|e| JsError::new(&e))?;
    let amount =
        Zatoshis::from_u64(send.amount).map_err(|_| JsError::new("amount out of range"))?;
    let proposal = propose(&wallet, &send, amount).map_err(|e| JsError::new(&e))?;
    serde_wasm_bindgen::to_value(&summarize(&proposal)).map_err(|e| JsError::new(&e.to_string()))
}

/// The unsigned PCZT for `send`, planned as [`plan_send`] plans it, for the
/// seed account (`seed_fingerprint`, `hd_index`) behind `ufvk`. `trees` maps
/// each pool spent from to `{ tip, chunks: { [chunk]: body } }`: ziziphus's
/// raw tip snapshot and the frozen chunks holding the notes `plan_send` named.
/// A plan with transparent change sends it to internal address `change_index`,
/// which the caller keeps unused.
#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn send_pczt(
    network: &str,
    ufvk: &str,
    seed_fingerprint: &str,
    hd_index: u32,
    wallet: JsValue,
    send: JsValue,
    trees: JsValue,
    change_index: Option<u32>,
) -> Result<Vec<u8>, JsError> {
    let (wallet, send) = inputs(network, wallet, send).map_err(|e| JsError::new(&e))?;
    let trees: crate::build::Trees =
        serde_wasm_bindgen::from_value(trees).map_err(|e| JsError::new(&e.to_string()))?;
    let ufvk = zcash_keys::keys::UnifiedFullViewingKey::decode(&wallet.network, ufvk)
        .map_err(|e| JsError::new(&e))?;
    let fingerprint = crate::hex_n::<32>(seed_fingerprint).map_err(|e| JsError::new(&e))?;
    let amount =
        Zatoshis::from_u64(send.amount).map_err(|_| JsError::new("amount out of range"))?;
    let proposal = propose(&wallet, &send, amount).map_err(|e| JsError::new(&e))?;
    let pczt = crate::build::pczt(
        &wallet,
        &ufvk,
        fingerprint,
        hd_index,
        &proposal,
        &trees,
        change_index,
    )
    .map_err(|e| JsError::new(&e))?;
    pczt.serialize()
        .map_err(|e| JsError::new(&format!("{e:?}")))
}

/// Plans shielding every transparent coin: the same summary as [`plan_send`],
/// with the shielded value as change.
#[wasm_bindgen]
pub fn plan_shield(network: &str, wallet: JsValue) -> Result<JsValue, JsError> {
    let wallet = shield_wallet(network, wallet).map_err(|e| JsError::new(&e))?;
    let proposal = propose_shield(&wallet).map_err(|e| JsError::new(&e))?;
    serde_wasm_bindgen::to_value(&summarize(&proposal)).map_err(|e| JsError::new(&e.to_string()))
}

/// The unsigned PCZT shielding every transparent coin, planned as
/// [`plan_shield`] plans it; `trees` as for [`send_pczt`].
#[wasm_bindgen]
pub fn shield_pczt(
    network: &str,
    ufvk: &str,
    seed_fingerprint: &str,
    hd_index: u32,
    wallet: JsValue,
    trees: JsValue,
) -> Result<Vec<u8>, JsError> {
    let wallet = shield_wallet(network, wallet).map_err(|e| JsError::new(&e))?;
    let trees: crate::build::Trees =
        serde_wasm_bindgen::from_value(trees).map_err(|e| JsError::new(&e.to_string()))?;
    let ufvk = zcash_keys::keys::UnifiedFullViewingKey::decode(&wallet.network, ufvk)
        .map_err(|e| JsError::new(&e))?;
    let fingerprint = crate::hex_n::<32>(seed_fingerprint).map_err(|e| JsError::new(&e))?;
    let proposal = propose_shield(&wallet).map_err(|e| JsError::new(&e))?;
    let pczt = crate::build::pczt(
        &wallet,
        &ufvk,
        fingerprint,
        hd_index,
        &proposal,
        &trees,
        None,
    )
    .map_err(|e| JsError::new(&e))?;
    pczt.serialize()
        .map_err(|e| JsError::new(&format!("{e:?}")))
}

fn shield_wallet(network: &str, wallet: JsValue) -> Result<Wallet, String> {
    let network = parse_network(network)?;
    let data: WalletData = serde_wasm_bindgen::from_value(wallet).map_err(|e| e.to_string())?;
    Wallet::new(network, &data)
}

/// What `from` (`"shielded"` or `"transparent"`) can spend before fees, in
/// zatoshis: `{ now, later }`, `later` once every note is confirmed. Dust,
/// which [`plan_send`] never picks, counts in neither.
#[wasm_bindgen]
pub fn spendable(network: &str, wallet: JsValue, from: &str) -> Result<JsValue, JsError> {
    let wallet = shield_wallet(network, wallet).map_err(|e| JsError::new(&e))?;
    let (now, later) = wallet.spendable(from);
    serde_wasm_bindgen::to_value(&Spendable { now, later })
        .map_err(|e| JsError::new(&e.to_string()))
}

#[derive(Serialize)]
struct Spendable {
    now: u64,
    later: u64,
}

/// The most `send` (its `amount` ignored) can pay after fees, in zatoshis.
#[wasm_bindgen]
pub fn max_send(network: &str, wallet: JsValue, send: JsValue) -> Result<u64, JsError> {
    let (wallet, send) = inputs(network, wallet, send).map_err(|e| JsError::new(&e))?;
    max_amount(&wallet, &send).map_err(|e| JsError::new(&e))
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::wallet::{NoteData, UtxoData};
    use orchard::note::{RandomSeed, Rho};
    use zcash_keys::keys::UnifiedSpendingKey;
    use zcash_protocol::consensus::Network;
    use zip32::{AccountId, Scope};

    pub(crate) const SEED: [u8; 32] = [7u8; 32];
    pub(crate) const TIP: u32 = 3_450_000;

    pub(crate) fn plan_shield(
        wallet: &Wallet,
    ) -> Proposal<StandardFeeRule, std::convert::Infallible> {
        propose_shield(wallet).unwrap()
    }

    /// Plans `amount` from the shielded balance to `to`.
    pub(crate) fn plan(wallet: &Wallet, to: &str, amount: u64) -> WalletProposal {
        propose(
            wallet,
            &send(to, amount),
            Zatoshis::from_u64(amount).unwrap(),
        )
        .unwrap()
    }

    /// An Ironwood note of `value` to our own address, mined at `height`.
    pub(crate) fn ironwood_note(value: u64, height: u32, position: u64) -> NoteData {
        orchard_family_note("ironwood", Scope::External, value, height, position)
    }

    /// An Orchard (`"orchard"`, V2) or Ironwood (V3) note of `value` to our
    /// own address on `scope`, mined at `height`.
    pub(crate) fn orchard_family_note(
        pool: &str,
        scope: Scope,
        value: u64,
        height: u32,
        position: u64,
    ) -> NoteData {
        let usk =
            UnifiedSpendingKey::from_seed(&Network::MainNetwork, &SEED, AccountId::ZERO).unwrap();
        let fvk = usk.to_unified_full_viewing_key().orchard().unwrap().clone();
        let rho = Rho::from_bytes(&[position as u8 + 1; 32].map(|b| b & 0x3f)).unwrap();
        let rseed = RandomSeed::from_bytes([position as u8; 32], &rho).unwrap();
        let version = if pool == "orchard" {
            orchard::NoteVersion::V2
        } else {
            orchard::NoteVersion::V3
        };
        let note = orchard::Note::from_parts(
            fvk.address_at(0u32, scope),
            orchard::value::NoteValue::from_raw(value),
            rho,
            rseed,
            version,
        )
        .unwrap();
        let mut data =
            NoteData::for_tests(pool, crate::notes::encode_orchard(&note), position, height);
        if scope == Scope::Internal {
            data.set_internal();
        }
        data
    }

    fn wallet(notes: Vec<NoteData>) -> Wallet {
        Wallet::new(
            Network::MainNetwork,
            &WalletData {
                tip: TIP,
                notes,
                utxos: Vec::<UtxoData>::new(),
            },
        )
        .unwrap()
    }

    fn send(to: &str, amount: u64) -> SendRequest {
        SendRequest {
            to: to.into(),
            amount,
            memo: None,
            memo_hex: None,
            from: "shielded".into(),
        }
    }

    #[test]
    fn plans_a_shielded_payment_with_upstream_fees() {
        let wallet = wallet(vec![ironwood_note(200_000, TIP - 100, 1)]);
        let to =
            crate::transparent_tx::derive(&Network::MainNetwork, &wallet_ufvk(), "external", 5, 1)
                .unwrap()
                .remove(0);
        let plan = summarize(
            &propose(
                &wallet,
                &send(&to, 50_000),
                Zatoshis::from_u64(50_000).unwrap(),
            )
            .unwrap(),
        );
        assert_eq!(plan.steps.len(), 1);
        let step = &plan.steps[0];
        assert_eq!((step.inputs.len(), step.inputs[0].pool), (1, "ironwood"));
        assert_eq!(step.payments[0].pool, "transparent");
        // Whatever upstream charged, value is conserved and change goes to Ironwood.
        assert_eq!(step.change[0].pool, "ironwood");
        assert_eq!(50_000 + step.change[0].value + step.fee, 200_000);
    }

    #[test]
    fn refuses_what_it_cannot_fund_and_unconfirmed_notes() {
        let wallet_ = wallet(vec![ironwood_note(200_000, TIP, 1)]);
        let to =
            crate::transparent_tx::derive(&Network::MainNetwork, &wallet_ufvk(), "external", 5, 1)
                .unwrap()
                .remove(0);
        // Mined at the tip: not confirmed enough to spend.
        assert!(propose(
            &wallet_,
            &send(&to, 50_000),
            Zatoshis::from_u64(50_000).unwrap()
        )
        .is_err());
        let wallet_ = wallet(vec![ironwood_note(200_000, TIP - 100, 1)]);
        assert!(propose(
            &wallet_,
            &send(&to, 300_000),
            Zatoshis::from_u64(300_000).unwrap()
        )
        .is_err());
    }

    #[test]
    fn max_send_leaves_only_the_fee() {
        let wallet = wallet(vec![
            ironwood_note(200_000, TIP - 100, 1),
            ironwood_note(100_000, TIP - 90, 2),
        ]);
        let to =
            crate::transparent_tx::derive(&Network::MainNetwork, &wallet_ufvk(), "external", 5, 1)
                .unwrap()
                .remove(0);
        let max = max_amount(&wallet, &send(&to, 0)).unwrap();
        let plan = summarize(
            &propose(&wallet, &send(&to, max), Zatoshis::from_u64(max).unwrap()).unwrap(),
        );
        assert!(plan.steps[0].change.iter().all(|c| c.value == 0));
        assert_eq!(max + plan.fee, 300_000);
        assert!(propose(
            &wallet,
            &send(&to, max + 1),
            Zatoshis::from_u64(max + 1).unwrap()
        )
        .is_err());
    }

    #[test]
    fn max_send_spends_everything_when_that_needs_no_change() {
        let ufvk = wallet_ufvk();
        let derive = |index| {
            crate::transparent_tx::derive(&Network::MainNetwork, &ufvk, "external", index, 1)
                .unwrap()
                .remove(0)
        };
        let data = WalletData {
            tip: TIP,
            notes: vec![],
            utxos: vec![UtxoData::for_tests(&derive(0), 200_000, 0, TIP - 50)],
        };
        let wallet = Wallet::new(Network::MainNetwork, &data).unwrap();
        let request = SendRequest {
            to: derive(5),
            amount: 0,
            memo: None,
            memo_hex: None,
            from: "transparent".into(),
        };
        // 190,000 + the 10,000 fee is the whole coin: no change, no shielded
        // part. Amounts just below it leave change too small to carry.
        let max = max_amount(&wallet, &request).unwrap();
        assert_eq!(max, 190_000);
        let plan =
            summarize(&propose(&wallet, &request, Zatoshis::from_u64(max).unwrap()).unwrap());
        assert!(plan.steps[0].change.is_empty());
    }

    #[test]
    fn migrating_moves_every_orchard_note_into_ironwood_and_nothing_else() {
        // Upstream would spend the Ironwood note first; the Orchard source
        // leaves it alone.
        let wallet = wallet(vec![
            ironwood_note(200_000, TIP - 100, 1),
            orchard_family_note("orchard", Scope::External, 100_000, TIP - 90, 2),
            orchard_family_note("orchard", Scope::Internal, 50_000, TIP - 80, 3),
        ]);
        let request = SendRequest {
            to: crate::keys::fresh(&Network::MainNetwork, &wallet_ufvk()).unwrap(),
            amount: 0,
            memo: None,
            memo_hex: None,
            from: "orchard".into(),
        };
        let max = max_amount(&wallet, &request).unwrap();
        let plan =
            summarize(&propose(&wallet, &request, Zatoshis::from_u64(max).unwrap()).unwrap());
        let step = &plan.steps[0];
        assert!(step.inputs.iter().all(|i| i.pool == "orchard"));
        assert_eq!(step.inputs.len(), 2);
        assert_eq!(step.payments[0].pool, "ironwood");
        assert!(step.change.iter().all(|c| c.value == 0));
        assert_eq!(max + plan.fee, 150_000);
    }

    #[test]
    fn a_payment_link_is_funded_in_ironwood_with_its_binary_memo() {
        let key = crate::link::tests::key();
        let link = crate::link::tests::address(&key);
        let memo = format!("ff{}", hex::encode(b"PAYLINK"));
        // Even when only Orchard money pays for it.
        let wallet = wallet(vec![orchard_family_note(
            "orchard",
            Scope::External,
            200_000,
            TIP - 100,
            1,
        )]);
        let mut request = send(&link, 60_000);
        request.memo_hex = Some(memo.clone());
        let proposal = propose(&wallet, &request, Zatoshis::from_u64(60_000).unwrap()).unwrap();
        let step = &summarize(&proposal).steps[0];
        assert_eq!(step.payments[0].pool, "ironwood");
        let payment = proposal.steps().first().transaction_request().payments()[&0].clone();
        assert_eq!(
            &payment.memo().unwrap().as_slice()[..8],
            &hex::decode(&memo).unwrap()[..]
        );

        request.memo = Some("hi".into());
        assert!(propose(&wallet, &request, Zatoshis::from_u64(60_000).unwrap()).is_err());
    }

    #[test]
    fn a_memo_to_a_transparent_address_is_refused() {
        let wallet = wallet(vec![ironwood_note(200_000, TIP - 100, 1)]);
        let to =
            crate::transparent_tx::derive(&Network::MainNetwork, &wallet_ufvk(), "external", 5, 1)
                .unwrap()
                .remove(0);
        let mut request = send(&to, 50_000);
        request.memo = Some("hi".into());
        assert!(propose(&wallet, &request, Zatoshis::from_u64(50_000).unwrap()).is_err());
    }

    #[test]
    fn plans_a_payment_from_the_transparent_balance() {
        let ufvk = wallet_ufvk();
        let ours = crate::transparent_tx::derive(&Network::MainNetwork, &ufvk, "external", 0, 1)
            .unwrap()
            .remove(0);
        let utxo = |value, index| UtxoData::for_tests(&ours, value, index, TIP - 50);
        let data = WalletData {
            tip: TIP,
            notes: vec![],
            utxos: vec![utxo(30_000, 0), utxo(200_000, 1)],
        };
        let wallet = Wallet::new(Network::MainNetwork, &data).unwrap();
        let to = crate::transparent_tx::derive(&Network::MainNetwork, &ufvk, "external", 5, 1)
            .unwrap()
            .remove(0);
        let request = SendRequest {
            to,
            amount: 50_000,
            memo: None,
            memo_hex: None,
            from: "transparent".into(),
        };
        let plan =
            summarize(&propose(&wallet, &request, Zatoshis::from_u64(50_000).unwrap()).unwrap());
        let step = &plan.steps[0];
        // The largest coin alone covers it.
        assert_eq!(
            step.inputs
                .iter()
                .map(|f| (f.pool, f.value))
                .collect::<Vec<_>>(),
            [("transparent", 200_000)]
        );
        let change: u64 = step.change.iter().map(|c| c.value).sum();
        assert_eq!(50_000 + change + step.fee, 200_000);
        // All transparent: the change stays transparent, and with no shielded
        // part the fee is ZIP 317's floor.
        assert_eq!(
            step.change.iter().map(|c| c.pool).collect::<Vec<_>>(),
            ["transparent"]
        );
        assert_eq!(step.fee, 10_000);
    }

    /// Plans moving every Orchard note to one of our own addresses: a migration.
    pub(crate) fn plan_migration(wallet: &Wallet) -> WalletProposal {
        let request = SendRequest {
            to: crate::keys::fresh(&wallet.network, &wallet_ufvk()).unwrap(),
            amount: 0,
            memo: None,
            memo_hex: None,
            from: "orchard".into(),
        };
        let max = max_amount(wallet, &request).unwrap();
        propose(wallet, &request, Zatoshis::from_u64(max).unwrap()).unwrap()
    }

    /// Plans `amount` from the transparent balance to `to`.
    pub(crate) fn plan_from_transparent(wallet: &Wallet, to: &str, amount: u64) -> WalletProposal {
        let request = SendRequest {
            to: to.into(),
            amount,
            memo: None,
            memo_hex: None,
            from: "transparent".into(),
        };
        propose(wallet, &request, Zatoshis::from_u64(amount).unwrap()).unwrap()
    }

    pub(crate) fn wallet_ufvk() -> String {
        UnifiedSpendingKey::from_seed(&Network::MainNetwork, &SEED, AccountId::ZERO)
            .unwrap()
            .to_unified_full_viewing_key()
            .encode(&Network::MainNetwork)
    }
}
