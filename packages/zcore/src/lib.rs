// Copyright 2024 Heliax AG
// SPDX-License-Identifier: Apache-2.0, MIT

//! Stateless trial decryption of shielded outputs.
//!
//! The one CPU-critical piece kept in wasm for the new sync: given a UFVK and a
//! batch of notes, return the ones that decrypt to the wallet. No wallet DB, no
//! commitment tree, no network — just detection.
//!
//! Two tiers, matching the indexer's: `/ciphertexts` carries only enough to
//! reject a note, and [`try_decrypt`] answers value and nullifier from it.
//! `/notes/full` carries the whole ciphertext, and [`try_decrypt_full`] adds
//! what the compact prefix cannot hold — the memo above all.
//!
//! Ironwood (NU6.3) is Orchard's protocol in its own pool: the same keys and
//! record layout, but V3 note plaintexts, so it decrypts in `IronwoodDomain`.

mod keys;
mod transparent_tx;

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
use zip32::Scope;

use orchard::note::ExtractedNoteCommitment as OrchardCmx;
use orchard::note::Nullifier;
use orchard::keys::PreparedIncomingViewingKey as OrchardIvk;
use orchard::note_encryption::{
    CompactAction, DomainVersion, IronwoodVersion, NoteEncryptionDomain, OrchardVersion,
};
use sapling::note::ExtractedNoteCommitment as SaplingCmu;
use sapling::note_encryption::{CompactOutputDescription, SaplingDomain, Zip212Enforcement};
use zcash_keys::address::{Address, UnifiedAddress};
use zcash_keys::keys::UnifiedFullViewingKey;
use zcash_note_encryption::{
    batch, try_output_recovery_with_ovk, BatchDomain, Domain, EphemeralKeyBytes, ShieldedOutput,
    COMPACT_NOTE_SIZE, ENC_CIPHERTEXT_SIZE, OUT_CIPHERTEXT_SIZE,
};
use zcash_primitives::transaction::components::sapling::zip212_enforcement;
use zcash_protocol::consensus::{BlockHeight, Network};

/// Notes per `/ciphertexts` chunk: record `i` of chunk `c` sits at tree
/// position `c × CHUNK_SIZE + i`.
const CHUNK_SIZE: u64 = 1 << 14;

/// One `/ciphertexts` Sapling record: `eph_key ‖ enc_head ‖ cmu`.
const SAPLING_RECORD_LEN: usize = 32 + COMPACT_NOTE_SIZE + 32;

/// One `/ciphertexts` Orchard or Ironwood record: `eph_key ‖ enc_head ‖ cmx ‖
/// rho`, where rho is the action's nullifier, reused as this note's rho.
const ORCHARD_RECORD_LEN: usize = 32 + COMPACT_NOTE_SIZE + 32 + 32;

/// One note with its whole ciphertext, as `/notes/full` serves it. Both pools
/// share the shape; `rho` is Orchard's and `position` Sapling's.
#[derive(Deserialize)]
struct FullNote {
    #[serde(alias = "cmx")]
    cmu: String,
    enc_ciphertext: String,
    eph_key: String,
    height: u32,
    position: u64,
    tx_index: u16,
    #[serde(default)]
    rho: String,
    /// Outgoing ciphertext and the value commitment its key binds to. Both are
    /// needed to recover an output we sent; absent, only incoming decryption runs.
    #[serde(default)]
    out_ciphertext: String,
    #[serde(default)]
    cv: String,
}

/// A [`FullNote`] in the shape `batch::try_note_decryption` wants. `C` is the
/// pool's extracted note commitment.
struct FullOutput<C> {
    eph_key: EphemeralKeyBytes,
    cm: C,
    enc: [u8; ENC_CIPHERTEXT_SIZE],
}

impl ShieldedOutput<SaplingDomain, ENC_CIPHERTEXT_SIZE> for FullOutput<SaplingCmu> {
    fn ephemeral_key(&self) -> EphemeralKeyBytes {
        self.eph_key.clone()
    }
    fn cmstar_bytes(&self) -> [u8; 32] {
        self.cm.to_bytes()
    }
    fn enc_ciphertext(&self) -> &[u8; ENC_CIPHERTEXT_SIZE] {
        &self.enc
    }
}

impl<V: DomainVersion> ShieldedOutput<NoteEncryptionDomain<V>, ENC_CIPHERTEXT_SIZE> for FullOutput<OrchardCmx>
where
    NoteEncryptionDomain<V>: Domain<ExtractedCommitmentBytes = [u8; 32]>,
{
    fn ephemeral_key(&self) -> EphemeralKeyBytes {
        self.eph_key.clone()
    }
    fn cmstar_bytes(&self) -> [u8; 32] {
        self.cm.to_bytes()
    }
    fn enc_ciphertext(&self) -> &[u8; ENC_CIPHERTEXT_SIZE] {
        &self.enc
    }
}

/// A note the UFVK owns, with its value in zatoshis.
#[derive(Serialize)]
struct Hit {
    pool: &'static str,
    /// "external" (received) or "internal" (change).
    scope: &'static str,
    value: u64,
    /// This note's own nullifier (hex); it appears on-chain when the note is spent.
    nf_mine: String,
    /// Where the note sits among the notes it was decrypted from.
    index: usize,
}

/// One `/ciphertexts` chunk's decryption: how many notes it held and the
/// lowest height among them, which place it on the chain, and the hits.
#[derive(Serialize)]
struct Compact {
    count: usize,
    min_height: u32,
    hits: Vec<Hit>,
}

/// A note the UFVK owns, read from its whole ciphertext: everything [`Hit`]
/// has plus what only the full note plaintext carries, and where it sits.
#[derive(Serialize)]
struct FullHit {
    pool: &'static str,
    scope: &'static str,
    value: u64,
    /// This note's own nullifier (hex); it appears on-chain when the note is spent.
    nf_mine: String,
    /// The note's memo as text, or `None` when it carries none.
    memo: Option<String>,
    /// The encoded address the note was sent to — one of ours.
    recipient: String,
    height: u32,
    tx_index: u16,
    position: u64,
}

/// An output this wallet created, recovered with its outgoing viewing key:
/// what was sent, and to whom. Our own change is excluded — it decrypts as a
/// note of ours on the incoming side.
#[derive(Serialize)]
struct SentOutput {
    pool: &'static str,
    value: u64,
    /// The encoded address the output was sent to.
    recipient: String,
    /// The memo as text, or `None` when it carries none.
    memo: Option<String>,
    height: u32,
    tx_index: u16,
    position: u64,
}

/// One chunk's decryption: the notes this wallet received, and the outputs it sent.
#[derive(Serialize)]
struct FullChunk {
    hits: Vec<FullHit>,
    sent: Vec<SentOutput>,
}

/// External + internal (change) scopes — a note may be addressed to either.
const SCOPES: [(&str, Scope); 2] = [
    ("external", Scope::External),
    ("internal", Scope::Internal),
];

/// `"main"` or `"test"`, as the app configures it.
pub(crate) fn parse_network(network: &str) -> Result<Network, String> {
    match network {
        "main" => Ok(Network::MainNetwork),
        "test" => Ok(Network::TestNetwork),
        _ => Err(format!("unknown network {network}")),
    }
}

/// A recipient as a wallet shows it: a bare Sapling address, or the Orchard
/// receiver wrapped in a unified address. Falls back to raw bytes if the
/// unified encoding refuses them, so a note is never lost to a display detail.
fn encode_sapling(network: &Network, addr: &sapling::PaymentAddress) -> String {
    Address::Sapling(*addr).encode(network)
}

fn encode_orchard(network: &Network, addr: &orchard::Address) -> String {
    UnifiedAddress::from_receivers(Some(*addr), None, None)
        .map(|ua| Address::Unified(ua).encode(network))
        .unwrap_or_else(|| hex::encode(addr.to_raw_address_bytes()))
}

fn hex_n<const N: usize>(s: &str) -> Result<[u8; N], String> {
    let v = hex::decode(s).map_err(|e| e.to_string())?;
    v.try_into().map_err(|_| format!("expected {N} bytes"))
}

/// ZIP-302: `0xF6` then zeros is "no memo", `0xF5` and above are reserved
/// non-text forms, and anything below is UTF-8 padded with zeros.
fn memo_text(memo: &[u8]) -> Option<String> {
    match *memo.first()? {
        0xF6 => None,
        b if b >= 0xF5 => Some(hex::encode(memo)),
        _ => {
            let end = memo.iter().rposition(|&b| b != 0).map_or(0, |i| i + 1);
            String::from_utf8(memo[..end].to_vec()).ok()
        }
    }
}

/// The two fields outgoing recovery needs, when the endpoint carries them.
fn outgoing_parts(n: &FullNote) -> Result<Option<([u8; 32], [u8; OUT_CIPHERTEXT_SIZE])>, String> {
    if n.cv.is_empty() || n.out_ciphertext.is_empty() {
        return Ok(None);
    }
    Ok(Some((hex_n(&n.cv)?, hex_n(&n.out_ciphertext)?)))
}

fn sapling_ivks(
    dfvk: &sapling::zip32::DiversifiableFullViewingKey,
) -> Vec<sapling::keys::PreparedIncomingViewingKey> {
    SCOPES
        .iter()
        .map(|(_, scope)| sapling::keys::PreparedIncomingViewingKey::new(&dfvk.to_ivk(*scope)))
        .collect()
}

fn orchard_ivks(fvk: &orchard::keys::FullViewingKey) -> Vec<OrchardIvk> {
    SCOPES.iter().map(|(_, scope)| OrchardIvk::new(&fvk.to_ivk(*scope))).collect()
}

/// A `/ciphertexts` chunk body, split open. Postcard lays it out as
/// `varint(min_height) ‖ varint(median_height) ‖ varint(max_height) ‖
/// varint(count)`, then `count` records of `record_len` bytes each.
struct ChunkBody<'a> {
    min_height: u32,
    max_height: u32,
    records: std::slice::ChunksExact<'a, u8>,
}

fn chunk_body(body: &[u8], record_len: usize) -> Result<ChunkBody<'_>, String> {
    let ((min_height, _median, max_height, count), records) =
        postcard::take_from_bytes::<(u32, u32, u32, usize)>(body).map_err(|e| e.to_string())?;
    if count.checked_mul(record_len) != Some(records.len()) {
        return Err(format!("chunk holds {} bytes for {count} records", records.len()));
    }
    Ok(ChunkBody {
        min_height,
        max_height,
        records: records.chunks_exact(record_len),
    })
}

/// ZIP-212 enforcement for a whole chunk, which carries only its height
/// bounds. A chunk that crosses a rule change gets the grace period, which
/// accepts both plaintext formats: at worst a false hit, which the full pass,
/// with exact heights, then rejects.
fn chunk_enforcement(network: &Network, min_height: u32, max_height: u32) -> Zip212Enforcement {
    let low = zip212_enforcement(network, BlockHeight::from(min_height));
    let high = zip212_enforcement(network, BlockHeight::from(max_height));
    if low == high {
        low
    } else {
        Zip212Enforcement::GracePeriod
    }
}

fn decrypt_sapling(network: &str, ufvk: &str, chunk: u32, body: &[u8]) -> Result<Compact, String> {
    let network: Network = parse_network(network)?;
    let ufvk = UnifiedFullViewingKey::decode(&network, ufvk)?;
    let body = chunk_body(body, SAPLING_RECORD_LEN)?;
    let (count, min_height) = (body.records.len(), body.min_height);
    let Some(dfvk) = ufvk.sapling() else {
        return Ok(Compact { count, min_height, hits: Vec::new() });
    };

    let enforcement = chunk_enforcement(&network, body.min_height, body.max_height);
    let nk = &dfvk.fvk().vk.nk;
    let ivks = sapling_ivks(dfvk);
    let outputs = body
        .records
        .map(|r| {
            let (eph_key, r) = r.split_at(32);
            let (enc_head, cmu) = r.split_at(COMPACT_NOTE_SIZE);
            let cmu = Option::<SaplingCmu>::from(SaplingCmu::from_bytes(cmu.try_into().unwrap()))
                .ok_or("bad sapling commitment")?;
            Ok((
                SaplingDomain::new(enforcement),
                CompactOutputDescription {
                    ephemeral_key: EphemeralKeyBytes(eph_key.try_into().unwrap()),
                    cmu,
                    enc_ciphertext: enc_head.try_into().unwrap(),
                },
            ))
        })
        .collect::<Result<Vec<_>, String>>()?;

    let mut hits = Vec::new();
    for (i, res) in batch::try_compact_note_decryption(&ivks, &outputs)
        .into_iter()
        .enumerate()
    {
        if let Some(((note, _addr), scope_idx)) = res {
            let position = u64::from(chunk) * CHUNK_SIZE + i as u64;
            hits.push(Hit {
                pool: "sapling",
                scope: SCOPES[scope_idx].0,
                value: note.value().inner(),
                nf_mine: hex::encode(note.nf(nk, position).0),
                index: i,
            });
        }
    }
    Ok(Compact { count, min_height, hits })
}

/// Orchard and Ironwood compact decryption: one protocol, told apart only by
/// the note plaintext version its domain `V` accepts.
fn decrypt_orchard<V: DomainVersion>(
    network: &str,
    ufvk: &str,
    pool: &'static str,
    body: &[u8],
) -> Result<Compact, String>
where
    NoteEncryptionDomain<V>: BatchDomain<IncomingViewingKey = OrchardIvk, Note = orchard::Note>,
    CompactAction: ShieldedOutput<NoteEncryptionDomain<V>, COMPACT_NOTE_SIZE>,
{
    let network: Network = parse_network(network)?;
    let ufvk = UnifiedFullViewingKey::decode(&network, ufvk)?;
    let body = chunk_body(body, ORCHARD_RECORD_LEN)?;
    let (count, min_height) = (body.records.len(), body.min_height);
    let Some(fvk) = ufvk.orchard() else {
        return Ok(Compact { count, min_height, hits: Vec::new() });
    };

    // Each action carries its own rho, so the domain is per-output.
    let ivks = orchard_ivks(fvk);
    let outputs = body
        .records
        .map(|r| {
            let (eph_key, r) = r.split_at(32);
            let (enc_head, r) = r.split_at(COMPACT_NOTE_SIZE);
            let (cmx, rho) = r.split_at(32);
            let action = CompactAction::from_parts(
                Option::<Nullifier>::from(Nullifier::from_bytes(rho.try_into().unwrap()))
                    .ok_or("bad orchard nullifier")?,
                Option::<OrchardCmx>::from(OrchardCmx::from_bytes(cmx.try_into().unwrap()))
                    .ok_or("bad orchard commitment")?,
                EphemeralKeyBytes(eph_key.try_into().unwrap()),
                enc_head.try_into().unwrap(),
            );
            let domain = NoteEncryptionDomain::<V>::for_compact_action(&action);
            Ok((domain, action))
        })
        .collect::<Result<Vec<_>, String>>()?;

    let mut hits = Vec::new();
    for (i, res) in batch::try_compact_note_decryption(&ivks, &outputs)
        .into_iter()
        .enumerate()
    {
        if let Some(((note, _addr), scope_idx)) = res {
            hits.push(Hit {
                pool,
                scope: SCOPES[scope_idx].0,
                value: note.value().inner(),
                nf_mine: hex::encode(note.nullifier(fvk).to_bytes()),
                index: i,
            });
        }
    }
    Ok(Compact { count, min_height, hits })
}

/// Orchard and Ironwood full decryption, told apart by the note plaintext
/// version `V` accepts; see [`decrypt_orchard`].
fn decrypt_full_orchard<V: DomainVersion>(
    network: &Network,
    fvk: &orchard::keys::FullViewingKey,
    pool: &'static str,
    notes: &[FullNote],
) -> Result<FullChunk, String>
where
    NoteEncryptionDomain<V>: BatchDomain<
        IncomingViewingKey = OrchardIvk,
        OutgoingViewingKey = orchard::keys::OutgoingViewingKey,
        ValueCommitment = orchard::value::ValueCommitment,
        Note = orchard::Note,
        Recipient = orchard::Address,
        Memo = [u8; 512],
        ExtractedCommitmentBytes = [u8; 32],
    >,
{
    let mut hits = Vec::new();
    let mut sent = Vec::new();
    // Outputs that decrypt as ours: change, so never an outgoing payment.
    let mut mine = vec![false; notes.len()];

    // Each action carries its own rho, so the domain is per-output.
    let ivks = orchard_ivks(fvk);
    let outputs = notes
        .iter()
        .map(|n| {
            let cm = Option::<OrchardCmx>::from(OrchardCmx::from_bytes(&hex_n(&n.cmu)?))
                .ok_or("bad orchard commitment")?;
            let enc: [u8; ENC_CIPHERTEXT_SIZE] = hex_n(&n.enc_ciphertext)?;
            let eph_key = EphemeralKeyBytes(hex_n(&n.eph_key)?);
            // The domain is only constructible from an action, so the
            // compact prefix of this ciphertext stands in for one.
            let head = enc[..52].try_into().map_err(|_| "short ciphertext")?;
            let action = CompactAction::from_parts(
                Option::<Nullifier>::from(Nullifier::from_bytes(&hex_n(&n.rho)?))
                    .ok_or("bad orchard nullifier")?,
                cm,
                eph_key.clone(),
                head,
            );
            Ok((
                NoteEncryptionDomain::<V>::for_compact_action(&action),
                FullOutput { eph_key, cm, enc },
            ))
        })
        .collect::<Result<Vec<_>, String>>()?;

    for (i, res) in batch::try_note_decryption(&ivks, &outputs)
        .into_iter()
        .enumerate()
    {
        if let Some(((note, addr, memo), scope_idx)) = res {
            mine[i] = true;
            hits.push(FullHit {
                pool,
                scope: SCOPES[scope_idx].0,
                value: note.value().inner(),
                nf_mine: hex::encode(note.nullifier(fvk).to_bytes()),
                memo: memo_text(&memo),
                recipient: encode_orchard(network, &addr),
                height: notes[i].height,
                tx_index: notes[i].tx_index,
                position: notes[i].position,
            });
        }
    }

    let ovks: Vec<_> = SCOPES.iter().map(|(_, s)| fvk.to_ovk(*s)).collect();
    for (i, (domain, output)) in outputs.iter().enumerate() {
        let Some((cv, out)) = outgoing_parts(&notes[i])? else {
            continue;
        };
        if mine[i] {
            continue;
        }
        let Some(cv) = Option::from(orchard::value::ValueCommitment::from_bytes(&cv)) else {
            continue;
        };
        for ovk in &ovks {
            if let Some((note, addr, memo)) =
                try_output_recovery_with_ovk(domain, ovk, output, &cv, &out)
            {
                sent.push(SentOutput {
                    pool,
                    value: note.value().inner(),
                    recipient: encode_orchard(network, &addr),
                    memo: memo_text(&memo),
                    height: notes[i].height,
                    tx_index: notes[i].tx_index,
                    position: notes[i].position,
                });
                break;
            }
        }
    }

    Ok(FullChunk { hits, sent })
}

fn decrypt_full(
    network: &str,
    ufvk: &str,
    pool: &str,
    notes: &[FullNote],
) -> Result<FullChunk, String> {
    let network: Network = parse_network(network)?;
    let ufvk = UnifiedFullViewingKey::decode(&network, ufvk)?;
    match (pool, ufvk.orchard()) {
        ("orchard", Some(fvk)) => return decrypt_full_orchard::<OrchardVersion>(&network, fvk, "orchard", notes),
        ("ironwood", Some(fvk)) => return decrypt_full_orchard::<IronwoodVersion>(&network, fvk, "ironwood", notes),
        _ => {}
    }

    let mut hits = Vec::new();
    let mut sent = Vec::new();
    // Outputs that decrypt as ours: change, so never an outgoing payment.
    let mut mine = vec![false; notes.len()];

    // Sapling: one domain per output (ZIP-212 enforcement is height-dependent).
    if let ("sapling", Some(dfvk)) = (pool, ufvk.sapling()) {
        let nk = &dfvk.fvk().vk.nk;
        let ivks = sapling_ivks(dfvk);
        let outputs = notes
            .iter()
            .map(|n| {
                let cm = Option::<SaplingCmu>::from(SaplingCmu::from_bytes(&hex_n(&n.cmu)?))
                    .ok_or("bad sapling commitment")?;
                let enforcement = zip212_enforcement(&network, BlockHeight::from(n.height));
                Ok((
                    SaplingDomain::new(enforcement),
                    FullOutput {
                        eph_key: EphemeralKeyBytes(hex_n(&n.eph_key)?),
                        cm,
                        enc: hex_n(&n.enc_ciphertext)?,
                    },
                ))
            })
            .collect::<Result<Vec<_>, String>>()?;

        for (i, res) in batch::try_note_decryption(&ivks, &outputs)
            .into_iter()
            .enumerate()
        {
            if let Some(((note, addr, memo), scope_idx)) = res {
                mine[i] = true;
                hits.push(FullHit {
                    pool: "sapling",
                    scope: SCOPES[scope_idx].0,
                    value: note.value().inner(),
                    nf_mine: hex::encode(note.nf(nk, notes[i].position).0),
                    memo: memo_text(&memo),
                    recipient: encode_sapling(&network, &addr),
                    height: notes[i].height,
                    tx_index: notes[i].tx_index,
                    position: notes[i].position,
                });
            }
        }

        // Outputs we created: the ock binds to our ovk, so only our own
        // transactions can be recovered. Both scopes, since a shielding tx
        // pays the internal one.
        let ovks: Vec<_> = SCOPES.iter().map(|(_, s)| dfvk.to_ovk(*s)).collect();
        for (i, (domain, output)) in outputs.iter().enumerate() {
            let Some((cv, out)) = outgoing_parts(&notes[i])? else {
                continue;
            };
            if mine[i] {
                continue;
            }
            // A cv we can't parse costs this output's outgoing details; it must
            // never cost the chunk the notes we received in it.
            let Some(cv) = Option::from(
                sapling::value::ValueCommitment::from_bytes_not_small_order(&cv),
            ) else {
                continue;
            };
            for ovk in &ovks {
                if let Some((note, addr, memo)) =
                    try_output_recovery_with_ovk(domain, ovk, output, &cv, &out)
                {
                    sent.push(SentOutput {
                        pool: "sapling",
                        value: note.value().inner(),
                        recipient: encode_sapling(&network, &addr),
                        memo: memo_text(&memo),
                        height: notes[i].height,
                        tx_index: notes[i].tx_index,
                        position: notes[i].position,
                    });
                    break;
                }
            }
        }
    }

    Ok(FullChunk { hits, sent })
}

/// Trial-decrypt one pool's `/ciphertexts` chunk, the raw response body,
/// against `ufvk`. `chunk` is its number, which fixes each note's position.
///
/// Returns `{ count, min_height, hits: [{ pool, scope, value, nf_mine, index }] }`.
#[wasm_bindgen]
pub fn try_decrypt(network: &str, ufvk: &str, pool: &str, chunk: u32, body: &[u8]) -> Result<JsValue, JsError> {
    let compact = match pool {
        "sapling" => decrypt_sapling(network, ufvk, chunk, body),
        "orchard" => decrypt_orchard::<OrchardVersion>(network, ufvk, "orchard", body),
        "ironwood" => decrypt_orchard::<IronwoodVersion>(network, ufvk, "ironwood", body),
        _ => return Err(JsError::new("unknown pool")),
    }
    .map_err(|e| JsError::new(&e))?;
    serde_wasm_bindgen::to_value(&compact).map_err(|e| JsError::new(&e.to_string()))
}

/// Trial-decrypt one pool's full notes against `ufvk`.
///
/// `notes` is the `/notes/full` payload: an array of that pool's notes, whole
/// ciphertexts included. Returns
/// `{ hits: [{ pool, scope, value, nf_mine, memo, recipient, height, tx_index, position }],
///    sent: [{ pool, value, recipient, memo, height, tx_index, position }] }`.
///
/// `sent` stays empty unless the payload carries `cv` and `out_ciphertext`:
/// recovering an output we created needs both.
///
/// Worth fetching only for a chunk a compact pass already found a note in — a
/// full chunk is ~50× a compact one.
#[wasm_bindgen]
pub fn try_decrypt_full(
    network: &str,
    ufvk: &str,
    pool: &str,
    notes: JsValue,
) -> Result<JsValue, JsError> {
    if !["sapling", "orchard", "ironwood"].contains(&pool) {
        return Err(JsError::new("unknown pool"));
    }
    let notes: Vec<FullNote> =
        serde_wasm_bindgen::from_value(notes).map_err(|e| JsError::new(&e.to_string()))?;
    let hits = decrypt_full(network, ufvk, pool, &notes).map_err(|e| JsError::new(&e))?;
    serde_wasm_bindgen::to_value(&hits).map_err(|e| JsError::new(&e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use zcash_keys::keys::UnifiedSpendingKey;

    /// One real `/notes/full` note per pool, as the endpoint serves them.
    const SAPLING_FULL: &str = r#"[{"cmu":"cebda1a5c30582e5d630430ab42b7c24681e119ab2f32fe0c00a01a91f6d5658","cv":"0930a6cf8fd0e681b01b9328c6aefdde84347cdb6c5751e4574e2f4552f5a73b","enc_ciphertext":"374621524a15dc1084366032b5f81c583c5a8c710a535a452c068b89b8851c89ac6a61ad060f558dee56e77cb8dfa7740e4309faa77c34fce8474693fa5abbd112a7339069e3dd168d004aa2b38513b6c841a13b6a59c179bf21755a11cfd66b243480fa4d52a805ee328502c7f7e8880e401c0dc5e7b0422054f8863bf510ddde1383ea27bdb42844391d3225f3376bd78fe632815cb0bd82397fd78a8f04218de6ef846291046adedbb8e11c2d55e1cbf1b3f09ba147b2f3d573ce2c534f95646f5ae792c6b393d03bbc6fbd882d390f9f761150dbf3ba98e6503c2d8aae46bd68eac88fee48932a286f75aa47179b9ed82439a3644eb879460718fcd4778fc5a588f3c962862680f46378154877556435d352099d0d09dca1b5f61052dba3dfadee0683367b5382331e2dee62c3d33cd376bc04a4023bf8f8f533464b5b1a127996684a39c780180a587f3d4543e75b85f834d8873bb2942a678df693b369a2da562cb79f6f46ede3bda31d149b653ea4658ba070a82bdadb162a6c4c7fffb3c7c146ee2b457fdf18a867af4b629ab724e5c1dbf5ba10ee83fe9f32dd20ff5c82a8d6b3f165f81cc9ea513930f0bfdaf9adba9c97ea47d0f4680c9a527f99776401504c9be0f00843cdf45c090559c2ae6ba646918bf0e19c06e0f47655a56eaffecd4effa8131991580adb7f997cc079b0c8ceb520228ededc4a02f36ee10d6fd95a7d4851f414945f38477370e439b54d359237c06aa0f3b15ec7abf060f9d4ca14327a0d7433c11235e549e5564e1d18e6d18c085edc5bbd0046368a2def83aa6a","eph_key":"010d9b3a567a8e662acc9bb928ceadf3da7a722fd2694495d85cfe750414ba65","height":3401974,"out_ciphertext":"57e1bae21d53639fe4dd0a66f2d8a9852622caa9e15702ca14e39ff2921fed386fc159d623ee12eab45136805f5b1d9e52e2c7faba83876075b3e68d16e1d1eafb0a6e17646fd183dc1c1ff7e3666ad0","position":73928704,"tx_index":1}]"#;

    const ORCHARD_FULL: &str = r#"[{"cmx":"10fa5bd9c6b31c30dd476182377d904358176a6cc72ffafcf575c9729ef6a524","cv":"950f9f378ed36594b034355aec1aa3a53f806475c4dd296f6679b506c8451628","enc_ciphertext":"fde30399b57f77ec7294cc71ab278bf518a3742e24d53adc3b5f835a1b0fe43660f9ca9964035a6c1e0ea52691857a08e8fe51e92574c4ab39f75d6c3311121dc6ca4c65ee09f47e84f95e4c3c1955915edf015a0d7b7cce469d1c5199065d4fa2b4f3737dee7486418ecb8fe9c377b675dffa128efa0c0e393d39612443ed1ca6b6c185ef839f9c73dd55297201a7c0bbe5afca55c0322d9fcf9725c23702591ef5e7cb9943b5577a996dba6fb094904530834cf066e8c4fcc2470bfd5126020349da7a65ab0c3906beb2089df4090d4dd0d31e3d212826591449ded57ccd5f57f6f044e8b268c19dc65a02cb4f006f74803f549c9399ff034a6584d358353155efd065cff9e3ba5566f0f3527b4ee94b2b4dfddfb54d9cffea85819be8db30790ba39011097fff20990f9457a28754525fda90d27271a8e84ec719d8f2e5083c885867ca275f76abac699ce09e4c0a88e870ce1cd3ade4252f7cebf21a6d811ea0b63901830c0c77c5da56e3c80bb856fc8731d5c32cb95cd35866183a4e69738ff8ade7bf6026246e6b7f792e6076a7f077abe1f3e550dde3665252ce53ab22612a16b8a1b2bfea62c0ef52fefef49c49229444b3729e73bfbf7c648f85385b0a07ec7bf5386d21f24f165db38aa727c3a2bafdbad841936724c567759f4e2daba46f26f0aeb530a80bcd00d3c1b71f4c48e8e407e028adf1c2df1a92e05095ee97674f62bdeb842d579f14dc31814c533c79e2ce4a7d2c6623f6553beb41c458da12e3fcee1991c8efbd74f463beba22ba32519e19b48ea594c9b01d49ab19333c48","eph_key":"08016d948050cd3b439ea4bd6e813f42a2cd3136df7bb1fc48b039c8b281149f","height":3424128,"out_ciphertext":"b50f388f3f20d6515ea2e138adc2248ac59578cb261424348e13ffa6c36327980c64ce7126859c42ac9fe9b179f6316545e93e2b61c1adb9d247421a32d3ed876821fe04d2406a8a639d4fd4bab40999","position":50216960,"rho":"030d6225143e40197fa77ce04722f537075f5313e62b46f9f6e77646ae6a2326","tx_index":4}]"#;

    // Real compact notes captured from the indexer (not ours) exercise the full
    // parse → prepare-ivk → batch-decrypt path on both pools. A fresh-seed UFVK
    // owns none of them, so the run must succeed with zero hits and no panic.
    // A true-positive is proven end-to-end by the crawler against a live UFVK.
    #[test]
    fn decrypts_real_shapes_without_matching() {
        let network = "main";
        let usk = UnifiedSpendingKey::from_seed(&Network::MainNetwork, &[7u8; 32], zip32::AccountId::ZERO)
            .expect("usk");
        let ufvk = usk.to_unified_full_viewing_key().encode(&Network::MainNetwork);

        let sapling = ciphertexts(3_342_508, &[concat!(
            "cb476002450613bae9a8fa4240a80f459ca338ab4ac9d0ccd69507d0a4bef985", // eph_key
            "67294ab5a43ac6750a760eb171df88bf67d5847fe3bd1d7ac9f4d2bd3e1e69da31868f810a478d3d5b39366f43e11a8b88ddf384", // enc_head
            "1e184cee50a61ef8bad79f28a360ae0383b4c2a563723744abb8994145e5d109", // cmu
        )]);
        let orchard = ciphertexts(3_424_128, &[concat!(
            "8c03e7196525e7c5370766dcddf8be8592be5a12bdef5de0e0852189a4ceb233", // eph_key
            "87d64a0108dec58c38e80bda117b779a8677477347ebe720b5fccb09d188c1632faa0d30abea7f23223df164cdcf3c0a7e5f344d", // enc_head
            "44ba39dbcf4e55c2b2c308eed761a4ffce3f6ae32ec7f01554bb3b2c61eb2936", // cmx
            "08df55c7d84fb6419d06023ae4686cc7e44f7b6309b6b573647ac02b7f5e7a39", // rho
        )]);

        assert_eq!(decrypt_sapling(network, &ufvk, 4511, &sapling).expect("sapling runs").hits.len(), 0);
        assert_eq!(decrypt_orchard::<OrchardVersion>(network, &ufvk, "orchard", &orchard).expect("orchard runs").hits.len(), 0);
    }

    /// A `/ciphertexts` body around hex records, all at `height`, as the new
    /// server encodes it.
    fn ciphertexts(height: u32, records: &[&str]) -> Vec<u8> {
        let mut header = [0u8; 32];
        let header = postcard::to_slice(&(height, height, height, records.len()), &mut header).expect("header");
        let mut body = header.to_vec();
        for record in records {
            body.extend(hex::decode(record).expect("hex"));
        }
        body
    }

    // A V3 note encrypted to our own Orchard address: Ironwood's domain finds
    // it, and Orchard's, which accepts only V2 plaintexts, must not.
    #[test]
    fn decrypts_our_own_ironwood_note() {
        use orchard::note::{ExtractedNoteCommitment, RandomSeed, Rho};
        use orchard::note_encryption::{IronwoodDomain, IronwoodNoteEncryption};
        use orchard::value::NoteValue;
        use orchard::NoteVersion;
        use zcash_note_encryption::Domain;

        let usk = UnifiedSpendingKey::from_seed(&Network::MainNetwork, &[7u8; 32], zip32::AccountId::ZERO)
            .expect("usk");
        let ufvk = usk.to_unified_full_viewing_key();
        let ours = ufvk.orchard().expect("orchard fvk").address_at(0u32, Scope::External);

        let rho_bytes: [u8; 32] = hex_n("08df55c7d84fb6419d06023ae4686cc7e44f7b6309b6b573647ac02b7f5e7a39").unwrap();
        let rho = Rho::from_bytes(&rho_bytes).unwrap();
        let rseed = RandomSeed::from_bytes([3u8; 32], &rho).unwrap();
        let note =
            orchard::Note::from_parts(ours, NoteValue::from_raw(123_456), rho, rseed, NoteVersion::V3).unwrap();
        let encryption = IronwoodNoteEncryption::new(None, note, [0u8; 512]);
        let enc = encryption.encrypt_note_plaintext();

        let mut record = IronwoodDomain::epk_bytes(encryption.epk()).0.to_vec();
        record.extend(&enc[..COMPACT_NOTE_SIZE]);
        record.extend(ExtractedNoteCommitment::from(note.commitment()).to_bytes());
        record.extend(rho_bytes);
        let body = ciphertexts(3_430_000, &[&hex::encode(record)]);

        let ufvk = ufvk.encode(&Network::MainNetwork);
        let compact = decrypt_orchard::<IronwoodVersion>("main", &ufvk, "ironwood", &body).expect("runs");
        assert_eq!((compact.count, compact.min_height), (1, 3_430_000));
        let hits = compact.hits;
        assert_eq!(hits.len(), 1);
        assert_eq!((hits[0].pool, hits[0].scope, hits[0].value), ("ironwood", "external", 123_456));
        assert!(decrypt_orchard::<OrchardVersion>("main", &ufvk, "orchard", &body).expect("runs").hits.is_empty());

        // The whole ciphertext through the full path: same answer, plus where it sits.
        let full = FullNote {
            cmu: hex::encode(ExtractedNoteCommitment::from(note.commitment()).to_bytes()),
            enc_ciphertext: hex::encode(enc),
            eph_key: hex::encode(IronwoodDomain::epk_bytes(encryption.epk()).0),
            height: 3_430_000,
            position: 7,
            tx_index: 2,
            rho: hex::encode(rho_bytes),
            out_ciphertext: String::new(),
            cv: String::new(),
        };
        let chunk = decrypt_full("main", &ufvk, "ironwood", std::slice::from_ref(&full)).expect("runs");
        assert_eq!(chunk.hits.len(), 1);
        assert_eq!((chunk.hits[0].pool, chunk.hits[0].value, chunk.hits[0].position), ("ironwood", 123_456, 7));
        assert!(decrypt_full("main", &ufvk, "orchard", &[full]).expect("runs").hits.is_empty());
    }

    #[test]
    fn rejects_a_truncated_chunk() {
        let record = "00".repeat(ORCHARD_RECORD_LEN);
        let mut body = ciphertexts(3_424_128, &[&record, &record]);
        assert_eq!(chunk_body(&body, ORCHARD_RECORD_LEN).expect("whole").records.len(), 2);

        body.pop();
        assert!(chunk_body(&body, ORCHARD_RECORD_LEN).is_err());
    }

    // Mainnet Canopy is 1_046_400, and its grace period runs 32_256 blocks.
    #[test]
    fn chunk_enforcement_widens_across_a_rule_change() {
        let net = Network::MainNetwork;
        assert_eq!(chunk_enforcement(&net, 1_000_000, 1_000_100), Zip212Enforcement::Off);
        assert_eq!(chunk_enforcement(&net, 3_000_000, 3_000_100), Zip212Enforcement::On);
        assert_eq!(chunk_enforcement(&net, 1_046_000, 1_047_000), Zip212Enforcement::GracePeriod);
        assert_eq!(chunk_enforcement(&net, 1_000_000, 2_000_000), Zip212Enforcement::GracePeriod);
    }

    // Same idea for the full tier, over real `/notes/full` notes: the whole
    // 580-byte ciphertext parses, both pools reach the batch decryptor —
    // including Orchard, whose domain is rebuilt from the ciphertext's compact
    // prefix — and a UFVK owning none of them finds nothing. That a matching
    // note yields the right memo is what the crawler's own logging shows.
    #[test]
    fn decrypts_real_full_shapes_without_matching() {
        let usk = UnifiedSpendingKey::from_seed(&Network::MainNetwork, &[7u8; 32], zip32::AccountId::ZERO)
            .expect("usk");
        let ufvk = usk.to_unified_full_viewing_key().encode(&Network::MainNetwork);

        let sapling: Vec<FullNote> = serde_json::from_str(SAPLING_FULL).expect("sapling array");
        let orchard: Vec<FullNote> = serde_json::from_str(ORCHARD_FULL).expect("orchard array");

        assert_eq!(orchard[0].position, 50216960);
        let sapling = decrypt_full("main", &ufvk, "sapling", &sapling).expect("sapling runs");
        let orchard = decrypt_full("main", &ufvk, "orchard", &orchard).expect("orchard runs");
        assert_eq!(sapling.hits.len(), 0);
        assert_eq!(orchard.hits.len(), 0);
        // They carry real `cv` and `out_ciphertext`, so outgoing recovery runs
        // over real bytes too — and recovers nothing, these being strangers'.
        assert_eq!(sapling.sent.len(), 0);
        assert_eq!(orchard.sent.len(), 0);
    }

    /// Encrypt a sapling output to a stranger under our own OVK, exactly as a
    /// send does, and check `decrypt_full` recovers value, recipient and memo
    /// from `out_ciphertext` — the only way our own payments are visible.
    #[test]
    fn recovers_our_own_sapling_output() {
        use rand_core::OsRng;
        use sapling::note_encryption::sapling_note_encryption;
        use zcash_note_encryption::Domain;
        use sapling::value::{NoteValue, ValueCommitTrapdoor, ValueCommitment};
        use sapling::{Note, Rseed};

        let dfvk = |seed: u8| {
            UnifiedSpendingKey::from_seed(&Network::MainNetwork, &[seed; 32], zip32::AccountId::ZERO)
                .expect("usk")
                .sapling()
                .to_diversifiable_full_viewing_key()
        };
        let ours = dfvk(7);
        let (_, theirs) = dfvk(9).default_address();

        let value = NoteValue::from_raw(123_456);
        let note = Note::from_parts(theirs, value, Rseed::AfterZip212([0u8; 32]));
        let mut memo = [0u8; 512];
        memo[..4].copy_from_slice(b"paid");

        let cmu = note.cmu();
        let encryptor =
            sapling_note_encryption(Some(ours.to_ovk(Scope::External)), note, memo, &mut OsRng);
        let cv = ValueCommitment::derive(value, ValueCommitTrapdoor::random(OsRng));

        let full = vec![FullNote {
            cmu: hex::encode(cmu.to_bytes()),
            enc_ciphertext: hex::encode(encryptor.encrypt_note_plaintext()),
            eph_key: hex::encode(SaplingDomain::epk_bytes(encryptor.epk()).0),
            height: 3_378_506,
            position: 73_920_512,
            tx_index: 3,
            rho: String::new(),
            out_ciphertext: hex::encode(encryptor.encrypt_outgoing_plaintext(
                &cv,
                &cmu,
                &mut OsRng,
            )),
            cv: hex::encode(cv.to_bytes()),
        }];

        let ufvk = UnifiedSpendingKey::from_seed(&Network::MainNetwork, &[7u8; 32], zip32::AccountId::ZERO)
            .expect("usk")
            .to_unified_full_viewing_key()
            .encode(&Network::MainNetwork);
        let chunk = decrypt_full("main", &ufvk, "sapling", &full).expect("runs");

        // Not ours to receive — only to have sent.
        assert_eq!(chunk.hits.len(), 0);
        assert_eq!(chunk.sent.len(), 1);
        assert_eq!(chunk.sent[0].value, 123_456);
        // Encoded as a wallet shows it, not as raw diversified bytes.
        assert_eq!(chunk.sent[0].recipient, Address::Sapling(theirs).encode(&Network::MainNetwork));
        assert!(chunk.sent[0].recipient.starts_with("zs1"));
        assert_eq!(chunk.sent[0].memo.as_deref(), Some("paid"));
    }

    #[test]
    fn reads_zip302_memos() {
        let mut none = [0u8; 512];
        none[0] = 0xF6;
        assert_eq!(memo_text(&none), None);

        let mut text = [0u8; 512];
        text[..2].copy_from_slice(b"hi");
        assert_eq!(memo_text(&text).as_deref(), Some("hi"));

        let mut reserved = [0u8; 512];
        reserved[0] = 0xF5;
        assert!(memo_text(&reserved).expect("hex").starts_with("f5"));

        // An empty text memo is a memo, not the absence of one.
        assert_eq!(memo_text(&[0u8; 512]).as_deref(), Some(""));
    }
}
