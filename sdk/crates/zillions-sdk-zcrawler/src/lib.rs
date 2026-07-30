// Copyright 2024 Heliax AG
// SPDX-License-Identifier: Apache-2.0, MIT

//! Stateless trial decryption of compact shielded outputs.
//!
//! The one CPU-critical piece kept in wasm for the new sync: given a UFVK and a
//! batch of compact notes (as served by the `/sync` indexer endpoint), return
//! the ones that decrypt to the wallet, with their value. No wallet DB, no
//! commitment tree, no network — just detection.

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
use zip32::Scope;

use orchard::note::ExtractedNoteCommitment as OrchardCmx;
use orchard::note::Nullifier;
use orchard::note_encryption::{CompactAction, OrchardDomain};
use sapling::note::ExtractedNoteCommitment as SaplingCmu;
use sapling::note_encryption::{CompactOutputDescription, SaplingDomain};
use zcash_keys::keys::UnifiedFullViewingKey;
use zcash_note_encryption::{batch, EphemeralKeyBytes};
use zcash_primitives::transaction::components::sapling::zip212_enforcement;
use zcash_protocol::consensus::BlockHeight;
use zillions_sdk_common::Network;

/// One Orchard compact action. Extra endpoint fields are ignored.
#[derive(Deserialize)]
struct OrchardNote {
    cmx: String,
    enc_head: String,
    eph_key: String,
    /// The action's nullifier, reused as this note's rho.
    rho: String,
}

/// One Sapling compact output. Extra endpoint fields are ignored.
#[derive(Deserialize)]
struct SaplingNote {
    cmu: String,
    enc_head: String,
    eph_key: String,
    /// Block height, for height-dependent ZIP-212 enforcement.
    height: u32,
    /// Note commitment tree position, which the Sapling nullifier binds to.
    position: u64,
}

/// A `/sync` chunk: one pool's notes. The payload is a bare array, so the pool
/// it belongs to comes from the caller rather than the shape.
enum PoolNotes {
    Sapling(Vec<SaplingNote>),
    Orchard(Vec<OrchardNote>),
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
}

/// External + internal (change) scopes — a note may be addressed to either.
const SCOPES: [(&str, Scope); 2] = [
    ("external", Scope::External),
    ("internal", Scope::Internal),
];

fn hex_n<const N: usize>(s: &str) -> Result<[u8; N], String> {
    let v = hex::decode(s).map_err(|e| e.to_string())?;
    v.try_into().map_err(|_| format!("expected {N} bytes"))
}

fn decrypt(network: &str, ufvk: &str, notes: PoolNotes) -> Result<Vec<Hit>, String> {
    let network: Network = network.parse().map_err(|_| "invalid network".to_string())?;
    let ufvk = UnifiedFullViewingKey::decode(&network, ufvk)?;

    let mut hits = Vec::new();

    // Sapling: one domain per output (ZIP-212 enforcement is height-dependent).
    if let (PoolNotes::Sapling(sapling_notes), Some(dfvk)) = (&notes, ufvk.sapling()) {
        let nk = &dfvk.fvk().vk.nk;
        let ivks: Vec<_> = SCOPES
            .iter()
            .map(|(_, scope)| sapling::keys::PreparedIncomingViewingKey::new(&dfvk.to_ivk(*scope)))
            .collect();
        let outputs = sapling_notes
            .iter()
            .map(|n| {
                let cmu = Option::<SaplingCmu>::from(SaplingCmu::from_bytes(&hex_n(&n.cmu)?))
                    .ok_or("bad sapling commitment")?;
                // Pre-Canopy notes used the old rseed format, so enforcement must
                // be resolved per note height, not hardcoded.
                let enforcement = zip212_enforcement(&network, BlockHeight::from(n.height));
                Ok((
                    SaplingDomain::new(enforcement),
                    CompactOutputDescription {
                        ephemeral_key: EphemeralKeyBytes(hex_n(&n.eph_key)?),
                        cmu,
                        enc_ciphertext: hex_n(&n.enc_head)?,
                    },
                ))
            })
            .collect::<Result<Vec<_>, String>>()?;

        for (i, res) in batch::try_compact_note_decryption(&ivks, &outputs)
            .into_iter()
            .enumerate()
        {
            if let Some(((note, _addr), scope_idx)) = res {
                let n = &sapling_notes[i];
                hits.push(Hit {
                    pool: "sapling",
                    scope: SCOPES[scope_idx].0,
                    value: note.value().inner(),
                    nf_mine: hex::encode(note.nf(nk, n.position).0),
                });
            }
        }
    }

    // Orchard: each action carries its own rho (= nf), so the domain is per-output.
    if let (PoolNotes::Orchard(orchard_notes), Some(fvk)) = (&notes, ufvk.orchard()) {
        let ivks: Vec<_> = SCOPES
            .iter()
            .map(|(_, scope)| orchard::keys::PreparedIncomingViewingKey::new(&fvk.to_ivk(*scope)))
            .collect();
        let outputs = orchard_notes
            .iter()
            .map(|n| {
                let action = CompactAction::from_parts(
                    Option::<Nullifier>::from(Nullifier::from_bytes(&hex_n(&n.rho)?))
                        .ok_or("bad orchard nullifier")?,
                    Option::<OrchardCmx>::from(OrchardCmx::from_bytes(&hex_n(&n.cmx)?))
                        .ok_or("bad orchard commitment")?,
                    EphemeralKeyBytes(hex_n(&n.eph_key)?),
                    hex_n(&n.enc_head)?,
                );
                let domain = OrchardDomain::for_compact_action(&action);
                Ok((domain, action))
            })
            .collect::<Result<Vec<_>, String>>()?;

        for res in batch::try_compact_note_decryption(&ivks, &outputs) {
            if let Some(((note, _addr), scope_idx)) = res {
                hits.push(Hit {
                    pool: "orchard",
                    scope: SCOPES[scope_idx].0,
                    value: note.value().inner(),
                    nf_mine: hex::encode(note.nullifier(fvk).to_bytes()),
                });
            }
        }
    }

    Ok(hits)
}

/// Trial-decrypt one pool's compact notes against `ufvk`.
///
/// `notes` is the `/sync` payload: an array of that pool's notes. `pool` is
/// `"sapling"` or `"orchard"`; the array itself doesn't say which it is.
/// Returns the hits: `[{ pool, scope, value, nf_mine }]`.
#[wasm_bindgen]
pub fn try_decrypt(network: &str, ufvk: &str, pool: &str, notes: JsValue) -> Result<JsValue, JsError> {
    let notes = match pool {
        "sapling" => PoolNotes::Sapling(
            serde_wasm_bindgen::from_value(notes).map_err(|e| JsError::new(&e.to_string()))?,
        ),
        "orchard" => PoolNotes::Orchard(
            serde_wasm_bindgen::from_value(notes).map_err(|e| JsError::new(&e.to_string()))?,
        ),
        _ => return Err(JsError::new("unknown pool")),
    };
    let hits = decrypt(network, ufvk, notes).map_err(|e| JsError::new(&e))?;
    serde_wasm_bindgen::to_value(&hits).map_err(|e| JsError::new(&e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use zcash_keys::keys::UnifiedSpendingKey;

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

        let sapling = PoolNotes::Sapling(vec![SaplingNote {
            cmu: "1e184cee50a61ef8bad79f28a360ae0383b4c2a563723744abb8994145e5d109".into(),
            eph_key: "cb476002450613bae9a8fa4240a80f459ca338ab4ac9d0ccd69507d0a4bef985".into(),
            enc_head: "67294ab5a43ac6750a760eb171df88bf67d5847fe3bd1d7ac9f4d2bd3e1e69da31868f810a478d3d5b39366f43e11a8b88ddf384".into(),
            height: 3342508,
            position: 73908202,
        }]);
        let orchard = PoolNotes::Orchard(vec![OrchardNote {
            cmx: "44ba39dbcf4e55c2b2c308eed761a4ffce3f6ae32ec7f01554bb3b2c61eb2936".into(),
            eph_key: "8c03e7196525e7c5370766dcddf8be8592be5a12bdef5de0e0852189a4ceb233".into(),
            enc_head: "87d64a0108dec58c38e80bda117b779a8677477347ebe720b5fccb09d188c1632faa0d30abea7f23223df164cdcf3c0a7e5f344d".into(),
            rho: "08df55c7d84fb6419d06023ae4686cc7e44f7b6309b6b573647ac02b7f5e7a39".into(),
        }]);

        assert_eq!(decrypt(network, &ufvk, sapling).expect("sapling runs").len(), 0);
        assert_eq!(decrypt(network, &ufvk, orchard).expect("orchard runs").len(), 0);
    }

    // A pool's array must deserialize from the raw `/sync` shape, extra fields
    // (orchard's `position`) included.
    #[test]
    fn parses_sync_arrays() {
        let orchard: Vec<OrchardNote> = serde_json::from_str(
            r#"[{"cmx":"57d9124d8ec87f2dc29a3db51b2feddd4c9f0e5ac49d161b4429add050f4912a","enc_head":"e6a88085dfd561cdf3be21391e553c59876f4d2e660a261cc7e0b9d3805252dec8aca128c3f543a01bc76c2afdea9517c70b9fe1","eph_key":"73a12a77fed895c9745da4db14ca0dbc854921c5dbee78b4d6dac5aa9727b62f","position":50176000,"rho":"291a06b08242662e4a50f2070dfc3ed2e3a1fcd0c5dad43997fca2b7a1050135"}]"#,
        )
        .expect("orchard array");
        assert_eq!(orchard.len(), 1);

        let sapling: Vec<SaplingNote> = serde_json::from_str(
            r#"[{"cmu":"cebda1a5c30582e5d630430ab42b7c24681e119ab2f32fe0c00a01a91f6d5658","enc_head":"374621524a15dc1084366032b5f81c583c5a8c710a535a452c068b89b8851c89ac6a61ad060f558dee56e77cb8dfa7740e4309fa","eph_key":"010d9b3a567a8e662acc9bb928ceadf3da7a722fd2694495d85cfe750414ba65","height":3401974,"position":73928704}]"#,
        )
        .expect("sapling array");
        assert_eq!(sapling[0].position, 73928704);
    }
}
