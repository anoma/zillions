// Copyright 2024 Heliax AG
// SPDX-License-Identifier: Apache-2.0, MIT

//! Stateless trial decryption of compact shielded outputs.
//!
//! The one CPU-critical piece kept in wasm for the new sync: given a UFVK and a
//! batch of compact notes (as served by the `/notes` indexer endpoint), return
//! the ones that decrypt to the wallet, with their value. No wallet DB, no
//! commitment tree, no network — just detection.

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
use zip32::Scope;

use orchard::note::ExtractedNoteCommitment as OrchardCmx;
use orchard::note::Nullifier;
use orchard::note_encryption::{CompactAction, OrchardDomain};
use sapling::note::ExtractedNoteCommitment as SaplingCmu;
use sapling::note_encryption::{CompactOutputDescription, SaplingDomain, Zip212Enforcement};
use zcash_keys::keys::UnifiedFullViewingKey;
use zcash_note_encryption::{batch, EphemeralKeyBytes};
use zillions_sdk_common::Network;

/// A compact output from the indexer. Extra endpoint fields (cv, enc_tail,
/// out_cipher, …) are ignored.
#[derive(Deserialize)]
struct CompactNote {
    commitment: String,
    eph_key: String,
    enc_head: String,
    /// Orchard only: the action nullifier, reused as the note's rho.
    #[serde(default)]
    nf: Option<String>,
    height: u32,
    tx_index: u32,
    index: u32,
    position: u64,
}

#[derive(Deserialize)]
struct Notes {
    #[serde(default)]
    sapling: Vec<CompactNote>,
    #[serde(default)]
    orchard: Vec<CompactNote>,
}

/// A note the UFVK owns, located on-chain, with its value in zatoshis.
#[derive(Serialize)]
struct Hit {
    pool: &'static str,
    /// "external" (received) or "internal" (change).
    scope: &'static str,
    height: u32,
    tx_index: u32,
    index: u32,
    position: u64,
    value: u64,
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

fn decrypt(network: &str, ufvk: &str, notes: Notes) -> Result<Vec<Hit>, String> {
    let network: Network = network.parse().map_err(|_| "invalid network".to_string())?;
    let ufvk = UnifiedFullViewingKey::decode(&network, ufvk)?;

    let mut hits = Vec::new();

    // Sapling: one domain for all outputs (just the ZIP-212 rule).
    if let Some(dfvk) = ufvk.sapling() {
        let ivks: Vec<_> = SCOPES
            .iter()
            .map(|(_, scope)| sapling::keys::PreparedIncomingViewingKey::new(&dfvk.to_ivk(*scope)))
            .collect();
        let outputs = notes
            .sapling
            .iter()
            .map(|n| {
                let cmu = Option::<SaplingCmu>::from(SaplingCmu::from_bytes(&hex_n(&n.commitment)?))
                    .ok_or("bad sapling commitment")?;
                Ok((
                    SaplingDomain::new(Zip212Enforcement::On),
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
                let n = &notes.sapling[i];
                hits.push(Hit {
                    pool: "sapling",
                    scope: SCOPES[scope_idx].0,
                    height: n.height,
                    tx_index: n.tx_index,
                    index: n.index,
                    position: n.position,
                    value: note.value().inner(),
                });
            }
        }
    }

    // Orchard: each action carries its own rho (= nf), so the domain is per-output.
    if let Some(fvk) = ufvk.orchard() {
        let ivks: Vec<_> = SCOPES
            .iter()
            .map(|(_, scope)| orchard::keys::PreparedIncomingViewingKey::new(&fvk.to_ivk(*scope)))
            .collect();
        let outputs = notes
            .orchard
            .iter()
            .map(|n| {
                let nf = n.nf.as_deref().ok_or("orchard note missing nf")?;
                let action = CompactAction::from_parts(
                    Option::<Nullifier>::from(Nullifier::from_bytes(&hex_n(nf)?))
                        .ok_or("bad orchard nullifier")?,
                    Option::<OrchardCmx>::from(OrchardCmx::from_bytes(&hex_n(&n.commitment)?))
                        .ok_or("bad orchard commitment")?,
                    EphemeralKeyBytes(hex_n(&n.eph_key)?),
                    hex_n(&n.enc_head)?,
                );
                let domain = OrchardDomain::for_compact_action(&action);
                Ok((domain, action))
            })
            .collect::<Result<Vec<_>, String>>()?;

        for (i, res) in batch::try_compact_note_decryption(&ivks, &outputs)
            .into_iter()
            .enumerate()
        {
            if let Some(((note, _addr), scope_idx)) = res {
                let n = &notes.orchard[i];
                hits.push(Hit {
                    pool: "orchard",
                    scope: SCOPES[scope_idx].0,
                    height: n.height,
                    tx_index: n.tx_index,
                    index: n.index,
                    position: n.position,
                    value: note.value().inner(),
                });
            }
        }
    }

    Ok(hits)
}

/// Trial-decrypt a batch of compact notes against `ufvk`.
///
/// `notes` is `{ sapling: [...], orchard: [...] }` as returned by the `/notes`
/// endpoint. Returns the hits: `[{ pool, height, tx_index, index, position, value }]`.
#[wasm_bindgen]
pub fn try_decrypt(network: &str, ufvk: &str, notes: JsValue) -> Result<JsValue, JsError> {
    let notes: Notes = serde_wasm_bindgen::from_value(notes).map_err(|e| JsError::new(&e.to_string()))?;
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

        let notes = Notes {
            sapling: vec![CompactNote {
                commitment: "1e184cee50a61ef8bad79f28a360ae0383b4c2a563723744abb8994145e5d109".into(),
                eph_key: "cb476002450613bae9a8fa4240a80f459ca338ab4ac9d0ccd69507d0a4bef985".into(),
                enc_head: "67294ab5a43ac6750a760eb171df88bf67d5847fe3bd1d7ac9f4d2bd3e1e69da31868f810a478d3d5b39366f43e11a8b88ddf384".into(),
                nf: None,
                height: 3342508,
                tx_index: 3,
                index: 0,
                position: 73908202,
            }],
            orchard: vec![CompactNote {
                commitment: "44ba39dbcf4e55c2b2c308eed761a4ffce3f6ae32ec7f01554bb3b2c61eb2936".into(),
                eph_key: "8c03e7196525e7c5370766dcddf8be8592be5a12bdef5de0e0852189a4ceb233".into(),
                enc_head: "87d64a0108dec58c38e80bda117b779a8677477347ebe720b5fccb09d188c1632faa0d30abea7f23223df164cdcf3c0a7e5f344d".into(),
                nf: Some("08df55c7d84fb6419d06023ae4686cc7e44f7b6309b6b573647ac02b7f5e7a39".into()),
                height: 3342505,
                tx_index: 7,
                index: 0,
                position: 49997359,
            }],
        };

        let hits = decrypt(network, &ufvk, notes).expect("decrypt runs");
        assert_eq!(hits.len(), 0);
    }
}
