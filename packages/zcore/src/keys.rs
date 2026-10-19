//! An account's keys from its BIP-39 seed, for the keychain: the viewing key
//! and default addresses it hands the app, the fingerprint that names the
//! seed, and the spending keys its reveal screen shows. Plus fresh shielded
//! addresses from the viewing key, for both, and what kind an address is.
//! Offline key math.

use rand_core::{OsRng, RngCore};
use serde::Serialize;
use wasm_bindgen::prelude::*;
use zcash_keys::address::Address;
use zcash_keys::encoding::{encode_extended_spending_key, AddressCodec};
use zcash_keys::keys::{
    Era, ReceiverRequirement, UnifiedAddressRequest, UnifiedFullViewingKey, UnifiedSpendingKey,
};
use zcash_protocol::consensus::{Network, NetworkConstants};
use zcash_protocol::{PoolType, ShieldedPool};
use zip32::{fingerprint::SeedFingerprint, AccountId, DiversifierIndex};

use crate::parse_network;

fn spending_key(
    network: &Network,
    seed: &[u8],
    hd_index: u32,
) -> Result<UnifiedSpendingKey, String> {
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

fn account_from_ufvk(network: &Network, ufvk: &UnifiedFullViewingKey) -> Result<Account, String> {
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

/// The account at unified full viewing key `ufvk`: `{ ufvk, transparent, unified }`.
#[wasm_bindgen]
pub fn derive_account_from_ufvk(network: &str, ufvk: &str) -> Result<JsValue, JsError> {
    let network = parse_network(network).map_err(|e| JsError::new(&e))?;
    let ufvk = UnifiedFullViewingKey::decode(&network, ufvk).map_err(|e| JsError::new(&e))?;
    let account = account_from_ufvk(&network, &ufvk).map_err(|e| JsError::new(&e))?;
    serde_wasm_bindgen::to_value(&account).map_err(|e| JsError::new(&e.to_string()))
}

fn account(network: &Network, seed: &[u8], hd_index: u32) -> Result<Account, String> {
    let ufvk = spending_key(network, seed, hd_index)?.to_unified_full_viewing_key();
    account_from_ufvk(network, &ufvk)
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
    let fp = SeedFingerprint::from_seed(seed)
        .ok_or_else(|| JsError::new("seed must be 32 to 252 bytes"))?;
    Ok(hex::encode(fp.to_bytes()))
}

/// Orchard and Sapling, never transparent.
const ORCHARD_SAPLING: UnifiedAddressRequest = UnifiedAddressRequest::unsafe_custom(
    ReceiverRequirement::Require,
    ReceiverRequirement::Require,
    ReceiverRequirement::Omit,
);

/// The Orchard receiver alone, which Ironwood pays to as well, for a viewing
/// key with no Sapling part (a Ledger's).
const ORCHARD: UnifiedAddressRequest = UnifiedAddressRequest::unsafe_custom(
    ReceiverRequirement::Require,
    ReceiverRequirement::Omit,
    ReceiverRequirement::Omit,
);

pub(crate) fn fresh(network: &Network, ufvk: &str) -> Result<String, String> {
    let ufvk = UnifiedFullViewingKey::decode(network, ufvk)?;
    // Random, not a counter: the keychain and the app hand out addresses with no shared state.
    let mut j = [0u8; 11];
    OsRng.fill_bytes(&mut j);
    let request = if ufvk.sapling().is_some() {
        ORCHARD_SAPLING
    } else {
        ORCHARD
    };
    // Sapling works on about half the indices; take the next one it does.
    let (address, _) = ufvk
        .find_address(DiversifierIndex::from(j), request)
        .map_err(|e| e.to_string())?;
    Ok(address.encode(network))
}

/// A new shielded address of the account `ufvk` names, unlinkable to its
/// others; nothing needs to remember it, the viewing key finds what it receives.
#[wasm_bindgen]
pub fn fresh_address(network: &str, ufvk: &str) -> Result<String, JsError> {
    let network = parse_network(network).map_err(|e| JsError::new(&e))?;
    fresh(&network, ufvk).map_err(|e| JsError::new(&e))
}

fn pools(network: &Network, ufvk: &str) -> Result<Vec<String>, String> {
    let ufvk = UnifiedFullViewingKey::decode(network, ufvk)?;
    let orchard = ufvk.orchard().is_some();
    Ok([
        ("ironwood", orchard),
        ("orchard", orchard),
        ("sapling", ufvk.sapling().is_some()),
    ]
    .into_iter()
    .filter_map(|(pool, has)| has.then(|| pool.to_string()))
    .collect())
}

/// The shielded pools `ufvk` has a key for, newest first: Ironwood uses the
/// Orchard key. A Ledger's viewing key has no Sapling key.
#[wasm_bindgen]
pub fn ufvk_pools(network: &str, ufvk: &str) -> Result<Vec<String>, JsError> {
    let network = parse_network(network).map_err(|e| JsError::new(&e))?;
    pools(&network, ufvk).map_err(|e| JsError::new(&e))
}

fn kind(network: &Network, address: &str) -> Option<&'static str> {
    let address = Address::decode(network, address)?;
    let shielded = [ShieldedPool::Sapling, ShieldedPool::Orchard]
        .into_iter()
        .any(|pool| address.can_receive_as(PoolType::Shielded(pool)));
    Some(if shielded { "shielded" } else { "transparent" })
}

/// Where a payment to `address` lands: `"shielded"` when it has a shielded
/// receiver, else `"transparent"` (TEX addresses too). `undefined` when it
/// isn't a valid address on `network`.
#[wasm_bindgen]
pub fn address_kind(network: &str, address: &str) -> Result<Option<String>, JsError> {
    let network = parse_network(network).map_err(|e| JsError::new(&e))?;
    Ok(kind(&network, address).map(String::from))
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
        sapling: encode_extended_spending_key(
            network.hrp_sapling_extended_spending_key(),
            usk.sapling(),
        ),
    };
    serde_wasm_bindgen::to_value(&keys).map_err(|e| JsError::new(&e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tells_where_a_payment_lands() {
        let network = Network::MainNetwork;
        let account = account(&network, &[7u8; 32], 0).unwrap();
        let transparent = account.transparent.unwrap();
        assert_eq!(kind(&network, &account.unified), Some("shielded"));
        assert_eq!(kind(&network, &transparent), Some("transparent"));
        let tex = Address::Tex([1u8; 20]).encode(&network);
        assert_eq!(kind(&network, &tex), Some("transparent"));
        assert_eq!(kind(&Network::TestNetwork, &account.unified), None);
        assert_eq!(kind(&network, "t1notanaddress"), None);
    }

    #[test]
    fn pools_are_the_ones_the_viewing_key_has_a_key_for() {
        use zcash_address::unified::{Container, Encoding, Fvk, Ufvk};

        let network = Network::MainNetwork;
        let full = account(&network, &[7u8; 32], 0).unwrap().ufvk;
        assert_eq!(
            pools(&network, &full).unwrap(),
            ["ironwood", "orchard", "sapling"]
        );

        // A Ledger's: Orchard and transparent only.
        let (net, ufvk) = Ufvk::decode(&full).unwrap();
        let items = ufvk
            .items()
            .into_iter()
            .filter(|item| !matches!(item, Fvk::Sapling(_)))
            .collect();
        let ledger = Ufvk::try_from_items(items).unwrap().encode(&net);
        assert_eq!(pools(&network, &ledger).unwrap(), ["ironwood", "orchard"]);
    }

    #[test]
    fn derives_the_account_the_viewing_key_names() {
        let seed = [7u8; 32];
        let network = Network::MainNetwork;
        let account = account(&network, &seed, 0).unwrap();
        assert!(account.ufvk.starts_with("uview1"));
        assert!(account.unified.starts_with("u1"));
        assert!(account.transparent.as_deref().unwrap().starts_with("t1"));

        // The transparent receiver is one the viewing key's own chain derives.
        let first =
            crate::transparent_tx::derive(&network, &account.ufvk, "external", 0, 20).unwrap();
        assert!(first.contains(account.transparent.as_ref().unwrap()));

        // Another index is another account.
        assert_ne!(
            account.ufvk,
            super::account(&network, &seed, 1).unwrap().ufvk
        );
    }

    #[test]
    fn fresh_addresses_are_new_shielded_and_ours() {
        use zcash_keys::address::Address;

        let network = Network::MainNetwork;
        let account = account(&network, &[7u8; 32], 0).unwrap();
        let ufvk = UnifiedFullViewingKey::decode(&network, &account.ufvk).unwrap();

        let a = fresh(&network, &account.ufvk).unwrap();
        let b = fresh(&network, &account.ufvk).unwrap();
        assert_ne!(a, b);
        assert_ne!(a, account.unified);
        for encoded in [a, b] {
            let Some(Address::Unified(ua)) = Address::decode(&network, &encoded) else {
                panic!("not a unified address")
            };
            assert!(ua.transparent().is_none());
            // The account's keys, not just any: both receivers decrypt to it.
            let orchard = ua.orchard().unwrap();
            assert!(ufvk.orchard().unwrap().scope_for_address(orchard).is_some());
            let sapling = ua.sapling().unwrap();
            assert!(ufvk
                .sapling()
                .unwrap()
                .decrypt_diversifier(sapling)
                .is_some());
        }
    }

    #[test]
    fn fresh_addresses_without_sapling() {
        use zcash_address::unified::{Encoding, Fvk, Ufvk};
        use zcash_keys::address::Address;
        use zcash_protocol::consensus::Parameters;

        let network = Network::MainNetwork;
        let full = spending_key(&network, &[7u8; 32], 0)
            .unwrap()
            .to_unified_full_viewing_key();
        // What a Ledger exports: Orchard and transparent, no Sapling.
        let ledger = Ufvk::try_from_items(vec![
            Fvk::Orchard(full.orchard().unwrap().to_bytes()),
            Fvk::P2pkh(full.transparent().unwrap().serialize().try_into().unwrap()),
        ])
        .unwrap()
        .encode(&network.network_type());

        let Some(Address::Unified(ua)) =
            Address::decode(&network, &fresh(&network, &ledger).unwrap())
        else {
            panic!("not a unified address")
        };
        assert!(ua.sapling().is_none() && ua.transparent().is_none());
        assert!(full
            .orchard()
            .unwrap()
            .scope_for_address(ua.orchard().unwrap())
            .is_some());
    }
}
