//! An account's keys from its BIP-39 seed, for the keychain: the viewing key
//! and default addresses it hands the app, the fingerprint that names the
//! seed, and the spending-key reveal, plus what a hardware device's account
//! xpub stands for. Plus fresh shielded addresses from the viewing key, for
//! both, and what kind an address is. Offline key math.

use base58::{FromBase58, ToBase58};
use rand_core::Rng;
use secrecy::ExposeSecret;
use serde::Serialize;
use sha2::{Digest, Sha256};
use transparent::keys::AccountPubKey;
use wasm_bindgen::prelude::*;
use zcash_address::unified::{Encoding, Fvk, Revision, Ufvk, Uitem};
use zcash_keys::address::Address;
use zcash_keys::encoding::{encode_extended_spending_key, AddressCodec};
use zcash_keys::keys::{
    Era, ReceiverRequirement, UnifiedAddressRequest, UnifiedFullViewingKey, UnifiedSpendingKey,
};
use zcash_protocol::consensus::{Network, Parameters};
use zcash_protocol::{PoolType, ShieldedPool};
use zeroize::Zeroizing;
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
    // A key with no shielded item (a Trezor's) has no shielded address to
    // ask for: its default is the transparent-only unified one.
    let (shielded, _) = ufvk
        .default_address(if ufvk.orchard().is_some() || ufvk.sapling().is_some() {
            UnifiedAddressRequest::SHIELDED
        } else {
            UnifiedAddressRequest::TRANSPARENT_ONLY
        })
        .map_err(|e| e.to_string())?;
    Ok(Account {
        ufvk: ufvk.encode(network).map_err(|e| e.to_string())?,
        transparent: all.transparent().map(|addr| addr.encode(network)),
        unified: shielded.encode(network),
    })
}

fn account(network: &Network, seed: &[u8], hd_index: u32) -> Result<Account, String> {
    let ufvk = spending_key(network, seed, hd_index)?.to_unified_full_viewing_key();
    account_from_ufvk(network, &ufvk)
}

/// The account at unified full viewing key `ufvk` (a device's export):
/// `{ ufvk, transparent, unified }`.
#[wasm_bindgen]
pub fn derive_account_from_ufvk(network: &str, ufvk: &str) -> Result<JsValue, JsError> {
    let network = parse_network(network).map_err(|e| JsError::new(&e))?;
    let ufvk =
        UnifiedFullViewingKey::decode(&network, ufvk).map_err(|e| JsError::new(&e.to_string()))?;
    let account = account_from_ufvk(&network, &ufvk).map_err(|e| JsError::new(&e))?;
    serde_wasm_bindgen::to_value(&account).map_err(|e| JsError::new(&e.to_string()))
}

/// The account at ZIP-32 index `hd_index`: `{ ufvk, transparent, unified }`.
#[wasm_bindgen]
pub fn derive_account(network: &str, seed: Vec<u8>, hd_index: u32) -> Result<JsValue, JsError> {
    let network = parse_network(network).map_err(|e| JsError::new(&e))?;
    // The wasm copy of the seed is zero-filled when the call ends.
    let account =
        account(&network, &Zeroizing::new(seed), hd_index).map_err(|e| JsError::new(&e))?;
    serde_wasm_bindgen::to_value(&account).map_err(|e| JsError::new(&e.to_string()))
}

/// The transparent-only viewing key an account xpub names: the extended
/// public key at `m/44'/133'/account'`, as a device's key export hands it
/// over, encoded as a Revision 2 UFVK with only a P2PKH item (`uvf1…`).
/// The xpub's version bytes name the network it was made for, but they are
/// not read: the account key is their whole payload, and the call's network
/// decides the encoding.
#[wasm_bindgen]
pub fn ufvk_from_transparent_xpub(network: &str, xpub: &str) -> Result<String, JsError> {
    let network = parse_network(network).map_err(|e| JsError::new(&e))?;
    ufvk_from_transparent_xpub_inner(&network, xpub).map_err(|e| JsError::new(&e))
}

fn ufvk_from_transparent_xpub_inner(network: &Network, xpub: &str) -> Result<String, String> {
    let decoded = base58check(xpub)?;
    if decoded.len() != 78 {
        return Err("not an extended public key".into());
    }
    // An extended key's payload is its 32-byte chain code, then its
    // compressed public key: what an account key serializes as.
    let key =
        AccountPubKey::deserialize(decoded[13..78].try_into().map_err(|_| "bad key payload")?)
            .map_err(|e| e.to_string())?;
    let item = Fvk::P2pkh(key.serialize().try_into().map_err(|_| "bad key payload")?);
    Ok(Ufvk::try_from_items(Revision::R2, vec![Uitem::Data(item)])
        .map_err(|e| format!("{e:?}"))?
        .encode(&network.network_type()))
}

/// The Bitcoin alphabet's base58, checksummed: an extended key's encoding.
fn base58check(encoded: &str) -> Result<Vec<u8>, String> {
    let bytes = encoded
        .from_base58()
        .map_err(|_| "not a base58 string".to_string())?;
    if bytes.len() < 4 {
        return Err("not an extended public key".into());
    }
    let (payload, checksum) = bytes.split_at(bytes.len() - 4);
    if sha256d(payload)[..4] != *checksum {
        return Err("bad base58 checksum".into());
    }
    Ok(payload.to_vec())
}

fn sha256d(data: &[u8]) -> [u8; 32] {
    Sha256::digest(Sha256::digest(data)).into()
}

/// The seed's ZIP-32 fingerprint, hex. Names the seed without revealing it.
#[wasm_bindgen]
pub fn seed_fingerprint(seed: Vec<u8>) -> Result<String, JsError> {
    let fp = SeedFingerprint::from_seed(&Zeroizing::new(seed))
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
    let ufvk = UnifiedFullViewingKey::decode(network, ufvk).map_err(|e| e.to_string())?;
    // Random, not a counter: the keychain and the app hand out addresses with no shared state.
    let mut j = [0u8; 11];
    crate::rng().fill_bytes(&mut j);
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
    let ufvk = UnifiedFullViewingKey::decode(network, ufvk).map_err(|e| e.to_string())?;
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
pub fn spending_keys(network: &str, seed: Vec<u8>, hd_index: u32) -> Result<JsValue, JsError> {
    let network = parse_network(network).map_err(|e| JsError::new(&e))?;
    let seed = Zeroizing::new(seed);
    let usk = spending_key(&network, &seed, hd_index).map_err(|e| JsError::new(&e))?;
    let keys = SpendingKeys {
        orchard: hex::encode(usk.to_bytes(Era::Orchard).expose_secret()),
        sapling: encode_extended_spending_key(
            zcash_keys::constants::hrp_sapling_extended_spending_key(network.network_type()),
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
        use zcash_address::unified::{Container, Encoding, Fvk, Revision, Ufvk, Uitem};

        let network = Network::MainNetwork;
        let full = account(&network, &[7u8; 32], 0).unwrap().ufvk;
        assert_eq!(
            pools(&network, &full).unwrap(),
            ["ironwood", "orchard", "sapling"]
        );

        // A Ledger's: Orchard and transparent only.
        let (net, _, ufvk) = Ufvk::decode(&full).unwrap();
        let items = ufvk
            .items()
            .into_iter()
            .filter(|item| !matches!(item, Fvk::Sapling(_)))
            .map(Uitem::Data)
            .collect();
        let ledger = Ufvk::try_from_items(Revision::R0, items)
            .unwrap()
            .encode(&net);
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
    fn derives_the_same_account_from_a_devices_viewing_key() {
        let network = Network::MainNetwork;
        let account = account(&network, &[7u8; 32], 0).unwrap();
        let from_key = account_from_ufvk(
            &network,
            &UnifiedFullViewingKey::decode(&network, &account.ufvk).unwrap(),
        )
        .unwrap();
        assert_eq!(from_key.ufvk, account.ufvk);
        assert_eq!(from_key.transparent, account.transparent);
        assert_eq!(from_key.unified, account.unified);
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
        use zcash_address::unified::{Encoding, Fvk, Revision, Ufvk, Uitem};
        use zcash_keys::address::Address;

        let network = Network::MainNetwork;
        let full = spending_key(&network, &[7u8; 32], 0)
            .unwrap()
            .to_unified_full_viewing_key();
        // What a Ledger exports: Orchard and transparent, no Sapling.
        let ledger = Ufvk::try_from_items(
            Revision::R0,
            vec![
                Uitem::Data(Fvk::Orchard(full.orchard().unwrap().to_bytes())),
                Uitem::Data(Fvk::P2pkh(
                    full.p2pkh().unwrap().serialize().try_into().unwrap(),
                )),
            ],
        )
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

    /// The account xpub a device exports at `m/44'/133'/0'`, built from the
    /// account key the same way a device serializes it.
    fn xpub() -> String {
        let payload = spending_key(&Network::MainNetwork, &[7u8; 32], 0)
            .unwrap()
            .to_unified_full_viewing_key()
            .p2pkh()
            .unwrap()
            .serialize();
        // Version bytes for a mainnet extended public key, depth 3, a
        // fingerprint and child number no one reads, the key, and the
        // checksum.
        let mut encoded = vec![0x04, 0x88, 0xB2, 0x1E, 3, 0, 0, 0, 0, 0, 0, 0, 0];
        encoded.extend_from_slice(&payload);
        encoded.extend_from_slice(&sha256d(&encoded)[..4]);
        encoded.to_base58()
    }

    #[test]
    fn a_devices_xpub_names_the_account_it_signs_for() {
        let network = Network::MainNetwork;

        // The xpub's payload is the account key's chain code and key, so the
        // round trip lands on the same account, whatever its version bytes.
        let ufvk = ufvk_from_transparent_xpub_inner(&network, &xpub()).unwrap();
        assert!(ufvk.starts_with("uvf1"));
        let account_key = spending_key(&network, &[7u8; 32], 0)
            .unwrap()
            .to_unified_full_viewing_key()
            .p2pkh()
            .unwrap()
            .serialize();
        let decoded = UnifiedFullViewingKey::decode(&network, &ufvk).unwrap();
        assert_eq!(decoded.p2pkh().unwrap().serialize(), account_key);
        // Transparent addresses the account derives are the same chain the
        // device signs at.
        let from_key = account_from_ufvk(&network, &decoded).unwrap();
        assert!(from_key.transparent.as_ref().unwrap().starts_with("t1"));
        assert!(from_key.unified.starts_with("tu1"));
        let first = crate::transparent_tx::derive(&network, &ufvk, "external", 0, 20).unwrap();
        assert!(first.contains(from_key.transparent.as_ref().unwrap()));

        // And the checksum, length and alphabet all have a say.
        let mut corrupt = xpub();
        corrupt.replace_range(4..5, "i");
        assert!(ufvk_from_transparent_xpub_inner(&network, &corrupt).is_err());
        assert!(ufvk_from_transparent_xpub_inner(&network, "").is_err());
        assert!(ufvk_from_transparent_xpub_inner(&network, "0OIl").is_err());
    }

    #[test]
    fn a_transparent_only_viewing_key_has_no_shielded_address() {
        let network = Network::MainNetwork;
        let ufvk = ufvk_from_transparent_xpub_inner(&network, &xpub()).unwrap();
        let account = account_from_ufvk(
            &network,
            &UnifiedFullViewingKey::decode(&network, &ufvk).unwrap(),
        )
        .unwrap();

        // The transparent receiver is the unified address's own receiver.
        let Address::Unified(ua) = Address::decode(&network, &account.unified).unwrap() else {
            panic!("not a unified address")
        };
        assert_eq!(
            ua.transparent().unwrap().encode(&network),
            account.transparent.unwrap()
        );

        // Fresh shielded addresses don't exist for it.
        assert!(fresh(&network, &ufvk).is_err());
        assert!(pools(&network, &ufvk).unwrap().is_empty());
    }
}
