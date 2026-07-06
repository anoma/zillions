// Copyright 2026 Heliax
// SPDX-License-Identifier: Apache-2.0, MIT

use std::sync::OnceLock;

use wasm_bindgen::prelude::*;
use zcash_proofs::prover::LocalTxProver;

use crate::error::Error;

// Shared across threads: workers see the prover through the shared wasm memory.
static SAPLING_PROVER: OnceLock<LocalTxProver> = OnceLock::new();

/// Installs the Sapling proving parameters (sapling-spend.params and
/// sapling-output.params bytes). Must be called before any proving or sending
/// operation. Idempotent: subsequent calls are no-ops.
///
/// Panics if the bytes do not match the expected parameter hashes, so callers
/// should verify integrity before passing them in.
#[wasm_bindgen(js_name = initSaplingParams)]
pub fn init_sapling_params(spend_bytes: &[u8], output_bytes: &[u8]) {
    if SAPLING_PROVER.get().is_some() {
        return;
    }
    let prover = LocalTxProver::from_bytes(spend_bytes, output_bytes);
    let _ = SAPLING_PROVER.set(prover);
}

/// Returns whether the Sapling proving parameters have been loaded.
#[wasm_bindgen(js_name = saplingParamsLoaded)]
pub fn sapling_params_loaded() -> bool {
    SAPLING_PROVER.get().is_some()
}

pub(crate) fn sapling_prover() -> Result<&'static LocalTxProver, Error> {
    SAPLING_PROVER.get().ok_or(Error::SaplingParamsNotLoaded)
}
