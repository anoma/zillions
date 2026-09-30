// Copyright 2026 Heliax AG
// SPDX-License-Identifier: Apache-2.0, MIT

//! An account's keys from its BIP-39 seed, for the keychain: the viewing key
//! and default addresses it hands the app, the fingerprint that names the
//! seed, and the spending keys its reveal screen shows. Offline key math.

use serde::Serialize;
use wasm_bindgen::prelude::*;
use zcash_keys::encoding::{encode_extended_spending_key, AddressCodec};
use zcash_keys::keys::{Era, UnifiedAddressRequest, UnifiedSpendingKey};
use zcash_protocol::consensus::{Network, NetworkConstants};
use zip32::{AccountId, fingerprint::SeedFingerprint};

use crate::parse_network;

fn spending_key(network: &Network, seed: &[u8], hd_index: u32) -> Result<UnifiedSpendingKey, String> {
    let account = AccountId::try_from(hd_index).map_err(|_| "account index out of range")?;
    UnifiedSpendingKey::from_seed(network, seed, account).map_err(|e| format!("{e:?}"))
}

#[derive(Serialize)]
struct Account {
    ufvk: String,
    /// The default address's transparent receiver, the one wallets show.
    transparent: Option<String>,
    /// The default shielded address: Orchard and Sapling, no transparent
    /// receiver, as standard wallets display it.
    unified: String,
}

fn account(network: &Network, seed: &[u8], hd_index: u32) -> Result<Account, String> {
    let ufvk = spending_key(network, seed, hd_index)?.to_unified_full_viewing_key();
    // Requiring every receiver skips the indices Sapling can't use, so this
    // lands on the same index as the shielded default below.
    let (all, _) = ufvk
        .default_address(UnifiedAddressRequest::AllAvailableKeys)
        .map_err(|e| e.to_string())?;
    let (shielded, _) = ufvk
        .default_address(UnifiedAddressRequest::SHIELDED)
        .map_err(|e| e.to_string())?;
    Ok(Account {
        ufvk: ufvk.encode(network),
        transparent: all.transparent().map(|addr| addr.encode(network)),
        unified: shielded.encode(network),
    })
}

/// The account at ZIP-32 index `hd_index`: `{ ufvk, transparent, unified }`.
#[wasm_bindgen]
pub fn derive_account(network: &str, seed: &[u8], hd_index: u32) -> Result<JsValue, JsError> {
    let network = parse_network(network).map_err(|e| JsError::new(&e))?;
    let account = account(&network, seed, hd_index).map_err(|e| JsError::new(&e))?;
    serde_wasm_bindgen::to_value(&account).map_err(|e| JsError::new(&e.to_string()))
}

/// The seed's ZIP-32 fingerprint, hex. Names the seed without revealing it.
#[wasm_bindgen]
pub fn seed_fingerprint(seed: &[u8]) -> Result<String, JsError> {
    let fp = SeedFingerprint::from_seed(seed).ok_or_else(|| JsError::new("seed must be 32 to 252 bytes"))?;
    Ok(hex::encode(fp.to_bytes()))
}

#[derive(Serialize)]
struct SpendingKeys {
    /// The whole unified spending key in librustzcash's storage encoding, hex:
    /// every pool, but no other wallet imports it.
    orchard: String,
    /// The Sapling extended spending key, Bech32: portable, Sapling only.
    sapling: String,
}

/// The account's spending secret in both encodings: `{ orchard, sapling }`.
#[wasm_bindgen]
pub fn spending_keys(network: &str, seed: &[u8], hd_index: u32) -> Result<JsValue, JsError> {
    let network = parse_network(network).map_err(|e| JsError::new(&e))?;
    let usk = spending_key(&network, seed, hd_index).map_err(|e| JsError::new(&e))?;
    let keys = SpendingKeys {
        orchard: hex::encode(usk.to_bytes(Era::Orchard)),
        sapling: encode_extended_spending_key(network.hrp_sapling_extended_spending_key(), usk.sapling()),
    };
    serde_wasm_bindgen::to_value(&keys).map_err(|e| JsError::new(&e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derives_the_account_the_viewing_key_names() {
        let seed = [7u8; 32];
        let network = Network::MainNetwork;
        let account = account(&network, &seed, 0).unwrap();
        assert!(account.ufvk.starts_with("uview1"));
        assert!(account.unified.starts_with("u1"));
        assert!(account.transparent.as_deref().unwrap().starts_with("t1"));

        // The transparent receiver is one the viewing key's own chain derives.
        let first = crate::transparent_tx::derive(&network, &account.ufvk, "external", 0, 20).unwrap();
        assert!(first.contains(account.transparent.as_ref().unwrap()));

        // Another index is another account.
        assert_ne!(account.ufvk, super::account(&network, &seed, 1).unwrap().ufvk);
    }
}
