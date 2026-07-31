// Copyright 2024 Heliax AG
// SPDX-License-Identifier: Apache-2.0, MIT

//! Stateless trial decryption of shielded outputs.
//!
//! The one CPU-critical piece kept in wasm for the new sync: given a UFVK and a
//! batch of notes, return the ones that decrypt to the wallet. No wallet DB, no
//! commitment tree, no network — just detection.
//!
//! Two tiers, matching the indexer's: `/notes/compact` carries only enough to
//! reject a note, and [`try_decrypt`] answers value and nullifier from it.
//! `/notes/full` carries the whole ciphertext, and [`try_decrypt_full`] adds
//! what the compact prefix cannot hold — the memo above all.

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
use zip32::Scope;

use orchard::note::ExtractedNoteCommitment as OrchardCmx;
use orchard::note::Nullifier;
use orchard::note_encryption::{CompactAction, OrchardDomain};
use sapling::note::ExtractedNoteCommitment as SaplingCmu;
use sapling::note_encryption::{CompactOutputDescription, SaplingDomain};
use zcash_keys::keys::UnifiedFullViewingKey;
use zcash_note_encryption::{batch, EphemeralKeyBytes, ShieldedOutput, ENC_CIPHERTEXT_SIZE};
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

/// A `/notes/compact` chunk: one pool's notes. The payload is a bare array, so the pool
/// it belongs to comes from the caller rather than the shape.
enum PoolNotes {
    Sapling(Vec<SaplingNote>),
    Orchard(Vec<OrchardNote>),
}

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

impl ShieldedOutput<OrchardDomain, ENC_CIPHERTEXT_SIZE> for FullOutput<OrchardCmx> {
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
    /// The diversified address the note was sent to (raw bytes, hex).
    recipient: String,
    height: u32,
    tx_index: u16,
    position: u64,
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

fn sapling_ivks(
    dfvk: &sapling::zip32::DiversifiableFullViewingKey,
) -> Vec<sapling::keys::PreparedIncomingViewingKey> {
    SCOPES
        .iter()
        .map(|(_, scope)| sapling::keys::PreparedIncomingViewingKey::new(&dfvk.to_ivk(*scope)))
        .collect()
}

fn orchard_ivks(fvk: &orchard::keys::FullViewingKey) -> Vec<orchard::keys::PreparedIncomingViewingKey> {
    SCOPES
        .iter()
        .map(|(_, scope)| orchard::keys::PreparedIncomingViewingKey::new(&fvk.to_ivk(*scope)))
        .collect()
}

fn decrypt(network: &str, ufvk: &str, notes: PoolNotes) -> Result<Vec<Hit>, String> {
    let network: Network = network.parse().map_err(|_| "invalid network".to_string())?;
    let ufvk = UnifiedFullViewingKey::decode(&network, ufvk)?;

    let mut hits = Vec::new();

    // Sapling: one domain per output (ZIP-212 enforcement is height-dependent).
    if let (PoolNotes::Sapling(sapling_notes), Some(dfvk)) = (&notes, ufvk.sapling()) {
        let nk = &dfvk.fvk().vk.nk;
        let ivks = sapling_ivks(dfvk);
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
        let ivks = orchard_ivks(fvk);
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

fn decrypt_full(
    network: &str,
    ufvk: &str,
    pool: &str,
    notes: &[FullNote],
) -> Result<Vec<FullHit>, String> {
    let network: Network = network.parse().map_err(|_| "invalid network".to_string())?;
    let ufvk = UnifiedFullViewingKey::decode(&network, ufvk)?;

    let mut hits = Vec::new();

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
                hits.push(FullHit {
                    pool: "sapling",
                    scope: SCOPES[scope_idx].0,
                    value: note.value().inner(),
                    nf_mine: hex::encode(note.nf(nk, notes[i].position).0),
                    memo: memo_text(&memo),
                    recipient: hex::encode(addr.to_bytes()),
                    height: notes[i].height,
                    tx_index: notes[i].tx_index,
                    position: notes[i].position,
                });
            }
        }
    }

    // Orchard: each action carries its own rho, so the domain is per-output.
    if let ("orchard", Some(fvk)) = (pool, ufvk.orchard()) {
        let ivks = orchard_ivks(fvk);
        let outputs = notes
            .iter()
            .map(|n| {
                let cm = Option::<OrchardCmx>::from(OrchardCmx::from_bytes(&hex_n(&n.cmu)?))
                    .ok_or("bad orchard commitment")?;
                let enc: [u8; ENC_CIPHERTEXT_SIZE] = hex_n(&n.enc_ciphertext)?;
                let eph_key = EphemeralKeyBytes(hex_n(&n.eph_key)?);
                // OrchardDomain is only constructible from an action, so the
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
                    OrchardDomain::for_compact_action(&action),
                    FullOutput { eph_key, cm, enc },
                ))
            })
            .collect::<Result<Vec<_>, String>>()?;

        for (i, res) in batch::try_note_decryption(&ivks, &outputs)
            .into_iter()
            .enumerate()
        {
            if let Some(((note, addr, memo), scope_idx)) = res {
                hits.push(FullHit {
                    pool: "orchard",
                    scope: SCOPES[scope_idx].0,
                    value: note.value().inner(),
                    nf_mine: hex::encode(note.nullifier(fvk).to_bytes()),
                    memo: memo_text(&memo),
                    recipient: hex::encode(addr.to_raw_address_bytes()),
                    height: notes[i].height,
                    tx_index: notes[i].tx_index,
                    position: notes[i].position,
                });
            }
        }
    }

    Ok(hits)
}

/// Trial-decrypt one pool's compact notes against `ufvk`.
///
/// `notes` is the `/notes/compact` payload: an array of that pool's notes. `pool` is
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

/// Trial-decrypt one pool's full notes against `ufvk`.
///
/// `notes` is the `/notes/full` payload: an array of that pool's notes, whole
/// ciphertexts included. Returns the hits:
/// `[{ pool, scope, value, memo, recipient, height, tx_index, position }]`.
///
/// Worth fetching only for a chunk `try_decrypt` already found a note in — a
/// full chunk is ~50× a compact one.
#[wasm_bindgen]
pub fn try_decrypt_full(
    network: &str,
    ufvk: &str,
    pool: &str,
    notes: JsValue,
) -> Result<JsValue, JsError> {
    if pool != "sapling" && pool != "orchard" {
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
    const SAPLING_FULL: &str = r#"[{"cmu":"ba4ac76a334caebe4c785428055e15f407523fda0e90c9316b2b64a13925072d","enc_ciphertext":"fbfe66029933107a0ca7ab0bfa714909426ede15a8493a12893eecf1bd766f37d4c91ba90e4d3fbc4e784d8bf68019637481a1a66949046030508b04d29a51d7dce6b48375248be2104897a085189ea1064f87da7080954254fa63e8b511e1979fb491393527936025160b6017c8cb5a24c6b73a6c49f8c6d90496e69e36908edaac74fb3aaf6a4adbddae30cb7e33b1298b7aa53b7373c9376b3d09222f217d17a09308e9aca005f7bff5af03aef526cb33a919a74d0587d85702bb9bba8d9f45b4ed480cda1515269c1c3d1779182801de8a459dbace4341d7893c1052ece462b27e573607220da6c83f8da67a1480b78d9a3f96c473b2187f9f46a2a6ae1e200a9abfce3d342b48ba2c9a6e7209e770eadb1fcc382d6194056253592e1eaaf0a6fc859836c27e61027b618efdad7af095a30c9585397ed68a5ef9b8e19a716d850d9e0dc8ef4659938e7e579620e2ebfee84631d6dd116f6d9a0e773419d2b0aa79f160c95eaa3d6ce52a999841ec2cf985fc4d850fc41a0e049f4bfcd15d7f6d6adb76edc7d1e95feda0ab1c5c16bc8416fbdb22b41f3ba7920ac40d865967df2e2cd0c033c8b7adf08895166f0cb2ce61928334258042bda21f49ed0b2a2eb10b2d3654cf92e0be2406f033a214a6edfea201b95d414c9afb6dc87e10b1ff919d322b75470f1d5a0de5726d8f1ed0ee40b5bffd66074255e7fc2b57bbba773a2826c23d10158a5202afb9dd1bd8a332876ff84e162d749a9fbc135d71549c3451e9b93219e57db56d33b69f315fc3d7ec68facefedc438b357330f54321ef894110","eph_key":"e67d6a5d03d47b675c7e53a93d25791cc93e315a9fe0dbc528625c6d2bc10b39","height":3378506,"out_ciphertext":"a4e3bfd9465d94571f0efefe463a14abccdd73ad8c2e6606a21cad0c021610c237da5fb042f5040649ae9b4fdf7ef2313566ffd132957516610272a54fabce8ddcc3fa89d9b8c89bf821570306fb8861","position":73920512,"tx_index":3}]"#;

    const ORCHARD_FULL: &str = r#"[{"cmx":"5dd6a051898ccf617d5bbce6938cc0d6de5f6cbcb7287b475ca6477ea5aad80e","enc_ciphertext":"0cc74ba7c65f5a87193b4f126a37233c2f453e4697e9b45d9a129471358f8eebd1a0bd1b48d705b45006c0f97e954130b495662768cb9bb1ab9001fd17f5491ca1b9afbeffdd0797f74c75d1390f06e0333fb92a914e9ee14c6fbbaea48792ed2344a4765827a670f1bc32e08095be7b29c99cdaa5376f0ce51a573d7a37468624edaceb4b4e8c7a4862eaad2513f7f7b008688918ce898a23cf8460db4afd3b4ed274ff26468a214d5d0bea4544c16be5536642932886f7be030fd7cb51ac831d3aa0ba45c9572f15da9a33a1d5410e8df7fb7046c8dc1b875e0fd7dd5ff7915830e29e3eba575f055b981f9e8141a790172b4edede71b6dda14cc0c6876351cd3a2f8e6cc2a82be6e0b7b42a733964dc026cee47105b33c3a51ffc3438d352099cc3612c3a1a1ee3030ef4e9a609a15b00a46f04a45ad2eb8cd1a2768ca73558f455a96d996ea405adcf7a1a2f294a5c73b8e646494bb7e01edf61d6eaa73e5a465e54329f8f4c0b86466758538e4d50abe3627b5a16f610bbe69aee816c1253e1346a9edde9808b06880fef4865c7f72a2019efe65535d2b28d52ede40053497d02dba6344ab8354b4346f8f14bd37b1b58ce0bc250c192c53d1139aa9ad647b3b432979e1bfae08912724559808fc8c5c9d43cef7514dd26551f40b188a1f2ea3aefc914b8feafa56a459adc637d27025524de03917d4c24e2ea09c90df01ceeb18902ac5f6e15860c9e4a1f3b05004494410cd5688243d944edfa002c54353b8a231158df47d73891c936767fa536d3be15099e5975b92f807d485c8c0a4870fd02","eph_key":"87b4a72d1d91c4f2e285794cff0275e4e2157aed6b848fb54d2f3a65604d6c98","height":3333259,"out_ciphertext":"d23b1e92bc2dda1dfb9f57c3ba35fe06e9c084e94fe1046b21b53c89d1e75d15db12a3cc90f3f137d4ae93f1f57a203bddf67e543ad24518eca0e3b87997b0a91a4f7b282fe051f0556930c3ffe8eb5e","position":49971200,"rho":"0e828a1201388e296301a49f6b0cbb6bb5104cdba44f6006ee2c28c847635b24","tx_index":18}]"#;

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

        assert_eq!(orchard[0].position, 49971200);
        assert_eq!(decrypt_full("main", &ufvk, "sapling", &sapling).expect("sapling runs").len(), 0);
        assert_eq!(decrypt_full("main", &ufvk, "orchard", &orchard).expect("orchard runs").len(), 0);
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

    // A pool's array must deserialize from the raw `/notes/compact` shape, extra fields
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
