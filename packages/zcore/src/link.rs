//! Payment links' keys (docs/design/payment-links.md): a random Orchard
//! spending key whose default address holds the link's one note, and its
//! sealed copy for the funding memo, which only the sender's seed opens.

use blake2b_simd::Params;
use rand_core::{OsRng, RngCore};
use serde::Serialize;
use wasm_bindgen::prelude::*;
use zcash_address::unified::{Encoding, Fvk, Ufvk};
use zcash_keys::address::UnifiedAddress;
use zcash_keys::keys::UnifiedSpendingKey;
use zcash_protocol::consensus::{Network, Parameters};
use zip32::{AccountId, Scope};

use crate::parse_network;

const KEY_BYTES: usize = 32;

pub(crate) fn spending_key(key: &[u8]) -> Result<orchard::keys::SpendingKey, String> {
    let bytes: [u8; KEY_BYTES] = key.try_into().map_err(|_| "a link key is 32 bytes")?;
    Option::from(orchard::keys::SpendingKey::from_bytes(bytes))
        .ok_or_else(|| "not a link key".to_string())
}

fn new_key() -> [u8; KEY_BYTES] {
    loop {
        let mut key = [0u8; KEY_BYTES];
        OsRng.fill_bytes(&mut key);
        if spending_key(&key).is_ok() {
            return key;
        }
    }
}

/// 32 random bytes that make an Orchard spending key: a new link.
#[wasm_bindgen]
pub fn new_link_key() -> Vec<u8> {
    new_key().to_vec()
}

#[derive(Serialize)]
struct LinkInfo {
    /// The default address, Orchard receiver only, so a send pays it in Ironwood.
    address: String,
    /// The nullifier key, hex: tells whether the link's note was spent.
    nk: String,
    /// A viewing key of the link alone, Orchard only: finds its note.
    ufvk: String,
}

fn nk(fvk: &orchard::keys::FullViewingKey) -> [u8; 32] {
    // Raw FVK encoding: ak ‖ nk ‖ rivk.
    fvk.to_bytes()[32..64].try_into().unwrap()
}

fn info(network: &Network, key: &[u8]) -> Result<LinkInfo, String> {
    let fvk = orchard::keys::FullViewingKey::from(&spending_key(key)?);
    let receiver = fvk.address_at(0u32, Scope::External);
    let ua = UnifiedAddress::from_receivers(Some(receiver), None, None)
        .ok_or("no unified address for the link")?;
    let ufvk = Ufvk::try_from_items(vec![Fvk::Orchard(fvk.to_bytes())])
        .map_err(|e| e.to_string())?
        .encode(&network.network_type());
    Ok(LinkInfo {
        address: ua.encode(network),
        nk: hex::encode(nk(&fvk)),
        ufvk,
    })
}

/// The link's address and nullifier key: `{ address, nk }`.
#[wasm_bindgen]
pub fn link_info(network: &str, key: &[u8]) -> Result<JsValue, JsError> {
    let network = parse_network(network).map_err(|e| JsError::new(&e))?;
    let info = info(&network, key).map_err(|e| JsError::new(&e))?;
    serde_wasm_bindgen::to_value(&info).map_err(|e| JsError::new(&e.to_string()))
}

/// The pad that seals the link with nullifier key `nk`. `nk` differs per
/// link, so no pad is used twice.
fn pad(network: &Network, seed: &[u8], hd_index: u32, nk: &[u8]) -> Result<[u8; 32], String> {
    let account = AccountId::try_from(hd_index).map_err(|_| "account index out of range")?;
    let usk =
        UnifiedSpendingKey::from_seed(network, seed, account).map_err(|e| format!("{e:?}"))?;
    let sealing = Params::new()
        .hash_length(32)
        .personal(b"Zillions_PayLink")
        .hash(usk.orchard().to_bytes());
    let pad = Params::new()
        .hash_length(32)
        .key(sealing.as_bytes())
        .hash(nk);
    Ok(pad.as_bytes().try_into().unwrap())
}

fn xor(a: &[u8], b: &[u8; 32]) -> Vec<u8> {
    a.iter().zip(b).map(|(x, y)| x ^ y).collect()
}

fn seal(network: &Network, seed: &[u8], hd_index: u32, key: &[u8]) -> Result<Vec<u8>, String> {
    let fvk = orchard::keys::FullViewingKey::from(&spending_key(key)?);
    Ok(xor(key, &pad(network, seed, hd_index, &nk(&fvk))?))
}

fn open(
    network: &Network,
    seed: &[u8],
    hd_index: u32,
    sealed: &[u8],
    nk_bytes: &[u8],
) -> Result<Vec<u8>, String> {
    if sealed.len() != KEY_BYTES {
        return Err("a sealed link key is 32 bytes".into());
    }
    let key = xor(sealed, &pad(network, seed, hd_index, nk_bytes)?);
    // Another account's seal, or a damaged memo, opens to a different key.
    let opened = spending_key(&key)
        .ok()
        .map(|sk| nk(&orchard::keys::FullViewingKey::from(&sk)));
    if opened.as_ref().map(|n| n.as_slice()) != Some(nk_bytes) {
        return Err("this link wasn't sealed by this account".into());
    }
    Ok(key)
}

/// The link key sealed to the account at `hd_index`, for the funding memo.
#[wasm_bindgen]
pub fn seal_link_key(
    network: &str,
    seed: &[u8],
    hd_index: u32,
    key: &[u8],
) -> Result<Vec<u8>, JsError> {
    let network = parse_network(network).map_err(|e| JsError::new(&e))?;
    seal(&network, seed, hd_index, key).map_err(|e| JsError::new(&e))
}

/// The link key back from its seal and nullifier key, both from the memo.
#[wasm_bindgen]
pub fn open_link_key(
    network: &str,
    seed: &[u8],
    hd_index: u32,
    sealed: &[u8],
    nk: &[u8],
) -> Result<Vec<u8>, JsError> {
    let network = parse_network(network).map_err(|e| JsError::new(&e))?;
    open(&network, seed, hd_index, sealed, nk).map_err(|e| JsError::new(&e))
}

/// `0xFF | "PAYLINK" | version`, then `nk` and the sealed key, then the description.
const MEMO_HEADER: &[u8] = b"\xffPAYLINK\x01";
const DESCRIPTION_AT: usize = MEMO_HEADER.len() + 32 + 32;

/// A link's claim, signed and ready to prove: its one note (as sync encodes
/// notes, hex) at `position` → `to`, less the claim fee. `trees` are the
/// Ironwood tree data, as for a send; `claimer_ufvk` keeps the creator from
/// seeing where it went. `tip` is the chain's height now.
#[allow(clippy::too_many_arguments)]
#[wasm_bindgen]
pub fn claim_pczt(
    network: &str,
    key: &[u8],
    note: &str,
    position: u64,
    trees: JsValue,
    to: &str,
    claimer_ufvk: &str,
    tip: u32,
) -> Result<Vec<u8>, JsError> {
    let network = parse_network(network).map_err(|e| JsError::new(&e))?;
    let trees: crate::build::Trees =
        serde_wasm_bindgen::from_value(trees).map_err(|e| JsError::new(&e.to_string()))?;
    let pczt = crate::build::claim(&network, key, note, position, &trees, to, claimer_ufvk, tip)
        .map_err(|e| JsError::new(&e))?;
    pczt.serialize()
        .map_err(|e| JsError::new(&format!("{e:?}")))
}

/// What a funding memo carries to show its link again: `nk` and the sealed
/// key, hex. Only the sender's seed opens the seal.
#[derive(Serialize)]
pub(crate) struct MemoLink {
    nk: String,
    sealed: String,
}

/// The link `memo` funds, if it funds one.
pub(crate) fn memo_link(memo: &[u8]) -> Option<MemoLink> {
    memo_description(memo)?;
    let at = MEMO_HEADER.len();
    Some(MemoLink {
        nk: hex::encode(&memo[at..at + 32]),
        sealed: hex::encode(&memo[at + 32..DESCRIPTION_AT]),
    })
}

/// A payment link's description, when `memo` funds one: `Some(None)` for a
/// link without one, `None` for any other memo.
pub(crate) fn memo_description(memo: &[u8]) -> Option<Option<String>> {
    if !memo.starts_with(MEMO_HEADER) || memo.len() < DESCRIPTION_AT {
        return None;
    }
    // Memos are zero-padded to 512 bytes.
    let text = &memo[DESCRIPTION_AT..];
    let end = text.iter().rposition(|&b| b != 0).map_or(0, |i| i + 1);
    Some(
        std::str::from_utf8(&text[..end])
            .ok()
            .filter(|t| !t.is_empty())
            .map(String::from),
    )
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use zcash_keys::address::Address;

    pub(crate) fn key() -> [u8; KEY_BYTES] {
        new_key()
    }

    /// The link's address on mainnet.
    pub(crate) fn address(key: &[u8]) -> String {
        info(&Network::MainNetwork, key).unwrap().address
    }

    const SEED: [u8; 32] = [7u8; 32];

    #[test]
    fn a_link_address_has_only_an_orchard_receiver() {
        let network = Network::MainNetwork;
        let info = info(&network, &new_key()).unwrap();
        let Some(Address::Unified(ua)) = Address::decode(&network, &info.address) else {
            panic!("not a unified address")
        };
        assert!(ua.orchard().is_some());
        assert!(ua.sapling().is_none() && ua.transparent().is_none());
        assert_eq!(info.nk.len(), 64);
    }

    #[test]
    fn a_fixed_key_gives_a_fixed_link() {
        // Permanent once links exist: these must never change.
        let network = Network::MainNetwork;
        let key = [1u8; 32];
        let info = info(&network, &key).unwrap();
        let sealed = seal(&network, &SEED, 0, &key).unwrap();
        assert_eq!(
            (
                info.address.as_str(),
                info.nk.as_str(),
                hex::encode(&sealed).as_str()
            ),
            (VECTOR_ADDRESS, VECTOR_NK, VECTOR_SEALED)
        );
    }

    const VECTOR_ADDRESS: &str = "u1ljgj2vz0uzz5ku88wq07pqwepyyaw6azem5rnl56xu0wfjkxpkd84e40y36wy6da7fvcd845jwl09pg9uwc5zlx0cead3xsz7vuqm5z2";
    const VECTOR_NK: &str = "f196a96b9a2ea0092a4f7561f747e9235e71e35b850c708adfe6882ce9e37619";
    const VECTOR_SEALED: &str = "dbc16c08bfa2c2865aeca2dbfb09aeeffc9d39152d7b16b3904799d76a72c109";

    #[test]
    fn the_sealing_account_opens_its_link() {
        let network = Network::MainNetwork;
        let key = new_key();
        let nk = hex::decode(info(&network, &key).unwrap().nk).unwrap();
        let sealed = seal(&network, &SEED, 0, &key).unwrap();
        assert_ne!(sealed, key);
        assert_eq!(open(&network, &SEED, 0, &sealed, &nk).unwrap(), key);
    }

    #[test]
    fn another_account_cant_open_it() {
        let network = Network::MainNetwork;
        let key = new_key();
        let nk = hex::decode(info(&network, &key).unwrap().nk).unwrap();
        let sealed = seal(&network, &SEED, 0, &key).unwrap();
        assert!(open(&network, &SEED, 1, &sealed, &nk).is_err());
        assert!(open(&network, &[8u8; 32], 0, &sealed, &nk).is_err());
    }

    #[test]
    fn a_funding_memo_gives_back_what_opens_its_link() {
        let mut memo = [0u8; 512];
        memo[..9].copy_from_slice(MEMO_HEADER);
        memo[9..41].fill(0xab);
        memo[41..73].fill(0xcd);
        let link = memo_link(&memo).unwrap();
        assert_eq!((link.nk, link.sealed), ("ab".repeat(32), "cd".repeat(32)));
        assert!(memo_link(&[0u8; 512]).is_none());
    }

    #[test]
    fn rejects_bytes_that_arent_a_key() {
        assert!(spending_key(&[0u8; 31]).is_err());
        assert!(info(&Network::MainNetwork, &[0u8; 33]).is_err());
    }
}
