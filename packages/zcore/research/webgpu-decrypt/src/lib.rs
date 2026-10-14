//! Wasm reference for the WebGPU trial-decryption prototype: orchard's real
//! compact batch decryption, and each of its steps timed apart, over `n`
//! random actions and two viewing keys (external + internal, as zcore runs).
use std::cell::RefCell;

use blake2b_simd::Params;
use chacha20::cipher::{KeyIvInit, StreamCipher, StreamCipherSeek};
use chacha20::ChaCha20;
use ff::PrimeField;
use group::{Curve, Group, GroupEncoding};
use orchard::keys::{FullViewingKey, PreparedIncomingViewingKey, Scope, SpendingKey};
use orchard::note::{ExtractedNoteCommitment, Nullifier};
use orchard::note_encryption::{CompactAction, OrchardDomain};
use pasta_curves::arithmetic::CurveAffine;
use pasta_curves::glv::{Decomposed, Table};
use pasta_curves::pallas;
use wasm_bindgen::prelude::*;
use zcash_note_encryption::{batch, EphemeralKeyBytes};

#[derive(Default)]
struct State {
    points: Vec<pallas::Point>,
    encoded: Vec<[u8; 32]>,
    scalars: Vec<pallas::Scalar>,
    tables: Vec<Table<pallas::Point>>,
    products: Vec<pallas::Point>,
    affine: Vec<pallas::Affine>,
    actions: Vec<(OrchardDomain, CompactAction)>,
}

thread_local!(static STATE: RefCell<State> = RefCell::default());

fn xorshift(s: &mut u64) -> u64 {
    *s ^= *s << 13;
    *s ^= *s >> 7;
    *s ^= *s << 17;
    *s
}

/// Makes `n` random ephemeral keys and takes the two scalars (32-byte LE each)
/// in `scalars`. Returns the points' affine `x ‖ y`, 64 LE bytes each.
#[wasm_bindgen]
pub fn setup(n: usize, scalars: &[u8]) -> Vec<u8> {
    let mut seed = 0x9e37_79b9_7f4a_7c15;
    let points: Vec<_> = (0..n)
        .map(|_| pallas::Point::generator() * pallas::Scalar::from(xorshift(&mut seed)))
        .collect();
    let mut affine = vec![pallas::Affine::default(); n];
    pallas::Point::batch_normalize(&points, &mut affine);
    let mut out = Vec::with_capacity(64 * n);
    for a in &affine {
        let c = a.coordinates().unwrap();
        out.extend_from_slice(&c.x().to_repr());
        out.extend_from_slice(&c.y().to_repr());
    }
    let actions = affine
        .iter()
        .map(|a| {
            let mut enc = [0u8; 52];
            enc.iter_mut().for_each(|b| *b = xorshift(&mut seed) as u8);
            let small = pallas::Base::from(xorshift(&mut seed)).to_repr();
            let action = CompactAction::from_parts(
                Nullifier::from_bytes(&small).unwrap(),
                ExtractedNoteCommitment::from_bytes(&small).unwrap(),
                EphemeralKeyBytes(a.to_bytes()),
                enc,
            );
            (OrchardDomain::for_compact_action(&action), action)
        })
        .collect();
    STATE.with_borrow_mut(|s| {
        s.encoded = affine.iter().map(|a| a.to_bytes()).collect();
        s.points = points;
        s.scalars = scalars
            .chunks_exact(32)
            .map(|c| pallas::Scalar::from_repr(c.try_into().unwrap()).unwrap())
            .collect();
        s.actions = actions;
    });
    out
}

/// Ephemeral key decoding (point decompression: one square root each).
#[wasm_bindgen]
pub fn decode() -> usize {
    STATE.with_borrow(|s| {
        s.encoded
            .iter()
            .filter(|b| bool::from(pallas::Affine::from_bytes(b).is_some()))
            .count()
    })
}

/// Per-point GLV windows, one batch inversion for all.
#[wasm_bindgen]
pub fn tables() {
    STATE.with_borrow_mut(|s| s.tables = Table::batch(&s.points));
}

/// The key agreement proper: every scalar times every point.
#[wasm_bindgen]
pub fn agree() {
    STATE.with_borrow_mut(|s| {
        let ks: Vec<_> = s.scalars.iter().map(Decomposed::new).collect();
        s.products = ks
            .iter()
            .flat_map(|k| s.tables.iter().map(move |t| t.mul_decomposed(k)))
            .collect();
    });
}

/// Shared secrets to affine (one batch inversion). Returns their `x ‖ y`.
#[wasm_bindgen]
pub fn normalize() -> Vec<u8> {
    STATE.with_borrow_mut(|s| {
        s.affine = vec![pallas::Affine::default(); s.products.len()];
        pallas::Point::batch_normalize(&s.products, &mut s.affine);
        s.affine
            .iter()
            .flat_map(|a| {
                let c = a.coordinates().unwrap();
                [c.x().to_repr(), c.y().to_repr()]
            })
            .flatten()
            .collect()
    })
}

/// KDF^Orchard (BLAKE2b-256) and the 52-byte ChaCha20 compact decryption,
/// per (point, scalar).
#[wasm_bindgen]
pub fn kdf_and_decrypt() -> u8 {
    STATE.with_borrow(|s| {
        let mut acc = 0u8;
        let n = s.encoded.len();
        for (i, a) in s.affine.iter().enumerate() {
            let key = Params::new()
                .hash_length(32)
                .personal(b"Zcash_OrchardKDF")
                .to_state()
                .update(&a.to_bytes())
                .update(&s.encoded[i % n])
                .finalize();
            let mut plain = [0u8; 52];
            let mut c = ChaCha20::new(key.as_bytes().into(), [0u8; 12][..].into());
            c.seek(64);
            c.apply_keystream(&mut plain);
            acc ^= plain[0];
        }
        acc
    })
}

/// orchard's own `try_compact_note_decryption` over the same keys, with the
/// two ivks of a fixed spending key. Returns the hit count (0).
#[wasm_bindgen]
pub fn full() -> usize {
    let sk = SpendingKey::from_bytes([7; 32]).unwrap();
    let fvk = FullViewingKey::from(&sk);
    let ivks: Vec<_> = [Scope::External, Scope::Internal]
        .iter()
        .map(|&sc| PreparedIncomingViewingKey::new(&fvk.to_ivk(sc)))
        .collect();
    STATE.with_borrow(|s| {
        batch::try_compact_note_decryption(&ivks, &s.actions)
            .iter()
            .filter(|r| r.is_some())
            .count()
    })
}
