//! Transparent: address derivation from the viewing key, and reading the
//! transparent side of raw transactions. No network and no state; the app
//! finds which addresses are used and fetches their transactions.

use serde::Serialize;
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

/// An output a transaction spends: the transaction that created it, and which
/// of its outputs it was.
#[derive(Serialize)]
struct Input {
    txid: String,
    index: u32,
}

#[derive(Serialize)]
struct Output {
    index: u32,
    value: u64,
    /// `None` for a script that pays no single address.
    address: Option<String>,
}

/// A transaction's transparent side, and the shielded nullifiers it reveals.
/// Txids are in the byte order explorers show them in.
#[derive(Serialize)]
struct TransparentTx {
    txid: String,
    inputs: Vec<Input>,
    outputs: Vec<Output>,
    /// Every Sapling, Orchard and Ironwood nullifier it spends (hex).
    nullifiers: Vec<String>,
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
    Ok(TransparentTx {
        txid: tx.txid().to_string(),
        inputs,
        outputs,
        nullifiers: sapling.chain(orchard).map(hex::encode).collect(),
    })
}

/// The transparent side of a raw transaction mined at `height`, which fixes
/// the consensus rules it is read under, and the nullifiers it spends:
/// `{ txid, inputs: [{ txid, index }], outputs: [{ index, value, address }],
/// nullifiers }`.
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
