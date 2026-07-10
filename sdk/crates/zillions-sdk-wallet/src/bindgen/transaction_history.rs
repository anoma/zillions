// Copyright 2024 ChainSafe Systems
// SPDX-License-Identifier: Apache-2.0, MIT

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use transparent::bundle::OutPoint;
use wasm_bindgen::prelude::*;
use zcash_client_backend::data_api::TransactionStatus;
use zcash_client_memory::MemoryWalletDb;
use zcash_keys::encoding::AddressCodec;
use zcash_protocol::consensus::BlockHeight;
use zcash_protocol::TxId;

use super::wallet::AccountId;
use crate::error::Error;
use zillions_sdk_common::Network;

/// The type of transaction
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[wasm_bindgen]
pub enum TransactionType {
    /// Funds received from external source
    Received,
    /// Funds sent to external recipient
    Sent,
    /// Transparent funds moved into the shielded pool
    Shielded,
    /// Shielded funds moved into the transparent pool
    Unshielded,
    /// Internal transfer with no transparent leg: a sapling<->orchard pool
    /// migration
    Migrated,
}

/// The status of a transaction
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[wasm_bindgen]
pub enum TransactionStatusType {
    /// Transaction has been mined
    Confirmed,
    /// Transaction is waiting to be mined
    Pending,
    /// Transaction has expired without being mined
    Expired,
}

/// A single transaction history entry
#[derive(Debug, Clone, Serialize, Deserialize)]
#[wasm_bindgen(inspectable)]
pub struct TransactionHistoryEntry {
    /// Hex-encoded transaction ID
    txid: String,
    /// Type of transaction (Received, Sent, or Shielded)
    tx_type: TransactionType,
    /// Net value change in zatoshis (positive = received, negative = sent)
    value: i64,
    /// Fee paid in zatoshis (only for sent transactions)
    fee: Option<u64>,
    /// Block height where transaction was mined
    block_height: Option<u32>,
    /// Number of confirmations
    confirmations: u32,
    /// Transaction status
    status: TransactionStatusType,
    /// Decoded memo text (UTF-8)
    memo: Option<String>,
    /// Estimated timestamp (seconds since Unix epoch)
    timestamp: Option<u64>,
    /// Pool type: "sapling", "orchard", "transparent", or "mixed"
    pool: String,
    /// External recipient address (only for sent transactions)
    to_address: Option<String>,
    /// Funding address (only resolvable for transparent transactions;
    /// shielded senders are not revealed by the protocol)
    from_address: Option<String>,
}

#[wasm_bindgen]
impl TransactionHistoryEntry {
    #[wasm_bindgen(getter)]
    pub fn txid(&self) -> String {
        self.txid.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn tx_type(&self) -> TransactionType {
        self.tx_type
    }

    #[wasm_bindgen(getter)]
    pub fn value(&self) -> i64 {
        self.value
    }

    #[wasm_bindgen(getter)]
    pub fn fee(&self) -> Option<u64> {
        self.fee
    }

    #[wasm_bindgen(getter)]
    pub fn block_height(&self) -> Option<u32> {
        self.block_height
    }

    #[wasm_bindgen(getter)]
    pub fn confirmations(&self) -> u32 {
        self.confirmations
    }

    #[wasm_bindgen(getter)]
    pub fn status(&self) -> TransactionStatusType {
        self.status
    }

    #[wasm_bindgen(getter)]
    pub fn memo(&self) -> Option<String> {
        self.memo.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn timestamp(&self) -> Option<u64> {
        self.timestamp
    }

    #[wasm_bindgen(getter)]
    pub fn pool(&self) -> String {
        self.pool.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn to_address(&self) -> Option<String> {
        self.to_address.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn from_address(&self) -> Option<String> {
        self.from_address.clone()
    }
}

/// Response containing paginated transaction history
#[derive(Debug, Clone, Serialize, Deserialize)]
#[wasm_bindgen(inspectable)]
pub struct TransactionHistoryResponse {
    transactions: Vec<TransactionHistoryEntry>,
    total_count: u32,
    has_more: bool,
}

#[wasm_bindgen]
impl TransactionHistoryResponse {
    #[wasm_bindgen(getter)]
    pub fn transactions(&self) -> JsValue {
        serde_wasm_bindgen::to_value(&self.transactions).unwrap_or(JsValue::NULL)
    }

    #[wasm_bindgen(getter)]
    pub fn total_count(&self) -> u32 {
        self.total_count
    }

    #[wasm_bindgen(getter)]
    pub fn has_more(&self) -> bool {
        self.has_more
    }
}

/// Internal struct to accumulate transaction data
#[derive(Debug, Default)]
struct TxAccumulator {
    /// New value credited to the account (including its own change).
    received_value: u64,
    /// Portion of `received_value` that is a new transparent output.
    received_transparent_value: u64,
    /// Portion of `spent_value` consumed from a transparent UTXO.
    spent_transparent_value: u64,
    /// Value of the account's own notes/UTXOs spent as inputs, found via
    /// nullifier and outpoint tracking (available before enhancement).
    spent_value: u64,
    /// Value confirmed sent to a genuinely external recipient.
    sent_value: u64,
    fee: Option<u64>,
    memos: Vec<String>,
    pools: std::collections::HashSet<String>,
    block_height: Option<BlockHeight>,
    status: Option<TransactionStatus>,
    expiry_height: Option<BlockHeight>,
    to_address: Option<String>,
    from_address: Option<String>,
    /// The account's own transparent address a new transparent output
    /// paid; a `to_address` fallback for receives and unshields.
    own_transparent_address: Option<String>,
}

impl TxAccumulator {
    /// Copies status/height/expiry/fee from a tx_table entry, without
    /// overwriting an already-set value.
    fn merge_tx_entry(&mut self, tx_entry: &zcash_client_memory::TransactionEntry) {
        if self.status.is_none() {
            self.status = Some(tx_entry.status());
            self.block_height = tx_entry.mined_height();
            self.expiry_height = tx_entry.expiry_height();
        }
        self.fee = self.fee.or_else(|| tx_entry.fee().map(|fee| fee.into_u64()));
    }
}

/// Whether `address` belongs to one of the wallet's own accounts: each
/// account's default address, or any of its known transparent receivers.
/// A non-default diversified shielded address is not detected.
fn is_own_address(
    db: &MemoryWalletDb<Network>,
    recipient_address: &zcash_address::ZcashAddress,
) -> bool {
    use zcash_client_backend::data_api::WalletRead;

    let Some(address) =
        zcash_keys::address::Address::decode(db.params(), &recipient_address.encode())
    else {
        return false;
    };

    if db
        .find_account_for_address(db.params(), &address)
        .ok()
        .flatten()
        .is_some()
    {
        return true;
    }

    if let zcash_keys::address::Address::Transparent(t_addr) = &address {
        return db.get_account_ids().unwrap_or_default().iter().any(|id| {
            db.get_transparent_receivers(*id, true, true)
                .is_ok_and(|receivers| receivers.contains_key(t_addr))
        });
    }

    false
}

/// Resolve the address that funded a transaction from the prevouts of its
/// transparent inputs. Requires the raw data of both the transaction and a
/// prevout transaction to be present (fetched during sync enhancement);
/// returns `None` for shielded-input or not-yet-enhanced transactions.
fn transparent_sender(db: &MemoryWalletDb<Network>, txid: &zcash_protocol::TxId) -> Option<String> {
    let tx_entry = db.tx_table().get(txid)?;
    let height = tx_entry.mined_height()?;
    let branch_id = zcash_protocol::consensus::BranchId::for_height(db.params(), height);
    let tx = zcash_primitives::transaction::Transaction::read(tx_entry.raw()?, branch_id).ok()?;

    for txin in tx.transparent_bundle().iter().flat_map(|b| b.vin.iter()) {
        let prevout = txin.prevout();
        let Some(prev_entry) = db.tx_table().get(prevout.txid()) else {
            continue;
        };
        let (Some(prev_height), Some(prev_raw)) = (prev_entry.mined_height(), prev_entry.raw())
        else {
            continue;
        };
        let prev_branch_id =
            zcash_protocol::consensus::BranchId::for_height(db.params(), prev_height);
        let Ok(prev_tx) =
            zcash_primitives::transaction::Transaction::read(prev_raw, prev_branch_id)
        else {
            continue;
        };
        if let Some(address) = prev_tx
            .transparent_bundle()
            .and_then(|b| b.vout.get(prevout.n() as usize))
            .and_then(|txout| txout.recipient_address())
        {
            return Some(address.encode(db.params()));
        }
    }
    None
}

/// Extract transaction history from the wallet database
pub fn extract_transaction_history(
    db: &MemoryWalletDb<Network>,
    account_id: u32,
    chain_tip_height: Option<u32>,
    limit: u32,
    offset: u32,
) -> Result<TransactionHistoryResponse, Error> {
    let account_id_typed = AccountId::from(account_id);

    // Accumulate data by txid
    let mut tx_map: BTreeMap<TxId, TxAccumulator> = BTreeMap::new();

    // Process received notes for this account
    for note in db.received_notes().iter() {
        if note.account_id() != account_id_typed {
            continue;
        }

        let txid = note.txid();
        let entry = tx_map.entry(txid).or_default();

        // Add received value
        entry.received_value += note.note().value().into_u64();

        // Determine pool from note type
        let pool = match note.note() {
            zcash_client_backend::wallet::Note::Sapling(_) => "sapling",
            zcash_client_backend::wallet::Note::Orchard(_) => "orchard",
        };
        entry.pools.insert(pool.to_string());

        // Extract memo text
        if let zcash_protocol::memo::Memo::Text(text) = note.memo() {
            let memo_str = text.to_string();
            if !memo_str.is_empty() && !entry.memos.contains(&memo_str) {
                entry.memos.push(memo_str);
            }
        }

        if let Some(tx_entry) = db.tx_table().get(&txid) {
            entry.merge_tx_entry(tx_entry);
        }
    }

    // Nullifier/outpoint spends of the account's own notes: needed so a
    // wallet-authored tx is visible as more than just the receipt of its
    // own change (compact-block scanning marks spends without touching
    // sent_notes).
    for (note_id, spent_txid) in db.received_note_spends().iter() {
        let Some(note) = db.received_notes().find_by_note_id(note_id) else {
            continue;
        };
        if note.account_id() != account_id_typed {
            continue;
        }

        let entry = tx_map.entry(*spent_txid).or_default();
        entry.spent_value += note.note().value().into_u64();

        let pool = match note.note() {
            zcash_client_backend::wallet::Note::Sapling(_) => "sapling",
            zcash_client_backend::wallet::Note::Orchard(_) => "orchard",
        };
        entry.pools.insert(pool.to_string());

        if let Some(tx_entry) = db.tx_table().get(spent_txid) {
            entry.merge_tx_entry(tx_entry);
        }
    }

    // Transparent UTXOs the account owned that were spent as inputs (e.g.
    // shielding), for the same reason as above.
    for (outpoint, spent_txid) in db.transparent_received_output_spends().iter() {
        let Some(txo) = db.transparent_received_outputs().get(outpoint) else {
            continue;
        };
        if txo.account_id() != account_id_typed {
            continue;
        }

        let entry = tx_map.entry(*spent_txid).or_default();
        entry.spent_value += u64::from(txo.txout().value());
        entry.spent_transparent_value += u64::from(txo.txout().value());
        entry.pools.insert("transparent".to_string());

        if entry.from_address.is_none() {
            entry.from_address = transparent_sender(db, spent_txid);
        }

        if let Some(tx_entry) = db.tx_table().get(spent_txid) {
            entry.merge_tx_entry(tx_entry);
        }
    }

    // Transparent outputs received by the account. These live in their own
    // table (not `received_notes`); without this a transparent receive
    // would be invisible and a transparent send would double-count its
    // own change.
    for (_, txo) in db.transparent_received_outputs().iter() {
        if txo.account_id() != account_id_typed {
            continue;
        }

        let txid = txo.transaction_id();
        let entry = tx_map.entry(txid).or_default();

        entry.received_value += u64::from(txo.txout().value());
        entry.received_transparent_value += u64::from(txo.txout().value());
        entry.pools.insert("transparent".to_string());

        if entry.own_transparent_address.is_none() {
            entry.own_transparent_address = Some(txo.address().encode(db.params()));
        }

        if let Some(tx_entry) = db.tx_table().get(&txid) {
            entry.merge_tx_entry(tx_entry);
        }

        if entry.from_address.is_none() {
            entry.from_address = transparent_sender(db, &txid);
        }
    }

    // Process sent notes for this account
    for (sent_note_id, sent_note) in db.sent_notes().iter() {
        if sent_note.from_account_id() != account_id_typed {
            continue;
        }

        let txid = *sent_note_id.txid();
        let entry = tx_map.entry(txid).or_default();

        // Only an output paying an address we don't control is money that
        // actually left the wallet (change/self-shields also land here).
        if let zcash_client_backend::wallet::Recipient::External {
            recipient_address, ..
        } = sent_note.to()
        {
            let own_transparent_output = match sent_note_id {
                zcash_client_memory::SentNoteId::Transparent { txid, output_index } => db
                    .transparent_received_outputs()
                    .contains_key(&OutPoint::new(*txid.as_ref(), *output_index)),
                _ => false,
            };
            let is_own = own_transparent_output || is_own_address(db, recipient_address);

            if !is_own {
                entry.sent_value += sent_note.value().into_u64();
                if entry.to_address.is_none() {
                    entry.to_address = Some(recipient_address.encode());
                }
            }
        }

        // Determine pool from recipient
        let pool = match sent_note.to() {
            zcash_client_backend::wallet::Recipient::External { output_pool, .. } => {
                match output_pool {
                    zcash_protocol::PoolType::Transparent => "transparent",
                    zcash_protocol::PoolType::Shielded(
                        zcash_protocol::ShieldedProtocol::Sapling,
                    ) => "sapling",
                    zcash_protocol::PoolType::Shielded(
                        zcash_protocol::ShieldedProtocol::Orchard,
                    ) => "orchard",
                }
            }
            zcash_client_backend::wallet::Recipient::EphemeralTransparent { .. } => "transparent",
            zcash_client_backend::wallet::Recipient::InternalTransparent { .. } => "transparent",
            zcash_client_backend::wallet::Recipient::InternalAccount { note, .. } => {
                match note.as_ref() {
                    zcash_client_backend::wallet::Note::Sapling(_) => "sapling",
                    zcash_client_backend::wallet::Note::Orchard(_) => "orchard",
                }
            }
        };
        entry.pools.insert(pool.to_string());

        // Extract memo from sent note
        if let zcash_protocol::memo::Memo::Text(text) = sent_note.memo() {
            let memo_str = text.to_string();
            if !memo_str.is_empty() && !entry.memos.contains(&memo_str) {
                entry.memos.push(memo_str);
            }
        }

        if let Some(tx_entry) = db.tx_table().get(&txid) {
            entry.merge_tx_entry(tx_entry);
        }
    }

    // Convert accumulated data to transaction entries
    let mut transactions: Vec<TransactionHistoryEntry> = tx_map
        .into_iter()
        .map(|(txid, acc)| {
            // Balance change: credited value minus the account's own
            // value spent (so a send is negative regardless of change size).
            let net_value = acc.received_value as i64 - acc.spent_value as i64;

            // Self-funded with no confirmed external recipient and
            // something credited back: an internal pool move.
            let is_internal =
                acc.spent_value > 0 && acc.sent_value == 0 && acc.received_value > 0;

            let tx_type = if !is_internal {
                if acc.spent_value == 0 {
                    TransactionType::Received
                } else {
                    TransactionType::Sent
                }
            } else if acc.spent_transparent_value > 0 && acc.received_transparent_value == 0 {
                TransactionType::Shielded
            } else if acc.received_transparent_value > 0 && acc.spent_transparent_value == 0 {
                TransactionType::Unshielded
            } else {
                TransactionType::Migrated
            };

            // Determine pool type
            let pool = if acc.pools.len() > 1 {
                "mixed".to_string()
            } else {
                acc.pools
                    .into_iter()
                    .next()
                    .unwrap_or_else(|| "unknown".to_string())
            };

            // Calculate confirmations
            let block_height_u32 = acc.block_height.map(|h| u32::from(h));
            let confirmations = match (block_height_u32, chain_tip_height) {
                (Some(tx_height), Some(tip_height)) if tip_height >= tx_height => {
                    tip_height - tx_height + 1
                }
                _ => 0,
            };

            // Determine status
            let status = match acc.status {
                Some(TransactionStatus::Mined(_)) => TransactionStatusType::Confirmed,
                Some(TransactionStatus::NotInMainChain) => {
                    // Check if expired
                    if let (Some(expiry), Some(tip)) = (acc.expiry_height, chain_tip_height) {
                        if u32::from(expiry) <= tip {
                            TransactionStatusType::Expired
                        } else {
                            TransactionStatusType::Pending
                        }
                    } else {
                        TransactionStatusType::Pending
                    }
                }
                _ => TransactionStatusType::Pending,
            };

            // Combine memos
            let memo = if acc.memos.is_empty() {
                None
            } else {
                Some(acc.memos.join("\n"))
            };

            // Get actual timestamp from block data (not estimated)
            let timestamp = acc
                .block_height
                .and_then(|height| db.get_block_time(height))
                .map(|t| t as u64);

            TransactionHistoryEntry {
                txid: txid.to_string(),
                tx_type,
                value: match tx_type {
                    // Just the amount that crossed into the transparent
                    // pool, excluding any shielded change from the same tx.
                    TransactionType::Unshielded => acc.received_transparent_value as i64,
                    // No transparent receipt, so the full received value is
                    // the shield/migration destination amount.
                    TransactionType::Shielded | TransactionType::Migrated => {
                        acc.received_value as i64
                    }
                    // The recipient's amount, excluding the fee (`net_value`
                    // bundles it in). Falls back to `net_value` when the
                    // recipient isn't known yet.
                    TransactionType::Sent if acc.sent_value > 0 => -(acc.sent_value as i64),
                    _ => net_value,
                },
                fee: acc.fee,
                block_height: block_height_u32,
                confirmations,
                status,
                memo,
                timestamp,
                pool,
                to_address: acc.to_address.or(acc.own_transparent_address),
                from_address: acc.from_address,
            }
        })
        .collect();

    // Sort by block height descending (newest first), with pending at the top
    transactions.sort_by(|a, b| {
        match (a.block_height, b.block_height) {
            (None, None) => std::cmp::Ordering::Equal,
            (None, Some(_)) => std::cmp::Ordering::Less, // Pending first
            (Some(_), None) => std::cmp::Ordering::Greater,
            (Some(a_height), Some(b_height)) => b_height.cmp(&a_height), // Descending
        }
    });

    let total_count = transactions.len() as u32;

    // Apply pagination
    let offset_usize = offset as usize;
    let limit_usize = limit as usize;

    let paginated: Vec<TransactionHistoryEntry> = transactions
        .into_iter()
        .skip(offset_usize)
        .take(limit_usize)
        .collect();

    let has_more = (offset_usize + paginated.len()) < total_count as usize;

    Ok(TransactionHistoryResponse {
        transactions: paginated,
        total_count,
        has_more,
    })
}
