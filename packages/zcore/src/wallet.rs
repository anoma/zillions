// Copyright 2026 Heliax AG
// SPDX-License-Identifier: Apache-2.0, MIT

//! The wallet as upstream's planner sees it: our unspent notes and UTXOs behind
//! `zcash_client_backend`'s `InputSource`, so upstream decides what to spend.
//!
//! Selection mirrors `zcash_client_sqlite` 0.22's (`wallet/common.rs`,
//! `wallet/transparent.rs`): dust is never selected, notes go oldest first,
//! UTXOs largest first, and eligibility is upstream's own confirmations rule.
//! Re-check it against sqlite on every librustzcash bump.

use incrementalmerkletree::Position;
use serde::Deserialize;
use transparent::address::TransparentAddress;
use transparent::bundle::{OutPoint, TxOut};
use transparent::keys::TransparentKeyScope;
use zcash_client_backend::data_api::wallet::input_selection::LockFilter;
use zcash_client_backend::data_api::wallet::{ConfirmationsPolicy, TargetHeight};
use zcash_client_backend::data_api::{AccountMeta, InputSource, NoteFilter, ReceivedNotes, TargetValue};
use zcash_client_backend::fees::StandardFeeRule;
use zcash_client_backend::wallet::{Note, ReceivedNote, WalletTransparentOutput};
use zcash_keys::address::Address;
use zcash_primitives::transaction::fees::transparent::InputSize;
use zcash_primitives::transaction::fees::zip317::{MARGINAL_FEE, P2PKH_STANDARD_INPUT_SIZE};
use zcash_primitives::transaction::fees::FeeRule;
use zcash_primitives::transaction::TxId;
use zcash_protocol::consensus::{BlockHeight, Network};
use zcash_protocol::value::Zatoshis;
use zcash_protocol::{PoolType, ShieldedPool};
use zip32::Scope;

use crate::{hex_n, notes};

/// The one account a wallet here holds.
pub(crate) const ACCOUNT: u32 = 0;

/// An unspent note, as the app stores it after decryption.
#[derive(Deserialize)]
pub(crate) struct NoteData {
    pool: String,
    scope: String,
    /// From decryption; see [`notes`].
    note: String,
    /// Explorer byte order.
    txid: String,
    output_index: u16,
    position: u64,
    height: u32,
}

#[cfg(test)]
impl NoteData {
    pub(crate) fn for_tests(pool: &str, note: String, position: u64, height: u32) -> Self {
        NoteData {
            pool: pool.into(),
            scope: "external".into(),
            note,
            txid: format!("{position:064x}"),
            output_index: 0,
            position,
            height,
        }
    }
}

/// An unspent transparent output, as the app knows it.
#[derive(Deserialize)]
pub(crate) struct UtxoData {
    /// Explorer byte order.
    txid: String,
    index: u32,
    value: u64,
    address: String,
    height: u32,
    scope: String,
    address_index: u32,
}

#[cfg(test)]
impl UtxoData {
    pub(crate) fn for_tests(address: &str, value: u64, index: u32, height: u32) -> Self {
        UtxoData {
            txid: "22".repeat(32),
            index,
            value,
            address: address.into(),
            height,
            scope: "external".into(),
            address_index: 0,
        }
    }
}

/// Everything the planner may spend, and the chain tip it plans against.
#[derive(Deserialize)]
pub(crate) struct WalletData {
    pub(crate) tip: u32,
    pub(crate) notes: Vec<NoteData>,
    pub(crate) utxos: Vec<UtxoData>,
}

/// Notes are referred to by their index in [`WalletData::notes`].
pub(crate) struct Wallet {
    pub(crate) network: Network,
    pub(crate) tip: BlockHeight,
    sapling: Vec<ReceivedNote<u32, sapling::Note>>,
    orchard: Vec<ReceivedNote<u32, orchard::Note>>,
    ironwood: Vec<ReceivedNote<u32, orchard::Note>>,
    pub(crate) utxos: Vec<(WalletTransparentOutput<u32>, TransparentKeyScope, u32)>,
}

fn txid(explorer: &str) -> Result<TxId, String> {
    let mut bytes = hex_n::<32>(explorer)?;
    bytes.reverse();
    Ok(TxId::from_bytes(bytes))
}

fn scope(scope: &str) -> Result<Scope, String> {
    match scope {
        "external" => Ok(Scope::External),
        "internal" => Ok(Scope::Internal),
        _ => Err(format!("unknown scope {scope}")),
    }
}

fn received<N>(id: u32, n: &NoteData, note: N) -> Result<ReceivedNote<u32, N>, String> {
    Ok(ReceivedNote::from_parts(
        id,
        txid(&n.txid)?,
        n.output_index,
        note,
        scope(&n.scope)?,
        Position::from(n.position),
        Some(BlockHeight::from(n.height)),
        None,
    ))
}

impl Wallet {
    pub(crate) fn new(network: Network, data: &WalletData) -> Result<Self, String> {
        let mut wallet = Wallet {
            network,
            tip: BlockHeight::from(data.tip),
            sapling: Vec::new(),
            orchard: Vec::new(),
            ironwood: Vec::new(),
            utxos: Vec::new(),
        };
        for (i, n) in data.notes.iter().enumerate() {
            let i = i as u32;
            match n.pool.as_str() {
                "sapling" => wallet.sapling.push(received(i, n, notes::decode_sapling(&n.note)?)?),
                "orchard" => wallet
                    .orchard
                    .push(received(i, n, notes::decode_orchard(&n.note, orchard::NoteVersion::V2)?)?),
                "ironwood" => wallet
                    .ironwood
                    .push(received(i, n, notes::decode_orchard(&n.note, orchard::NoteVersion::V3)?)?),
                pool => return Err(format!("unknown pool {pool}")),
            }
        }
        for u in &data.utxos {
            let Some(Address::Transparent(address)) = Address::decode(&network, &u.address) else {
                return Err(format!("not a transparent address: {}", u.address));
            };
            let key_scope = match u.scope.as_str() {
                "external" => TransparentKeyScope::EXTERNAL,
                "internal" => TransparentKeyScope::INTERNAL,
                s => return Err(format!("unknown scope {s}")),
            };
            let value = Zatoshis::from_u64(u.value).map_err(|_| "UTXO value out of range")?;
            let output = WalletTransparentOutput::from_parts(
                OutPoint::new(*txid(&u.txid)?.as_ref(), u.index),
                TxOut::new(value, address.script().into()),
                Some(BlockHeight::from(u.height)),
                Some(ACCOUNT),
                Some(key_scope),
                None,
            )
            .ok_or("UTXO script pays no address")?;
            wallet.utxos.push((output, key_scope, u.address_index));
        }
        Ok(wallet)
    }

    fn pool(&self, pool: ShieldedPool) -> Vec<ReceivedNote<u32, Note>> {
        match pool {
            ShieldedPool::Sapling => self.sapling.iter().map(|n| n.clone().map_note(Note::Sapling)).collect(),
            ShieldedPool::Orchard => self
                .orchard
                .iter()
                .map(|n| n.clone().map_note(|note| Note::Orchard { note, pool: orchard::ValuePool::Orchard }))
                .collect(),
            ShieldedPool::Ironwood => self
                .ironwood
                .iter()
                .map(|n| n.clone().map_note(|note| Note::Orchard { note, pool: orchard::ValuePool::Ironwood }))
                .collect(),
        }
    }
}

/// Worth spending at all: sqlite's `rn.value > MARGINAL_FEE`.
fn above_dust(value: u64) -> bool {
    value > u64::from(MARGINAL_FEE)
}

/// Spendable in a transaction mined at `target`: mined at or below the anchor,
/// and confirmed enough by upstream's rule.
fn eligible<N>(note: &ReceivedNote<u32, N>, pool: ShieldedPool, target: TargetHeight, policy: ConfirmationsPolicy) -> bool {
    let anchor = BlockHeight::from(target).saturating_sub(u32::from(policy.trusted()));
    note.mined_height().is_some_and(|h| h <= anchor)
        && policy.confirmations_until_spendable(
            target,
            PoolType::Shielded(pool),
            Some(note.spending_key_scope()),
            note.mined_height(),
            false,
            note.max_shielding_input_height(),
            false,
        ) == 0
}

/// Oldest first; with a target, stop at the note that covers it.
fn select<N: Clone>(
    notes: &[ReceivedNote<u32, N>],
    value: impl Fn(&N) -> u64,
    pool: ShieldedPool,
    target_value: TargetValue,
    target: TargetHeight,
    policy: ConfirmationsPolicy,
    exclude: &[u32],
) -> Vec<ReceivedNote<u32, N>> {
    let mut candidates: Vec<_> = notes
        .iter()
        .filter(|n| !exclude.contains(n.internal_note_id()))
        .filter(|n| above_dust(value(n.note())) && eligible(n, pool, target, policy))
        .cloned()
        .collect();
    candidates.sort_by_key(|n| n.note_commitment_tree_position());
    let TargetValue::AtLeast(goal) = target_value else {
        return candidates;
    };
    let mut total = 0u64;
    candidates
        .into_iter()
        .take_while(|n| {
            let short = total < u64::from(goal);
            total += value(n.note());
            short
        })
        .collect()
}

fn sapling_value(n: &sapling::Note) -> u64 {
    n.value().inner()
}

fn orchard_value(n: &orchard::Note) -> u64 {
    n.value().inner()
}

impl InputSource for Wallet {
    type Error = String;
    type AccountId = u32;
    type NoteRef = u32;

    fn get_spendable_note(
        &self,
        txid: &TxId,
        protocol: ShieldedPool,
        index: u32,
        _: TargetHeight,
        _: LockFilter<'_>,
    ) -> Result<Option<ReceivedNote<u32, Note>>, String> {
        Ok(self
            .pool(protocol)
            .into_iter()
            .find(|n| n.txid() == txid && u32::from(n.output_index()) == index))
    }

    fn anchor_computable(&self, _: ShieldedPool, _: BlockHeight) -> Result<bool, String> {
        // ponytail: assumes ziziphus serves a root at every height; ask it once
        // witnesses are fetched.
        Ok(true)
    }

    fn select_spendable_notes(
        &self,
        _: u32,
        target_value: TargetValue,
        sources: &[ShieldedPool],
        target_height: TargetHeight,
        policy: ConfirmationsPolicy,
        exclude: &[u32],
        _: LockFilter<'_>,
    ) -> Result<ReceivedNotes<u32>, String> {
        let from = |pool| sources.contains(&pool);
        Ok(ReceivedNotes::new(
            if from(ShieldedPool::Sapling) {
                select(&self.sapling, sapling_value, ShieldedPool::Sapling, target_value, target_height, policy, exclude)
            } else {
                vec![]
            },
            if from(ShieldedPool::Orchard) {
                select(&self.orchard, orchard_value, ShieldedPool::Orchard, target_value, target_height, policy, exclude)
            } else {
                vec![]
            },
            if from(ShieldedPool::Ironwood) {
                select(&self.ironwood, orchard_value, ShieldedPool::Ironwood, target_value, target_height, policy, exclude)
            } else {
                vec![]
            },
        ))
    }

    fn select_unspent_notes(
        &self,
        _: u32,
        sources: &[ShieldedPool],
        _: TargetHeight,
        exclude: &[u32],
        _: LockFilter<'_>,
    ) -> Result<ReceivedNotes<u32>, String> {
        fn unspent<N: Clone>(notes: &[ReceivedNote<u32, N>], value: impl Fn(&N) -> u64, exclude: &[u32]) -> Vec<ReceivedNote<u32, N>> {
            notes
                .iter()
                .filter(|n| !exclude.contains(n.internal_note_id()) && above_dust(value(n.note())))
                .cloned()
                .collect()
        }
        let from = |pool| sources.contains(&pool);
        Ok(ReceivedNotes::new(
            if from(ShieldedPool::Sapling) { unspent(&self.sapling, sapling_value, exclude) } else { vec![] },
            if from(ShieldedPool::Orchard) { unspent(&self.orchard, orchard_value, exclude) } else { vec![] },
            if from(ShieldedPool::Ironwood) { unspent(&self.ironwood, orchard_value, exclude) } else { vec![] },
        ))
    }

    fn get_account_metadata(
        &self,
        _: u32,
        _: &NoteFilter,
        _: TargetHeight,
        _: &[u32],
        _: LockFilter<'_>,
    ) -> Result<AccountMeta, String> {
        // Only multi-output change strategies ask; answering wrongly would steer
        // them, so fail rather than guess.
        Err("account metadata is not supported".into())
    }

    fn get_unspent_transparent_output(
        &self,
        outpoint: &OutPoint,
        _: TargetHeight,
    ) -> Result<Option<WalletTransparentOutput<u32>>, String> {
        Ok(self.utxos.iter().map(|(o, _, _)| o).find(|o| o.outpoint() == outpoint).cloned())
    }

    fn get_spendable_transparent_outputs(
        &self,
        address: &TransparentAddress,
        target_height: TargetHeight,
        policy: ConfirmationsPolicy,
        _: zcash_client_backend::data_api::CoinbaseFilter,
        _: LockFilter<'_>,
    ) -> Result<Vec<WalletTransparentOutput<u32>>, String> {
        Ok(self
            .spendable_utxos(target_height, policy)
            .filter(|o| o.recipient_address() == address)
            .cloned()
            .collect())
    }

    fn select_spendable_transparent_outputs(
        &self,
        _: u32,
        target_height: TargetHeight,
        policy: ConfirmationsPolicy,
        _: zcash_client_backend::data_api::CoinbaseFilter,
        address_allow_list: Option<&[TransparentAddress]>,
        target_value: TargetValue,
        max_inputs: usize,
        fee_rule: &StandardFeeRule,
        _: LockFilter<'_>,
    ) -> Result<Vec<WalletTransparentOutput<u32>>, String> {
        let mut candidates: Vec<_> = self
            .spendable_utxos(target_height, policy)
            .filter(|o| address_allow_list.is_none_or(|list| list.contains(o.recipient_address())))
            .filter(|o| u64::from(o.value()) > u64::from(MARGINAL_FEE))
            .cloned()
            .collect();
        candidates.sort_by_key(|o| std::cmp::Reverse(u64::from(o.value())));

        let goal = match target_value {
            TargetValue::AtLeast(z) => Some(u64::from(z)),
            TargetValue::AllFunds(_) => None,
        };
        let mut picked = Vec::new();
        let (mut total, mut size) = (0u64, 0usize);
        for output in candidates {
            if picked.len() >= max_inputs {
                break;
            }
            if let Some(goal) = goal {
                let fee = fee_rule
                    .fee_required(
                        &self.network,
                        BlockHeight::from(target_height),
                        [InputSize::Known(size)],
                        std::iter::empty::<usize>(),
                        0,
                        0,
                        0,
                        0,
                    )
                    .map_err(|e| format!("{e:?}"))?;
                if total.saturating_sub(u64::from(fee)) >= goal {
                    break;
                }
            }
            size += P2PKH_STANDARD_INPUT_SIZE;
            total = total.saturating_add(u64::from(output.value()));
            picked.push(output);
        }
        Ok(picked)
    }
}

impl Wallet {
    /// Everything `from` (`"shielded"` or `"transparent"`) holds, spendable or not.
    pub(crate) fn total(&self, from: &str) -> u64 {
        if from == "transparent" {
            return self.utxos.iter().map(|(o, _, _)| u64::from(o.value())).sum();
        }
        let sapling: u64 = self.sapling.iter().map(|n| sapling_value(n.note())).sum();
        let orchard: u64 = self.orchard.iter().chain(&self.ironwood).map(|n| orchard_value(n.note())).sum();
        sapling + orchard
    }

    /// UTXOs confirmed enough to spend: sqlite treats every UTXO as untrusted,
    /// unless zero-confirmation shielding is allowed.
    fn spendable_utxos(
        &self,
        target_height: TargetHeight,
        policy: ConfirmationsPolicy,
    ) -> impl Iterator<Item = &WalletTransparentOutput<u32>> {
        let needed = if policy.allow_zero_conf_shielding() { 0 } else { u32::from(policy.untrusted()) };
        let target = u32::from(BlockHeight::from(target_height));
        self.utxos.iter().map(|(o, _, _)| o).filter(move |o| {
            o.mined_height().is_some_and(|h| target.saturating_sub(u32::from(h)) >= needed)
        })
    }
}
