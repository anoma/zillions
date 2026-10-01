//! Finding where the wallet's notes were spent. An Orchard or Ironwood action
//! reveals the nullifier it spends as its own note's rho, so a `/ciphertexts`
//! chunk already lists that chunk's spends; Sapling's live only in the
//! indexer's `/nullifiers` chunks.

use std::collections::HashSet;

use serde::Deserialize;
use vers_vecs::EliasFanoVec;
use wasm_bindgen::prelude::*;

use crate::{chunk_body, ORCHARD_RECORD_LEN};

/// The bytes of each nullifier a `/nullifiers` chunk serves: the first 8 are
/// its Elias-Fano key, the last 2 its suffix.
const NF_PREFIX_LEN: usize = 10;
const NF_KEY_LEN: usize = 8;

#[derive(Deserialize)]
struct CompressedPayload {
    ef: EliasFanoVec,
    suffixes: Vec<[u8; NF_PREFIX_LEN - NF_KEY_LEN]>,
}

/// A `/nullifiers` chunk: sorted and compressed once full, raw in chain order
/// while it is the tail.
#[derive(Deserialize)]
enum NfChunkBody {
    Compressed(CompressedPayload),
    Raw(Vec<[u8; NF_PREFIX_LEN]>),
}

fn nullifier_list(nullifiers: &[u8]) -> Result<std::slice::ChunksExact<'_, u8>, String> {
    if nullifiers.len() % 32 != 0 {
        return Err("nullifiers must be 32 bytes each".into());
    }
    Ok(nullifiers.chunks_exact(32))
}

fn find(pool: &str, ciphertexts: &[u8], nullifiers: &[u8]) -> Result<Vec<u32>, String> {
    if !["orchard", "ironwood"].contains(&pool) {
        return Err(format!("{pool} records carry no nullifiers"));
    }
    let ours: HashSet<&[u8]> = nullifier_list(nullifiers)?.collect();
    Ok(chunk_body(ciphertexts, ORCHARD_RECORD_LEN)?
        .records
        .enumerate()
        .filter(|(_, r)| ours.contains(&r[ORCHARD_RECORD_LEN - 32..]))
        .map(|(i, _)| i as u32)
        .collect())
}

/// The records of an Orchard or Ironwood `/ciphertexts` chunk that spend one
/// of `nullifiers` (each 32 bytes, concatenated), by index in the chunk.
#[wasm_bindgen]
pub fn find_spends(pool: &str, ciphertexts: &[u8], nullifiers: &[u8]) -> Result<Vec<u32>, JsError> {
    find(pool, ciphertexts, nullifiers).map_err(|e| JsError::new(&e))
}

#[derive(serde::Serialize, Debug, PartialEq)]
struct NullifierCheck {
    /// Which of the nullifiers asked about the chunk holds, by index.
    spent: Vec<u32>,
    /// Whether the chunk is full, so it never changes; the tail chunk is not.
    frozen: bool,
}

fn check(body: &[u8], nullifiers: &[u8]) -> Result<NullifierCheck, String> {
    let body: NfChunkBody = postcard::from_bytes(body).map_err(|e| e.to_string())?;
    let holds = |nf: &[u8]| match &body {
        NfChunkBody::Compressed(p) => {
            let key = u64::from_be_bytes(nf[..NF_KEY_LEN].try_into().unwrap());
            // Keys repeat when only the suffix differs, so `key`'s run is
            // bounded by ranks. Not by `get`: vers-vecs 1.10's misreads on wasm32.
            let end = key.checked_add(1).map_or(p.ef.len(), |next| p.ef.rank(next) as usize);
            (p.ef.rank(key) as usize..end).any(|i| p.suffixes[i] == nf[NF_KEY_LEN..NF_PREFIX_LEN])
        }
        NfChunkBody::Raw(prefixes) => prefixes.iter().any(|p| p[..] == nf[..NF_PREFIX_LEN]),
    };
    let spent = nullifier_list(nullifiers)?
        .enumerate()
        .filter(|(_, nf)| holds(nf))
        .map(|(i, _)| i as u32)
        .collect();
    Ok(NullifierCheck { spent, frozen: matches!(body, NfChunkBody::Compressed(_)) })
}

/// Which of `nullifiers` (each 32 bytes, concatenated) a `/nullifiers` chunk
/// holds, matched on the 10 bytes it serves. Returns `{ spent, frozen }`:
/// `spent` indexes into `nullifiers`; a chunk that isn't `frozen` is the tail.
#[wasm_bindgen]
pub fn nullifiers_spent(body: &[u8], nullifiers: &[u8]) -> Result<JsValue, JsError> {
    let check = check(body, nullifiers).map_err(|e| JsError::new(&e))?;
    serde_wasm_bindgen::to_value(&check).map_err(|e| JsError::new(&e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(serde::Serialize)]
    struct EncodedPayload {
        ef: EliasFanoVec,
        suffixes: Vec<[u8; 2]>,
    }

    /// Encoded as the indexer encodes them; the variant index leads.
    fn compressed(mut prefixes: Vec<[u8; NF_PREFIX_LEN]>) -> Vec<u8> {
        prefixes.sort_unstable();
        let keys: Vec<u64> = prefixes.iter().map(|p| u64::from_be_bytes(p[..8].try_into().unwrap())).collect();
        let suffixes = prefixes.iter().map(|p| [p[8], p[9]]).collect();
        let payload = EncodedPayload { ef: EliasFanoVec::from_slice(&keys), suffixes };
        [vec![0], postcard::to_allocvec(&payload).unwrap()].concat()
    }

    fn nf(prefix: [u8; NF_PREFIX_LEN], fill: u8) -> [u8; 32] {
        let mut nf = [fill; 32];
        nf[..NF_PREFIX_LEN].copy_from_slice(&prefix);
        nf
    }

    #[test]
    fn checks_compressed_and_raw_chunks() {
        let a = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        // Same key as `a`, other suffix: the duplicate-key path.
        let b = [1, 2, 3, 4, 5, 6, 7, 8, 0, 1];
        let c = [200, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        let missing = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11];
        let asked = [nf(missing, 0), nf(a, 1), nf(c, 2)].concat();

        let full = check(&compressed(vec![c, a, b]), &asked).expect("compressed");
        assert_eq!(full, NullifierCheck { spent: vec![1, 2], frozen: true });

        let mut raw = vec![1, 2];
        raw.extend(a);
        raw.extend(b);
        let tail = check(&raw, &asked).expect("raw");
        assert_eq!(tail, NullifierCheck { spent: vec![1], frozen: false });

        assert!(check(&raw, &asked[..31]).is_err());
    }

    #[test]
    fn finds_orchard_records_spending_ours() {
        let record = |rho: u8| {
            let mut r = vec![0u8; ORCHARD_RECORD_LEN];
            r[ORCHARD_RECORD_LEN - 32..].fill(rho);
            hex::encode(r)
        };
        let mut header = [0u8; 32];
        let header = postcard::to_slice(&(1u32, 1u32, 1u32, 3usize), &mut header).unwrap();
        let mut body = header.to_vec();
        for rho in [7, 8, 9] {
            body.extend(hex::decode(record(rho)).unwrap());
        }

        let ours = [[9u8; 32], [7; 32], [1; 32]].concat();
        assert_eq!(find("orchard", &body, &ours).expect("finds"), vec![0, 2]);
        assert!(find("sapling", &body, &ours).is_err());
    }
}
