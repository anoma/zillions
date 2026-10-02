//! ZIP 318's plan for moving Orchard funds to Ironwood with privacy: the
//! balance split into standard amounts, the preparation transactions that
//! create a note of each, and when each crossing is broadcast.
//!
//! Upstream (zcash_protocol 0.10 `zip318`, zcash_client_backend 0.24) has the
//! constants, the fee and the denomination series but no planner; this
//! follows the ZIP's text on top of them. TODO: switch to upstream's planner
//! if one lands.

use rand_core::{OsRng, RngCore};
use serde::Serialize;
use wasm_bindgen::prelude::*;
use zcash_client_backend::fees::canonical_crossing_fee;
use zcash_primitives::transaction::fees::transparent::InputSize;
use zcash_primitives::transaction::fees::zip317::FeeRule;
use zcash_primitives::transaction::fees::FeeRule as _;
use zcash_protocol::consensus::{BlockHeight, NetworkUpgrade, Parameters};
use zcash_protocol::zip318::{
    largest_one_two_five, AnchorBucketInterval, DENOM_CAP, MAX_RESIDUAL_VALUE, PREP_DELAY_CAP,
    PREP_DELAY_MEAN, PREP_TX_ACTIONS, TRANSFER_DELAY_CAP, TRANSFER_DELAY_MEAN,
};

use crate::wallet::{Wallet, WalletData};

/// Blocks between a preparation's broadcast and its notes being mined.
// ponytail: a guess at the ZIP's "small mining margin"; the real schedule
// starts from the preparation's mined height once it's built.
const MINING_MARGIN: u32 = 5;

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Transfer {
    /// What arrives in Ironwood: a standard amount.
    value: u64,
    /// When it's broadcast, as an estimated block height.
    height: u32,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MigrationPlan {
    /// The chain tip the estimated heights count from.
    tip: u32,
    /// Spendable Orchard funds the plan starts from.
    orchard: u64,
    /// When each preparation transaction is broadcast, estimated.
    preparations: Vec<u32>,
    /// In broadcast order.
    transfers: Vec<Transfer>,
    transfer_fee: u64,
    preparation_fee: u64,
    /// What stays in Orchard: too little to make another standard amount.
    left: u64,
}

/// ZIP 318's quantization: the largest standard amount that fits, again and
/// again, which expands each decimal digit into 5s, 2s and 1s of its place.
fn quantize(mut value: u64) -> Vec<u64> {
    let (floor, cap) = (MAX_RESIDUAL_VALUE.into_u64(), DENOM_CAP.into_u64());
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

/// How many 16-action preparation transactions spending `inputs` notes and
/// creating `outputs` take.
// ponytail: counts actions only; layering (a layer spending the previous
// one's outputs) is decided when the preparations are built.
fn preparations(inputs: usize, outputs: usize) -> usize {
    (inputs + outputs).div_ceil(PREP_TX_ACTIONS).max(1)
}

pub(crate) fn plan(wallet: &Wallet, rng: &mut impl RngCore) -> Result<MigrationPlan, String> {
    let notes = wallet.spendable_orchard();
    let orchard: u64 = notes.iter().sum();
    let target = BlockHeight::from(u32::from(wallet.tip) + 1);
    let transfer_fee = canonical_crossing_fee(&wallet.network, target)
        .map_err(|e| format!("{e:?}"))?
        .into_u64();
    let preparation_fee = FeeRule::standard()
        .fee_required(
            &wallet.network,
            target,
            std::iter::empty::<InputSize>(),
            std::iter::empty::<usize>(),
            0,
            0,
            PREP_TX_ACTIONS,
            0,
        )
        .map_err(|e| format!("{e:?}"))?
        .into_u64();

    // The fees come out of the balance before it's split: shrink what's
    // split until the parts, their fees and the preparations' fit.
    let mut value = orchard;
    let (parts, preps) = loop {
        let parts = quantize(value);
        if parts.is_empty() {
            break (parts, 0);
        }
        let cost = |preps: usize| {
            parts.iter().sum::<u64>()
                + parts.len() as u64 * transfer_fee
                + preps as u64 * preparation_fee
        };
        // Each part gets a note, and what's left one more.
        let preps = preparations(notes.len(), parts.len() + 1);
        if cost(preps) <= orchard {
            break (parts, preps);
        }
        value -= (cost(preps) - orchard).min(value);
    };
    let spent = parts.iter().sum::<u64>()
        + parts.len() as u64 * transfer_fee
        + preps as u64 * preparation_fee;

    let mut parts = parts;
    // Shuffled, so the order of amounts says nothing about the balance.
    for i in (1..parts.len()).rev() {
        parts.swap(i, (rng.next_u64() % (i as u64 + 1)) as usize);
    }

    let mut height = u32::from(target);
    let mut preparations = vec![];
    for i in 0..preps {
        if i > 0 {
            height += delay(rng, PREP_DELAY_MEAN.get(), PREP_DELAY_CAP.get());
        }
        preparations.push(height);
    }
    // Transfers start a whole bucket past the first boundary their funding
    // notes can anchor to, so every one has a boundary to prove against.
    let bucket = AnchorBucketInterval::ZIP_318;
    let activation = wallet
        .network
        .activation_height(NetworkUpgrade::Nu6_3)
        .map_or(0, u32::from);
    let funded = BlockHeight::from((height + MINING_MARGIN).max(activation + 1));
    let mut height = u32::from(bucket.boundary_at_or_above(funded)) + bucket.block_count().get();
    let transfers = parts
        .into_iter()
        .map(|value| {
            height += delay(rng, TRANSFER_DELAY_MEAN.get(), TRANSFER_DELAY_CAP.get());
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

/// The plan for moving every spendable Orchard note to Ironwood with
/// privacy, as of `wallet`'s tip; each call draws a new order and timing.
#[wasm_bindgen]
pub fn plan_migration(network: &str, wallet: JsValue) -> Result<JsValue, JsError> {
    let network = crate::parse_network(network).map_err(|e| JsError::new(&e))?;
    let data: WalletData =
        serde_wasm_bindgen::from_value(wallet).map_err(|e| JsError::new(&e.to_string()))?;
    let wallet = Wallet::new(network, &data).map_err(|e| JsError::new(&e))?;
    let plan = plan(&wallet, &mut OsRng).map_err(|e| JsError::new(&e))?;
    serde_wasm_bindgen::to_value(&plan).map_err(|e| JsError::new(&e.to_string()))
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
        assert_eq!(quantize(9 * CENT), [5 * CENT, 2 * CENT, 2 * CENT]);
        assert_eq!(
            quantize(4 * COIN + 3 * CENT),
            [2 * COIN, 2 * COIN, 2 * CENT, CENT]
        );
        // Above the cap, whole caps; below a cent, nothing.
        assert_eq!(
            quantize(25_000 * COIN + CENT + 99),
            [10_000 * COIN, 10_000 * COIN, 5_000 * COIN, CENT]
        );
        assert!(quantize(CENT - 1).is_empty());
    }

    #[test]
    fn plans_a_small_balance_as_one_cent_and_leaves_the_rest() {
        // The wallet's own case: 0.01130714 ZEC in Orchard.
        let plan = plan(&wallet(&[1_130_714]), &mut OsRng).unwrap();
        assert_eq!(plan.transfers.len(), 1);
        assert_eq!(plan.transfers[0].value, CENT);
        assert_eq!(plan.preparations, [TIP + 1]);
        assert_eq!(
            plan.left,
            1_130_714 - CENT - plan.transfer_fee - plan.preparation_fee
        );
    }

    #[test]
    fn fees_come_out_of_the_balance_and_every_amount_is_standard() {
        let values = [7 * COIN, 5_432_109_876, 3 * CENT, 123_456];
        let orchard: u64 = values.iter().sum();
        let plan = plan(&wallet(&values), &mut OsRng).unwrap();
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
        // The first transfer waits a whole bucket past a boundary after the
        // preparations, and they follow in order.
        let last_prep = *plan.preparations.last().unwrap();
        assert!(plan.transfers[0].height >= last_prep + MINING_MARGIN + 144);
        assert!(plan
            .transfers
            .windows(2)
            .all(|w| w[0].height <= w[1].height));
    }

    #[test]
    fn too_little_plans_nothing() {
        let plan = plan(&wallet(&[CENT / 2]), &mut OsRng).unwrap();
        assert!(plan.transfers.is_empty() && plan.preparations.is_empty());
        assert_eq!(plan.left, CENT / 2);
    }
}
