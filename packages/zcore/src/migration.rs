//! ZIP 318's plan for moving Orchard funds to Ironwood with privacy: the
//! balance split into standard amounts, the preparation transactions that
//! create a note of each, and when each step is due. The user sends each step
//! when it's due (docs/design/migration.md); a transfer is an ordinary send
//! of its amount from its note, which `send.rs` plans as a crossing.
//!
//! Upstream (zcash_protocol 0.10 `zip318`, zcash_client_backend 0.24) has the
//! constants, the fee and the denomination series but no planner; this
//! follows the ZIP's text on top of them. TODO: switch to upstream's planner
//! if one lands.

use std::collections::BTreeMap;
use std::sync::atomic::{AtomicBool, Ordering};

use nonempty::NonEmpty;
use rand_core::{OsRng, RngCore};
use serde::Serialize;
use wasm_bindgen::prelude::*;
use zcash_client_backend::data_api::wallet::{ConfirmationsPolicy, TargetHeight};
use zcash_client_backend::fees::{
    canonical_crossing_fee, ChangeValue, StandardFeeRule, TransactionBalance,
};
use zcash_client_backend::proposal::{Proposal, ShieldedInputs};
use zcash_client_backend::zip321::TransactionRequest;
use zcash_primitives::transaction::fees::transparent::InputSize;
use zcash_primitives::transaction::fees::zip317::FeeRule;
use zcash_primitives::transaction::fees::FeeRule as _;
use zcash_protocol::consensus::{BlockHeight, Network, NetworkUpgrade, Parameters};
use zcash_protocol::value::Zatoshis;
use zcash_protocol::zip318::{
    largest_one_two_five, AnchorBucketInterval, PoolMigrationConstants, DENOM_CAP,
    MAX_RESIDUAL_VALUE, PREP_DELAY_CAP, PREP_DELAY_MEAN, PREP_TX_ACTIONS, TRANSFER_DELAY_CAP,
    TRANSFER_DELAY_MEAN,
};

use crate::wallet::{Wallet, WalletData};

/// Blocks between a step's broadcast and its notes being mined.
// ponytail: a guess at the ZIP's "small mining margin"; a step that comes due
// before its notes can anchor waits (the app asks zcore again).
const MINING_MARGIN: u32 = 5;

static TEST_AMOUNTS: AtomicBool = AtomicBool::new(false);

/// Dev only: plans and recognises migration amounts of 0.001–0.002 ZEC, so a
/// wallet with little Orchard can try preparations and several transfers.
/// Such transfers don't blend in with anyone's; never for real use.
#[wasm_bindgen]
pub fn use_migration_test_amounts(on: bool) {
    TEST_AMOUNTS.store(on, Ordering::Relaxed);
}

/// The test amounts: 0.001 and 0.002 ZEC.
struct TestAmounts;

impl PoolMigrationConstants for TestAmounts {
    fn denomination_cap(&self) -> Zatoshis {
        Zatoshis::const_from_u64(200_000)
    }

    fn max_residual_value(&self) -> Zatoshis {
        Zatoshis::const_from_u64(100_000)
    }
}

/// ZIP 318's constants, or the test amounts while they're on.
// ponytail: a process-wide switch for a dev-only setting; pass it through the
// calls if it ever has to differ between them.
pub(crate) struct Grid;

impl PoolMigrationConstants for Grid {
    fn denomination_cap(&self) -> Zatoshis {
        if TEST_AMOUNTS.load(Ordering::Relaxed) {
            TestAmounts.denomination_cap()
        } else {
            DENOM_CAP
        }
    }

    fn max_residual_value(&self) -> Zatoshis {
        if TEST_AMOUNTS.load(Ordering::Relaxed) {
            TestAmounts.max_residual_value()
        } else {
            MAX_RESIDUAL_VALUE
        }
    }
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Transfer {
    /// What arrives in Ironwood: a standard amount.
    value: u64,
    /// When it's due, as an estimated block height.
    height: u32,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MigrationPlan {
    /// The chain tip the estimated heights count from.
    tip: u32,
    /// Spendable Orchard funds the plan starts from.
    orchard: u64,
    /// When each preparation is due, estimated.
    preparations: Vec<u32>,
    /// In the order they're sent.
    transfers: Vec<Transfer>,
    transfer_fee: u64,
    preparation_fee: u64,
    /// What stays in Orchard: too little to make another standard amount.
    left: u64,
}

/// ZIP 318's quantization: the largest standard amount that fits, again and
/// again, which expands each decimal digit into 5s, 2s and 1s of its place.
fn quantize(mut value: u64, grid: &impl PoolMigrationConstants) -> Vec<u64> {
    let (floor, cap) = (
        grid.max_residual_value().into_u64(),
        grid.denomination_cap().into_u64(),
    );
    let mut parts = vec![];
    while value >= floor {
        let part = largest_one_two_five(value.min(cap), floor);
        parts.push(part);
        value -= part;
    }
    parts
}

/// A delay in blocks from an exponential distribution with mean `mean`,
/// redrawn above `cap`, as ZIP 318 draws every gap in the schedule.
fn delay(rng: &mut impl RngCore, mean: u32, cap: u32) -> u32 {
    loop {
        let u = (rng.next_u64() >> 11) as f64 / (1u64 << 53) as f64;
        let draw = (-f64::from(mean) * (1.0 - u).ln()).round();
        if draw <= f64::from(cap) {
            return draw as u32;
        }
    }
}

/// Notes a preparation spends at most, so it has room for a part and change.
const PREP_INPUTS: usize = PREP_TX_ACTIONS - 2;

/// How many 16-action preparations turn `notes` notes into `parts` notes. A
/// spend and an output never share an Orchard action since NU6.3; each
/// preparation keeps one change note, which the next one spends.
// ponytail: counts actions only; more than 14 notes to start from take more
// preparations than this says, and their fees come out of the leftover.
fn preparations(notes: usize, parts: usize) -> usize {
    (notes + parts)
        .saturating_sub(1)
        .div_ceil(PREP_TX_ACTIONS - 2)
        .max(1)
}

/// The first height at which a transaction can anchor to a bucket boundary at
/// or above `mined`: upstream anchors one whole bucket below the newest
/// boundary under its confirmations.
fn anchorable(mined: u32) -> u32 {
    let bucket = AnchorBucketInterval::ZIP_318;
    u32::from(bucket.boundary_at_or_above(BlockHeight::from(mined)))
        + bucket.block_count().get()
        + u32::from(ConfirmationsPolicy::default().trusted())
}

/// A preparation's fee: ZIP 317 for its 16 actions.
fn preparation_fee(network: &Network, target: BlockHeight) -> Result<u64, String> {
    FeeRule::standard()
        .fee_required(
            network,
            target,
            std::iter::empty::<InputSize>(),
            std::iter::empty::<usize>(),
            0,
            0,
            PREP_TX_ACTIONS,
            0,
        )
        .map(Zatoshis::into_u64)
        .map_err(|e| format!("{e:?}"))
}

fn transfer_fee(network: &Network, target: BlockHeight) -> Result<u64, String> {
    canonical_crossing_fee(network, target)
        .map(Zatoshis::into_u64)
        .map_err(|e| format!("{e:?}"))
}

pub(crate) fn plan(
    wallet: &Wallet,
    rng: &mut impl RngCore,
    grid: &impl PoolMigrationConstants,
) -> Result<MigrationPlan, String> {
    let notes = wallet.spendable_orchard();
    let orchard: u64 = notes.iter().sum();
    let target = BlockHeight::from(u32::from(wallet.tip) + 1);
    let transfer_fee = transfer_fee(&wallet.network, target)?;
    let preparation_fee = preparation_fee(&wallet.network, target)?;

    // The fees come out of the balance before it's split: shrink what's
    // split until the parts, their fees and the preparations' fit.
    let mut value = orchard;
    let (parts, preps) = loop {
        let parts = quantize(value, grid);
        if parts.is_empty() {
            break (parts, 0);
        }
        let preps = preparations(notes.len(), parts.len());
        let cost = parts.iter().sum::<u64>()
            + parts.len() as u64 * transfer_fee
            + preps as u64 * preparation_fee;
        if cost <= orchard {
            break (parts, preps);
        }
        value -= (cost - orchard).min(value);
    };
    let spent = parts.iter().sum::<u64>()
        + parts.len() as u64 * transfer_fee
        + preps as u64 * preparation_fee;

    let mut parts = parts;
    // Shuffled, so the order of amounts says nothing about the balance.
    for i in (1..parts.len()).rev() {
        parts.swap(i, (rng.next_u64() % (i as u64 + 1)) as usize);
    }

    // Each preparation after the first spends the previous one's change, so
    // waits until that can anchor; the transfers wait for the last one's.
    let activation = wallet
        .network
        .activation_height(NetworkUpgrade::Nu6_3)
        .map_or(0, u32::from);
    let after = |mined: u32| anchorable((mined + MINING_MARGIN).max(activation + 1));
    let mut preparations: Vec<u32> = vec![];
    for _ in 0..preps {
        let height = match preparations.last() {
            None => u32::from(target),
            Some(&last) => {
                (last + delay(rng, PREP_DELAY_MEAN.get(), PREP_DELAY_CAP.get())).max(after(last))
            }
        };
        preparations.push(height);
    }
    let mut height = preparations.last().map_or(u32::from(target), |&h| after(h));
    let transfers = parts
        .into_iter()
        .enumerate()
        .map(|(i, value)| {
            if i > 0 {
                height += delay(rng, TRANSFER_DELAY_MEAN.get(), TRANSFER_DELAY_CAP.get());
            }
            Transfer { value, height }
        })
        .collect();

    Ok(MigrationPlan {
        tip: u32::from(wallet.tip),
        orchard,
        preparations,
        transfers,
        transfer_fee,
        preparation_fee,
        left: orchard - spent,
    })
}

/// The next preparation, as of `wallet`'s tip: it spends the largest Orchard
/// notes that can anchor at the bucket boundary (at most 14), makes a note
/// worth each of `parts` plus a transfer's fee, in order, while they fit, and
/// keeps the rest as change. Returns how many parts it makes.
pub(crate) fn preparation(
    wallet: &Wallet,
    parts: &[u64],
) -> Result<(Proposal<StandardFeeRule, u32>, usize), String> {
    let network = wallet.network;
    let target = TargetHeight::from(wallet.tip + 1);
    let height = BlockHeight::from(target);
    let activation = network
        .activation_height(NetworkUpgrade::Nu6_3)
        .ok_or("NU6.3 isn't scheduled on this network")?;
    let policy = ConfirmationsPolicy::default()
        .bucketed(AnchorBucketInterval::ZIP_318, target, activation)
        .ok_or("no bucket boundary to anchor to yet")?;
    let fee = preparation_fee(&network, height)?;
    let transfer_fee = transfer_fee(&network, height)?;

    let notes: Vec<_> = wallet
        .orchard_notes(target, policy)
        .into_iter()
        .take(PREP_INPUTS)
        .collect();
    let notes = NonEmpty::from_vec(notes).ok_or("not ready: no Orchard note can anchor yet")?;
    let total: u64 = notes.iter().map(|n| n.note().value().into_u64()).sum();
    let mut left = total
        .checked_sub(fee)
        .ok_or("too little in Orchard for a preparation")?;
    let room = PREP_TX_ACTIONS - notes.len() - 1;
    let mut outputs = vec![];
    for part in parts.iter().take(room) {
        let need = part + transfer_fee;
        if need > left {
            break;
        }
        outputs.push(need);
        left -= need;
    }
    let made = outputs.len();
    if made == 0 {
        return Err("not ready: the Orchard notes that can anchor are too small".into());
    }
    if left > 0 {
        outputs.push(left);
    }
    let change = outputs
        .into_iter()
        .map(|v| {
            Zatoshis::from_u64(v)
                .map(|v| ChangeValue::orchard(v, None))
                .map_err(|_| "value out of range".to_string())
        })
        .collect::<Result<_, _>>()?;
    let balance = TransactionBalance::new(
        change,
        Zatoshis::from_u64(fee).map_err(|_| "fee out of range")?,
    )
    .map_err(|e| format!("{e:?}"))?;
    let proposal = Proposal::single_step(
        TransactionRequest::empty(),
        BTreeMap::new(),
        vec![],
        Some(ShieldedInputs::from_parts(notes)),
        policy.anchor_height(target),
        balance,
        StandardFeeRule::Zip317,
        target,
        policy,
        false,
        network.is_nu_active(NetworkUpgrade::Nu6_3, height),
    )
    .map_err(|e| format!("{e:?}"))?;
    Ok((proposal, made))
}

/// The plan for moving every spendable Orchard note to Ironwood with
/// privacy, as of `wallet`'s tip; each call draws a new order and timing.
#[wasm_bindgen]
pub fn plan_migration(network: &str, wallet: JsValue) -> Result<JsValue, JsError> {
    let network = crate::parse_network(network).map_err(|e| JsError::new(&e))?;
    let data: WalletData =
        serde_wasm_bindgen::from_value(wallet).map_err(|e| JsError::new(&e.to_string()))?;
    let wallet = Wallet::new(network, &data).map_err(|e| JsError::new(&e))?;
    let plan = plan(&wallet, &mut OsRng, &Grid).map_err(|e| JsError::new(&e))?;
    serde_wasm_bindgen::to_value(&plan).map_err(|e| JsError::new(&e.to_string()))
}

#[derive(Serialize)]
struct PreparationPlan {
    plan: crate::send::PlanSummary,
    /// How many of the parts asked for it makes, from the first.
    made: usize,
}

fn read_wallet(network: &str, wallet: JsValue) -> Result<Wallet, String> {
    let network = crate::parse_network(network)?;
    let data: WalletData = serde_wasm_bindgen::from_value(wallet).map_err(|e| e.to_string())?;
    Wallet::new(network, &data)
}

/// The next preparation for `parts` (each a transfer's amount) still without
/// a note: `{ plan, made }`, its plan as `plan_send` reports one and how many
/// parts it makes. Errors starting "not ready" mean waiting for older notes.
#[wasm_bindgen]
pub fn plan_preparation(
    network: &str,
    wallet: JsValue,
    parts: Vec<u64>,
) -> Result<JsValue, JsError> {
    let wallet = read_wallet(network, wallet).map_err(|e| JsError::new(&e))?;
    let (proposal, made) = preparation(&wallet, &parts).map_err(|e| JsError::new(&e))?;
    let mut plan = crate::send::summarize(&proposal);
    plan.bucket = crate::build::bucket(
        proposal.steps().first(),
        &wallet.network,
        BlockHeight::from(proposal.min_target_height()),
    )
    .map(u32::from);
    serde_wasm_bindgen::to_value(&PreparationPlan { plan, made })
        .map_err(|e| JsError::new(&e.to_string()))
}

/// The unsigned PCZT of the preparation [`plan_preparation`] plans, for the
/// seed account (`seed_fingerprint`, `hd_index`) behind `ufvk`; `trees` as
/// `send_pczt` takes them.
#[wasm_bindgen]
pub fn preparation_pczt(
    network: &str,
    ufvk: &str,
    seed_fingerprint: &str,
    hd_index: u32,
    wallet: JsValue,
    parts: Vec<u64>,
    trees: JsValue,
) -> Result<Vec<u8>, JsError> {
    let wallet = read_wallet(network, wallet).map_err(|e| JsError::new(&e))?;
    let trees: crate::build::Trees =
        serde_wasm_bindgen::from_value(trees).map_err(|e| JsError::new(&e.to_string()))?;
    let ufvk = zcash_keys::keys::UnifiedFullViewingKey::decode(&wallet.network, ufvk)
        .map_err(|e| JsError::new(&e))?;
    let fingerprint = crate::hex_n::<32>(seed_fingerprint).map_err(|e| JsError::new(&e))?;
    let (proposal, _) = preparation(&wallet, &parts).map_err(|e| JsError::new(&e))?;
    crate::build::pczt(
        &wallet,
        &ufvk,
        fingerprint,
        hd_index,
        &proposal,
        &trees,
        None,
    )
    .map_err(|e| JsError::new(&e))?
    .serialize()
    .map_err(|e| JsError::new(&format!("{e:?}")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::send::tests::{orchard_family_note, TIP};
    use zcash_protocol::consensus::Network;
    use zcash_protocol::value::Zatoshis;
    use zcash_protocol::value::COIN;
    use zcash_protocol::zip318::is_canonical_denomination;
    use zip32::Scope;

    const CENT: u64 = COIN / 100;

    fn wallet(values: &[u64]) -> Wallet {
        let notes = values
            .iter()
            .enumerate()
            .map(|(i, v)| {
                orchard_family_note("orchard", Scope::External, *v, TIP - 100, i as u64 + 1)
            })
            .collect();
        Wallet::new(
            Network::MainNetwork,
            &WalletData {
                tip: TIP,
                notes,
                utxos: vec![],
            },
        )
        .unwrap()
    }

    #[test]
    fn quantizes_each_digit_into_fives_twos_and_ones() {
        assert_eq!(quantize(9 * CENT, &Grid), [5 * CENT, 2 * CENT, 2 * CENT]);
        assert_eq!(
            quantize(4 * COIN + 3 * CENT, &Grid),
            [2 * COIN, 2 * COIN, 2 * CENT, CENT]
        );
        // Above the cap, whole caps; below a cent, nothing.
        assert_eq!(
            quantize(25_000 * COIN + CENT + 99, &Grid),
            [10_000 * COIN, 10_000 * COIN, 5_000 * COIN, CENT]
        );
        assert!(quantize(CENT - 1, &Grid).is_empty());
    }

    #[test]
    fn plans_a_small_balance_as_one_cent_after_a_preparation() {
        // Even one transfer spends a note made for it.
        let plan = plan(&wallet(&[1_130_714]), &mut OsRng, &Grid).unwrap();
        assert_eq!(plan.transfers.len(), 1);
        assert_eq!(plan.transfers[0].value, CENT);
        assert_eq!(plan.preparations, [TIP + 1]);
        assert_eq!(
            plan.left,
            1_130_714 - CENT - plan.transfer_fee - plan.preparation_fee
        );
    }

    #[test]
    fn counts_preparations_by_actions() {
        // 1 note + 14 parts + change fill 16 actions; a 15th part needs a
        // second preparation, spending the first one's change.
        assert_eq!(preparations(1, 1), 1);
        assert_eq!(preparations(1, 14), 1);
        assert_eq!(preparations(1, 15), 2);
        assert_eq!(preparations(3, 26), 2);
    }

    #[test]
    fn test_amounts_split_a_cent_into_several_transfers() {
        let plan = plan(&wallet(&[1_130_714]), &mut OsRng, &TestAmounts).unwrap();
        assert!(plan.transfers.len() > 1);
        assert!(plan
            .transfers
            .iter()
            .all(|t| t.value == 100_000 || t.value == 200_000));
        assert_eq!(plan.preparations.len(), 1);
    }

    #[test]
    fn fees_come_out_of_the_balance_and_every_amount_is_standard() {
        let values = [7 * COIN, 5_432_109_876, 3 * CENT, 123_456];
        let orchard: u64 = values.iter().sum();
        let plan = plan(&wallet(&values), &mut OsRng, &Grid).unwrap();
        let moved: u64 = plan.transfers.iter().map(|t| t.value).sum();
        assert_eq!(
            moved
                + plan.transfers.len() as u64 * plan.transfer_fee
                + plan.preparations.len() as u64 * plan.preparation_fee
                + plan.left,
            orchard
        );
        assert!(plan
            .transfers
            .iter()
            .all(|t| is_canonical_denomination(Zatoshis::from_u64(t.value).unwrap())));
        // The first transfer waits until the last preparation's notes can
        // anchor at a bucket boundary, and they follow in order.
        let last_prep = *plan.preparations.last().unwrap();
        assert!(plan.transfers[0].height >= last_prep + MINING_MARGIN + 144);
        assert_eq!(
            plan.transfers[0].height,
            anchorable(last_prep + MINING_MARGIN)
        );
        assert!(plan
            .transfers
            .windows(2)
            .all(|w| w[0].height <= w[1].height));
    }

    /// A preparation spends the note, makes a note per part worth the part
    /// and a transfer's fee, keeps the rest, is anchored at the bucket with
    /// the rolling expiry, padded to 16 actions, and proves and verifies.
    /// Each made note then crosses as a canonical transfer.
    #[test]
    fn prepares_notes_for_each_transfer_end_to_end() {
        let (wallet, trees, root) = crate::build::tests::bucketed_wallet(7 * CENT);
        let parts = [5 * CENT, CENT];
        let (proposal, made) = preparation(&wallet, &parts).unwrap();
        assert_eq!(made, 2);
        let step = proposal.steps().first();
        let target = BlockHeight::from(proposal.min_target_height());
        assert!(crate::build::bucket(step, &Network::MainNetwork, target).is_some());
        let fee = transfer_fee(&Network::MainNetwork, target).unwrap();
        let changes: Vec<u64> = step
            .balance()
            .proposed_change()
            .iter()
            .map(|c| c.value().into_u64())
            .collect();
        let prep_fee = preparation_fee(&Network::MainNetwork, target).unwrap();
        assert_eq!(
            changes,
            [
                5 * CENT + fee,
                CENT + fee,
                7 * CENT - 6 * CENT - 2 * fee - prep_fee
            ]
        );

        let ufvk = zcash_keys::keys::UnifiedFullViewingKey::decode(
            &Network::MainNetwork,
            &crate::send::tests::wallet_ufvk(),
        )
        .unwrap();
        let fingerprint = zip32::fingerprint::SeedFingerprint::from_seed(&crate::send::tests::SEED)
            .unwrap()
            .to_bytes();
        let unsigned =
            crate::build::pczt(&wallet, &ufvk, fingerprint, 0, &proposal, &trees, None).unwrap();
        assert_eq!(
            unsigned.orchard().anchor(),
            &Some(orchard::Anchor::from(root).to_bytes())
        );
        let signed = crate::roles::sign(
            &Network::MainNetwork,
            unsigned,
            &crate::send::tests::SEED,
            0,
        )
        .unwrap();
        let (_, raw) = crate::roles::prove(signed, None).unwrap();
        let tx = zcash_primitives::transaction::Transaction::read(
            &raw[..],
            zcash_protocol::consensus::BranchId::Nu6_3,
        )
        .unwrap();
        let bundle = tx.orchard_bundle().unwrap();
        assert_eq!(bundle.actions().len(), PREP_TX_ACTIONS);
        assert_eq!(i64::from(*bundle.value_balance()), prep_fee as i64);
        assert_eq!(
            tx.expiry_height(),
            zcash_protocol::zip318::expiry_height(target)
        );
        assert!(tx.ironwood_bundle().is_none() && tx.sapling_bundle().is_none());

        // A made note, worth its part and the fee, crosses with no change.
        let (made, _, _) = crate::build::tests::bucketed_wallet(5 * CENT + fee);
        let transfer = crate::send::tests::plan_to_self(&made, 5 * CENT);
        let step = transfer.steps().first();
        let target = BlockHeight::from(transfer.min_target_height());
        assert!(crate::build::bucket(step, &Network::MainNetwork, target).is_some());
        assert_eq!(u64::from(step.balance().fee_required()), fee);
        assert!(step
            .balance()
            .proposed_change()
            .iter()
            .all(|c| c.value().is_zero()));
    }

    #[test]
    fn a_preparation_waits_for_notes_that_can_anchor() {
        // Mined at the tip: below no bucket boundary yet.
        let fresh = Wallet::new(
            Network::MainNetwork,
            &WalletData {
                tip: TIP,
                notes: vec![orchard_family_note(
                    "orchard",
                    Scope::External,
                    COIN,
                    TIP,
                    1,
                )],
                utxos: vec![],
            },
        )
        .unwrap();
        let err = preparation(&fresh, &[CENT]).unwrap_err();
        assert!(err.starts_with("not ready"), "{err}");
    }

    #[test]
    fn too_little_plans_nothing() {
        let plan = plan(&wallet(&[CENT / 2]), &mut OsRng, &Grid).unwrap();
        assert!(plan.transfers.is_empty() && plan.preparations.is_empty());
        assert_eq!(plan.left, CENT / 2);
    }
}
