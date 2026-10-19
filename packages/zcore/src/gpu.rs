//! Compact trial decryption with the key agreement done by the app's WebGPU
//! shader, which is where 80% of [`crate::try_decrypt`]'s time goes.
//!
//! [`crate::gpu_inputs`] is what the shader reads; its shared secrets come
//! back as [`WORDS`] words per (output, ivk). Here they only rule outputs
//! out: an output whose secret yields a note lead byte the pool accepts
//! (about 1 in 256) goes through upstream's own `try_compact_note_decryption`,
//! so every hit is an upstream hit. A few secrets per chunk are re-derived on
//! the CPU, and any disagreement fails the chunk, for the app to retry it on
//! the CPU.

use blake2b_simd::Params;
use chacha20::cipher::{KeyIvInit, StreamCipher, StreamCipherSeek};
use chacha20::ChaCha20;
use ff::{BatchInvert, Field, PrimeField};
use group::{Curve, GroupEncoding};
use pasta_curves::arithmetic::{CurveAffine, CurveExt};
use pasta_curves::pallas;
use zcash_note_encryption::{
    try_compact_note_decryption, Domain, ShieldedOutput, COMPACT_NOTE_SIZE,
};

/// Per (output, ivk): the secret's X, Y and Z as 8 little-endian words each,
/// canonical, then a flag the shader sets when its formulas hit an
/// exceptional case.
pub(crate) const WORDS: usize = 25;

const SPOT_CHECKS: usize = 4;

pub(crate) const ORCHARD_KDF: &[u8; 16] = b"Zcash_OrchardKDF";

/// The shader's per-output input: the ephemeral key's affine coordinates
/// (Pallas x ‖ y, or Jubjub u ‖ v), little-endian. Zeros, which are on neither
/// curve, for a key that doesn't decode; its secret then fails the curve check.
pub(crate) fn epk_coordinates(pool: &str, eph_key: &[u8; 32]) -> [u8; 64] {
    let mut out = [0u8; 64];
    let xy = if pool == "sapling" {
        Option::from(jubjub::AffinePoint::from_bytes(*eph_key))
            .map(|p: jubjub::AffinePoint| (p.get_u().to_repr(), p.get_v().to_repr()))
    } else {
        Option::from(pallas::Affine::from_bytes(eph_key).and_then(|p| p.coordinates()))
            .map(|c: pasta_curves::arithmetic::Coordinates<_>| (c.x().to_repr(), c.y().to_repr()))
    };
    if let Some((x, y)) = xy {
        out[..32].copy_from_slice(&x);
        out[32..].copy_from_slice(&y);
    }
    out
}

fn field<F: PrimeField<Repr = [u8; 32]>>(words: &[u32]) -> Option<F> {
    let mut repr = [0u8; 32];
    for (b, w) in repr.chunks_exact_mut(4).zip(words) {
        b.copy_from_slice(&w.to_le_bytes());
    }
    F::from_repr(repr).into()
}

/// Each (output, ivk)'s secret as the KDF hashes it, or `None` to leave that
/// pair to upstream: the shader flagged it, or its point is off the curve.
pub(crate) fn orchard_secrets(words: &[u32]) -> Vec<Option<[u8; 32]>> {
    let points: Vec<Option<pallas::Point>> = words
        .chunks_exact(WORDS)
        .map(|w| {
            let [x, y, z] = [0, 8, 16].map(|o| field::<pallas::Base>(&w[o..o + 8]));
            let point = pallas::Point::new_jacobian(x?, y?, z?);
            (w[24] == 0 && bool::from(!z?.is_zero()))
                .then_some(Option::<pallas::Point>::from(point))
                .flatten()
        })
        .collect();
    let live: Vec<_> = points.iter().flatten().copied().collect();
    let mut affine = vec![pallas::Affine::default(); live.len()];
    pallas::Point::batch_normalize(&live, &mut affine);
    let mut affine = affine.into_iter();
    points
        .iter()
        .map(|p| p.map(|_| affine.next().unwrap().to_bytes()))
        .collect()
}

/// [`orchard_secrets`] for Sapling: projective Jubjub (u = X/Z, v = Y/Z), the
/// cofactor already cleared by the shader.
pub(crate) fn sapling_secrets(words: &[u32]) -> Vec<Option<[u8; 32]>> {
    let d = -jubjub::Fq::from(10240) * jubjub::Fq::from(10241).invert().unwrap();
    let coords: Vec<Option<[jubjub::Fq; 3]>> = words
        .chunks_exact(WORDS)
        .map(|w| {
            let [x, y, z] = [0, 8, 16].map(|o| field::<jubjub::Fq>(&w[o..o + 8]));
            (w[24] == 0).then_some([x?, y?, z?])
        })
        .collect();
    let mut zs: Vec<_> = coords
        .iter()
        .map(|c| c.map_or(jubjub::Fq::ZERO, |c| c[2]))
        .collect();
    zs.iter_mut().batch_invert();
    coords
        .iter()
        .zip(zs)
        .map(|(c, zinv)| {
            let [x, y, _] = (*c)?;
            let (u, v) = (x * zinv, y * zinv);
            let (u2, v2) = (u.square(), v.square());
            let on_curve = !bool::from(zinv.is_zero()) && v2 - u2 == jubjub::Fq::ONE + d * u2 * v2;
            on_curve.then(|| jubjub::AffinePoint::from_raw_unchecked(u, v).to_bytes())
        })
        .collect()
}

/// [ivk]·epk on the CPU, encoded as the KDF hashes it; `None` when either doesn't decode.
pub(crate) fn orchard_secret(eph_key: &[u8; 32], ivk: &[u8; 32]) -> Option<[u8; 32]> {
    let epk = Option::<pallas::Affine>::from(pallas::Affine::from_bytes(eph_key))?;
    let k = Option::<pallas::Scalar>::from(pallas::Scalar::from_repr(*ivk))?;
    Some((epk * k).to_affine().to_bytes())
}

pub(crate) fn sapling_secret(eph_key: &[u8; 32], ivk: &[u8; 32]) -> Option<[u8; 32]> {
    let epk = Option::<jubjub::ExtendedPoint>::from(jubjub::ExtendedPoint::from_bytes(eph_key))?;
    let k = Option::<jubjub::Fr>::from(jubjub::Fr::from_repr(*ivk))?;
    Some((epk * k).mul_by_cofactor().to_bytes())
}

/// What `batch::try_compact_note_decryption` returns for `outputs`, from the
/// shader's `secrets` (output-major, ivk-minor); `lead_ok` is the domain's
/// lead byte rule. Fails when `cpu_secret(i, j)` disagrees on a spot check.
#[allow(clippy::type_complexity)]
pub(crate) fn finish<D: Domain, O: ShieldedOutput<D, COMPACT_NOTE_SIZE>>(
    ivks: &[D::IncomingViewingKey],
    outputs: &[(D, O)],
    secrets: &[Option<[u8; 32]>],
    kdf_personal: &[u8; 16],
    lead_ok: impl Fn(u8) -> bool,
    cpu_secret: impl Fn(usize, usize) -> Option<[u8; 32]>,
) -> Result<Vec<Option<((D::Note, D::Recipient), usize)>>, String> {
    let n = ivks.len();
    if secrets.len() != outputs.len() * n {
        return Err("GPU secrets don't match the chunk".into());
    }
    // A shader that returns garbage leaves almost every pair to the CPU.
    if secrets.iter().filter(|s| s.is_none()).count() > SPOT_CHECKS + secrets.len() / 100 {
        return Err("GPU secrets mostly off the curve".into());
    }
    let step = outputs.len().div_ceil(SPOT_CHECKS).max(1);
    for i in (0..outputs.len()).step_by(step) {
        for j in 0..n {
            if let (Some(gpu), Some(cpu)) = (secrets[i * n + j], cpu_secret(i, j)) {
                if gpu != cpu {
                    return Err(format!("GPU secret differs from the CPU's at output {i}"));
                }
            }
        }
    }

    Ok(outputs
        .iter()
        .enumerate()
        .map(|(i, (domain, output))| {
            let epk = output.ephemeral_key();
            ivks.iter().enumerate().find_map(|(j, ivk)| {
                let plausible = secrets[i * n + j].is_none_or(|secret| {
                    let key = Params::new()
                        .hash_length(32)
                        .personal(kdf_personal)
                        .to_state()
                        .update(&secret)
                        .update(&epk.0)
                        .finalize();
                    let mut lead = [output.enc_ciphertext()[0]];
                    let mut cipher = ChaCha20::new(key.as_bytes().into(), [0u8; 12][..].into());
                    cipher.seek(64);
                    cipher.apply_keystream(&mut lead);
                    lead_ok(lead[0])
                });
                plausible
                    .then(|| try_compact_note_decryption(domain, ivk, output))
                    .flatten()
                    .map(|hit| (hit, j))
            })
        })
        .collect())
}
