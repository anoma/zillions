//! Transparent: address derivation from the viewing key, and reading the
//! transparent side of raw transactions. No network and no state; the app
//! finds which addresses are used and fetches their transactions.

use ripemd::Ripemd160;
use serde::Serialize;
use sha2::{Digest, Sha256};
use transparent::address::TransparentAddress;
use transparent::keys::{IncomingViewingKey, NonHardenedChildIndex};
use wasm_bindgen::prelude::*;
use zcash_keys::address::Address;
use zcash_keys::keys::UnifiedFullViewingKey;
use zcash_primitives::transaction::Transaction;
use zcash_protocol::consensus::{BlockHeight, BranchId, Network};

use crate::parse_network;

pub(crate) fn derive(
    network: &Network,
    ufvk: &str,
    scope: &str,
    from: u32,
    count: u32,
) -> Result<Vec<String>, String> {
    let ufvk = UnifiedFullViewingKey::decode(network, ufvk)?;
    let Some(account) = ufvk.transparent() else {
        return Ok(Vec::new());
    };
    let ivk: Box<dyn Fn(NonHardenedChildIndex) -> Result<_, _>> = match scope {
        "external" => {
            let ivk = account.derive_external_ivk().map_err(|e| e.to_string())?;
            Box::new(move |i| ivk.derive_address(i))
        }
        "internal" => {
            let ivk = account.derive_internal_ivk().map_err(|e| e.to_string())?;
            Box::new(move |i| ivk.derive_address(i))
        }
        _ => return Err(format!("unknown scope {scope}")),
    };
    (from..from.saturating_add(count))
        .map(|index| {
            let index =
                NonHardenedChildIndex::from_index(index).ok_or("address index out of range")?;
            let address = ivk(index).map_err(|e| e.to_string())?;
            Ok(Address::Transparent(address).encode(network))
        })
        .collect()
}

/// Transparent addresses `from..from + count` on one BIP-44 chain of the
/// viewing key's account: `"external"` (receiving) or `"internal"` (change).
/// Empty when the viewing key has no transparent part.
#[wasm_bindgen]
pub fn derive_transparent(
    network: &str,
    ufvk: &str,
    scope: &str,
    from: u32,
    count: u32,
) -> Result<Vec<String>, JsError> {
    let network = parse_network(network).map_err(|e| JsError::new(&e))?;
    derive(&network, ufvk, scope, from, count).map_err(|e| JsError::new(&e))
}

#[derive(Serialize)]
struct GapLimits {
    external: u32,
    internal: u32,
}

/// Unused addresses in a row that end each chain when scanning:
/// `{ external, internal }`, upstream's defaults, so other wallets restoring
/// the phrase find every address this one hands out.
#[wasm_bindgen]
pub fn gap_limits() -> Result<JsValue, JsError> {
    let limits = zcash_keys::keys::transparent::gap_limits::GapLimits::default();
    let limits = GapLimits {
        external: limits.external(),
        internal: limits.internal(),
    };
    serde_wasm_bindgen::to_value(&limits).map_err(|e| JsError::new(&e.to_string()))
}

/// The address a transparent output's script pays: P2PKH or P2SH, as
/// `zcash_transparent` reads it. `None` for any other script.
pub(crate) fn script_address(network: &Network, script: &[u8]) -> Option<String> {
    let script =
        zcash_script::script::FromChain::parse(&zcash_script::script::Code(script.to_vec()))
            .ok()?;
    let address = transparent::address::TransparentAddress::from_script_from_chain(&script)?;
    Some(Address::Transparent(address).encode(network))
}

/// The address a transparent output's `script` pays; `undefined` unless it's
/// P2PKH or P2SH.
#[wasm_bindgen(js_name = script_address)]
pub fn script_address_js(network: &str, script: &[u8]) -> Result<Option<String>, JsError> {
    let network = parse_network(network).map_err(|e| JsError::new(&e))?;
    Ok(script_address(&network, script))
}

/// An output a transaction spends: the transaction that created it, which of
/// its outputs it was, and the address it paid.
#[derive(Serialize)]
struct Input {
    txid: String,
    index: u32,
    /// `None` unless the input spends a P2PKH output.
    address: Option<String>,
}

/// The P2PKH address an input spends from. Its scriptSig is a signature and
/// then the public key, whose hash the address is: no lookup of the output
/// it spends.
fn spender(network: &Network, script_sig: &zcash_script::script::Code) -> Option<String> {
    let pushes = zcash_script::script::Sig::parse(script_sig).ok()?;
    let [_, key] = &pushes.0[..] else {
        return None;
    };
    let key = key.value();
    if !matches!((key.len(), key[0]), (33, 2 | 3) | (65, 4)) {
        return None;
    }
    let hash = Ripemd160::digest(Sha256::digest(&key));
    Some(Address::Transparent(TransparentAddress::PublicKeyHash(hash.into())).encode(network))
}

#[derive(Serialize)]
struct Output {
    index: u32,
    value: u64,
    /// `None` for a script that pays no single address.
    address: Option<String>,
}

/// A transaction's transparent side, and what it reveals of its shielded one.
/// Txids are in the byte order explorers show them in.
#[derive(Serialize)]
struct TransparentTx {
    txid: String,
    inputs: Vec<Input>,
    outputs: Vec<Output>,
    /// Every Sapling, Orchard and Ironwood nullifier it spends (hex).
    nullifiers: Vec<String>,
    /// What leaves the shielded pools, net of what enters them: the fee is
    /// this plus the transparent inputs' value less the outputs'.
    value_balance: i64,
    /// The last height it could be mined at; 0 for none.
    expiry_height: u32,
}

fn parse(network: &Network, height: u32, data: &[u8]) -> Result<TransparentTx, String> {
    let branch = BranchId::for_height(network, BlockHeight::from(height));
    let tx = Transaction::read(data, branch).map_err(|e| e.to_string())?;
    let (inputs, outputs) = match tx.transparent_bundle() {
        None => (Vec::new(), Vec::new()),
        Some(bundle) => (
            bundle
                .vin
                .iter()
                .map(|input| Input {
                    txid: input.prevout().txid().to_string(),
                    index: input.prevout().n(),
                    address: spender(network, &input.script_sig().0),
                })
                .collect(),
            bundle
                .vout
                .iter()
                .enumerate()
                .map(|(i, output)| Output {
                    index: i as u32,
                    value: output.value().into_u64(),
                    address: output
                        .recipient_address()
                        .map(|address| Address::Transparent(address).encode(network)),
                })
                .collect(),
        ),
    };
    let sapling = tx
        .sapling_bundle()
        .into_iter()
        .flat_map(|b| b.shielded_spends())
        .map(|s| s.nullifier().0);
    let orchard_family = [tx.orchard_bundle(), tx.ironwood_bundle()];
    let orchard = orchard_family
        .into_iter()
        .flatten()
        .flat_map(|b| b.actions())
        .map(|a| a.nullifier().to_bytes());
    let value_balance = [
        tx.sapling_bundle().map(|b| *b.value_balance()),
        tx.orchard_bundle().map(|b| *b.value_balance()),
        tx.ironwood_bundle().map(|b| *b.value_balance()),
        tx.sprout_bundle().and_then(|b| b.value_balance()),
    ]
    .into_iter()
    .flatten()
    .map(i64::from)
    .sum();
    Ok(TransparentTx {
        txid: tx.txid().to_string(),
        inputs,
        outputs,
        nullifiers: sapling.chain(orchard).map(hex::encode).collect(),
        value_balance,
        expiry_height: tx.expiry_height().into(),
    })
}

/// The transparent side of a raw transaction mined at `height`, which fixes
/// the consensus rules it is read under, and what it shows of its shielded
/// one: `{ txid, inputs: [{ txid, index, address }], outputs: [{ index, value,
/// address }], nullifiers, value_balance, expiry_height }`.
#[wasm_bindgen]
pub fn parse_transaction(network: &str, height: u32, data: &[u8]) -> Result<JsValue, JsError> {
    let network = parse_network(network).map_err(|e| JsError::new(&e))?;
    let tx = parse(&network, height, data).map_err(|e| JsError::new(&e))?;
    serde_wasm_bindgen::to_value(&tx).map_err(|e| JsError::new(&e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use zcash_keys::keys::UnifiedSpendingKey;

    // Mainnet tx a633a20c…1f5b at 3,503,058: its compact block names this
    // Ironwood action's nullifier.
    #[test]
    fn reads_the_nullifiers_a_transaction_spends() {
        let raw = hex::decode(include_str!("testdata/ironwood_tx.hex").trim()).expect("hex");
        let tx = parse(&Network::MainNetwork, 3_503_058, &raw).expect("parses");
        assert_eq!(
            tx.txid,
            "a633a20c18cbd7e44ef86749fa71b89ad140154ff412b57d3a027c214e151f5b"
        );
        assert_eq!(
            tx.nullifiers,
            ["ec9483d9491c7294eca79c4b302d892946d23e38a40697513c93008438daa825"]
        );
    }

    // Mainnet tx 61f4832b…37f9 at 3,519,095 paid 16,000 zats to an Ironwood
    // receiver from three P2PKH coins of 20,000, 11,000 and 10,000: the
    // addresses match the outputs they spend.
    #[test]
    fn reads_the_sender_and_fee_of_a_transparent_funded_payment() {
        let raw =
            hex::decode(include_str!("testdata/transparent_funded_tx.hex").trim()).expect("hex");
        let tx = parse(&Network::MainNetwork, 3_519_095, &raw).expect("parses");
        assert_eq!(
            tx.txid,
            "61f4832bce3cfd70a3b12d9553cbaf747a255f011669b638d928f80acd5e37f9"
        );
        let senders: Vec<_> = tx.inputs.iter().map(|i| i.address.as_deref()).collect();
        assert_eq!(
            senders,
            [
                Some("t1XurBbiuyBBPj7YtbzGXdGpM6AVrkVicCN"),
                Some("t1Y5bTrYt2aKEfaUvdEquHgsUSfgm4JU8fA"),
                Some("t1SLrPWPijMUed9dDBf7KRZVF9aXKYwgqYH"),
            ]
        );
        assert!(tx.outputs.is_empty());
        assert_eq!(tx.value_balance, -16_000);
        assert_eq!(tx.expiry_height, 3_519_134);
    }

    #[test]
    fn reads_the_address_a_script_pays() {
        // The payment of mainnet tx 9eec076b…205a.
        let p2pkh = hex::decode("76a9142a64271e6d2bac79ca4e9183130f32a73e2bb16688ac").unwrap();
        assert_eq!(
            script_address(&Network::MainNetwork, &p2pkh).as_deref(),
            Some("t1MjkN8ao1cs7LdT1gNAybAiZHBCfgXZzth")
        );
        // OP_RETURN pays no one.
        assert_eq!(
            script_address(&Network::MainNetwork, &[0x6a, 0x01, 0x00]),
            None
        );
    }

    #[test]
    fn derives_both_chains_from_the_viewing_key() {
        let network = Network::MainNetwork;
        let usk = UnifiedSpendingKey::from_seed(&network, &[7u8; 32], zip32::AccountId::ZERO)
            .expect("usk");
        let ufvk = usk.to_unified_full_viewing_key().encode(&network);

        let external = derive(&network, &ufvk, "external", 0, 3).expect("external");
        let internal = derive(&network, &ufvk, "internal", 0, 3).expect("internal");
        assert_eq!(external.len(), 3);
        assert!(external
            .iter()
            .chain(&internal)
            .all(|a| a.starts_with("t1")));
        assert_ne!(external[0], external[1]);
        assert_ne!(external[0], internal[0]);

        // A window is the same addresses wherever it starts.
        assert_eq!(
            derive(&network, &ufvk, "external", 1, 1).expect("one"),
            external[1..2]
        );

        // The spending key's own derivation agrees with the viewing key's.
        let from_usk = usk
            .transparent()
            .to_account_pubkey()
            .derive_external_ivk()
            .unwrap();
        let expected = Address::Transparent(
            from_usk
                .derive_address(NonHardenedChildIndex::ZERO)
                .unwrap(),
        );
        assert_eq!(external[0], expected.encode(&network));
    }
}
