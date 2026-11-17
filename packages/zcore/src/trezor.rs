//! A Trezor signs a transparent-only PCZT by streaming it to the firmware as
//! a Bitcoin-style SignTx, and returns only transparent spend
//! authorizations, which go back into the PCZT here by the Ledger's
//! [`crate::ledger::apply`] — same fields, empty shielded lists. The
//! firmware holds no shielded keys and its SignTx can't even name shielded
//! components, so the mapper refuses a PCZT that touches those pools before
//! the device is engaged. The transaction is always V5 (the planner pins it
//! for Trezor accounts), so the device needs nothing streamed back: connect
//! fetches referenced transactions only below V5.

use std::convert::Infallible;

use pczt::roles::verifier::Verifier;
use pczt::Pczt;
use ripemd::Ripemd160;
use serde::Serialize;
use sha2::{Digest, Sha256};
use wasm_bindgen::prelude::*;
use zcash_protocol::consensus::Network;

use crate::ledger::Global;
use crate::parse_network;

/// Every V5 transaction's version group id: NU5's, reused through NU6.3.
const V5_VERSION_GROUP_ID: u32 = 0x26A7_270A;

/// The connect `signTransaction` params for one transparent-only PCZT.
/// Transaction-level fields are camelCase, as connect's API names them;
/// input and output fields keep the protocol's snake_case. Amounts are
/// `u64`s, which serde-wasm-bindgen hands over as `BigInt`s.
#[derive(Serialize)]
pub(crate) struct SignTx {
    /// `"zec"` on mainnet, `"taz"` on testnet.
    coin: &'static str,
    version: u32,
    #[serde(rename = "versionGroupId")]
    version_group_id: u32,
    #[serde(rename = "branchId")]
    consensus_branch_id: u32,
    /// The transaction's nLockTime; omitted when the PCZT names none.
    #[serde(skip_serializing_if = "Option::is_none")]
    locktime: Option<u32>,
    /// The transaction's nExpiryHeight, a block height.
    expiry: u32,
    inputs: Vec<SignTxInput>,
    outputs: Vec<SignTxOutput>,
}

#[derive(Serialize)]
struct SignTxInput {
    /// The coin's full BIP-44 path, hardened indexes as the device takes
    /// them (`0x80000000 | index`).
    address_n: Vec<u32>,
    /// The prevout's txid in its display form, as block explorers show it.
    prev_hash: String,
    prev_index: u32,
    amount: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    sequence: Option<u32>,
    /// `"SPENDADDRESS"`: a P2PKH coin, signed with SIGHASH_ALL.
    script_type: &'static str,
}

#[derive(Serialize)]
struct SignTxOutput {
    /// A payment to an address outside the wallet.
    #[serde(skip_serializing_if = "Option::is_none")]
    address: Option<String>,
    /// A change payment to one of the account's own addresses, which the
    /// device re-derives to check it's ours.
    #[serde(skip_serializing_if = "Option::is_none")]
    address_n: Option<Vec<u32>>,
    amount: u64,
    /// `"PAYTOADDRESS"`.
    script_type: &'static str,
}

fn hash160(data: &[u8]) -> [u8; 20] {
    Ripemd160::digest(Sha256::digest(data)).into()
}

/// A derivation's path, as the device takes it.
fn address_n(d: &transparent::pczt::Bip32Derivation) -> Vec<u32> {
    d.derivation_path().iter().map(|c| c.0).collect()
}

/// A P2PKH script's key hash, when it is one.
fn p2pkh_hash(script: &[u8]) -> Option<[u8; 20]> {
    let [0x76, 0xa9, 0x14, hash @ .., 0x88, 0xac] = script else {
        return None;
    };
    hash.try_into().ok()
}

/// The PCZT `encoded` as connect's `signTransaction` takes it. Throws on
/// anything the firmware can't sign, before the device hears about it.
pub(crate) fn transaction(network: &Network, encoded: &[u8]) -> Result<SignTx, String> {
    let pczt = Pczt::parse(encoded).map_err(|e| format!("{e:?}"))?;
    // Refuse the shielded pools ahead of the version: a wrong version is a
    // planner bug, but shielded ones would leak to the device if not caught.
    if !pczt.sapling().spends().is_empty()
        || !pczt.sapling().outputs().is_empty()
        || !pczt.orchard().actions().is_empty()
        || !pczt.ironwood().actions().is_empty()
    {
        return Err("a Trezor can't sign a transaction that pays to or from shielded pools".into());
    }
    // After the 4-byte magic and 4-byte version, the encoding opens with the global.
    let (global, _) = postcard::take_from_bytes::<Global>(encoded.get(8..).unwrap_or_default())
        .map_err(|e| e.to_string())?;
    if global.tx_version != 5 {
        return Err(format!(
            "a Trezor signs V5 transactions, not V{}",
            global.tx_version
        ));
    }
    if global.version_group_id != V5_VERSION_GROUP_ID {
        return Err("the transaction's version group doesn't match V5".into());
    }

    // The Verifier's transparent side carries what the raw one keeps
    // private: each input's sighash type and BIP-32 derivation.
    let mut sighashes = Vec::new();
    let mut input_derivations = Vec::new();
    let mut output_derivations = Vec::new();
    Verifier::new(pczt.clone())
        .with_transparent::<Infallible, _>(|bundle| {
            sighashes = bundle
                .inputs()
                .iter()
                .map(|i| i.sighash_type().encode())
                .collect();
            input_derivations = bundle
                .inputs()
                .iter()
                .map(|i| {
                    i.bip32_derivation()
                        .iter()
                        .next()
                        .map(|(k, d)| (*k, address_n(d)))
                })
                .collect();
            output_derivations = bundle
                .outputs()
                .iter()
                .map(|o| {
                    o.bip32_derivation()
                        .iter()
                        .next()
                        .map(|(k, d)| (*k, address_n(d)))
                })
                .collect();
            Ok(())
        })
        .map_err(|e| format!("{e:?}"))?;

    // A Trezor signs P2PKH coins with SIGHASH_ALL, at the address the coin
    // names. One key names each coin, ours.
    let inputs = pczt
        .transparent()
        .inputs()
        .iter()
        .zip(sighashes)
        .zip(input_derivations)
        .map(|((raw, sighash), derivation)| {
            if sighash != 0x01 {
                return Err("a Trezor signs transparent inputs with SIGHASH_ALL only".into());
            }
            let (pubkey, address_n) = derivation.ok_or("a transparent input names no key")?;
            // The coin must pay the key it names, or the device would sign
            // for whatever else the script says.
            let hash =
                p2pkh_hash(raw.script_pubkey()).ok_or("a transparent input doesn't pay P2PKH")?;
            if hash != hash160(&pubkey) {
                return Err("a transparent input's key doesn't match its script".into());
            }
            // The txid's display form is its bytes in reverse.
            let mut prev_txid = *raw.prevout_txid();
            prev_txid.reverse();
            Ok(SignTxInput {
                address_n,
                prev_hash: hex::encode(prev_txid),
                prev_index: *raw.prevout_index(),
                amount: *raw.value(),
                sequence: *raw.sequence(),
                script_type: "SPENDADDRESS",
            })
        })
        .collect::<Result<_, String>>()?;

    // Change is ours, named by its key; anything else pays an outside
    // address, read off the script the sighash commits to.
    let outputs = pczt
        .transparent()
        .outputs()
        .iter()
        .zip(output_derivations)
        .map(|(raw, derivation)| {
            let amount = *raw.value();
            let (address, address_n) = match derivation {
                Some((pubkey, address_n)) => {
                    let hash = p2pkh_hash(raw.script_pubkey())
                        .ok_or("a change output doesn't pay P2PKH")?;
                    if hash != hash160(&pubkey) {
                        return Err("a change output's key doesn't match its script".into());
                    }
                    (None, Some(address_n))
                }
                None => (
                    Some(
                        crate::transparent_tx::script_address(network, raw.script_pubkey())
                            .ok_or("a Trezor can only pay to standard transparent addresses")?,
                    ),
                    None,
                ),
            };
            Ok(SignTxOutput {
                address,
                address_n,
                amount,
                script_type: "PAYTOADDRESS",
            })
        })
        .collect::<Result<_, String>>()?;

    Ok(SignTx {
        coin: if matches!(network, Network::TestNetwork) {
            "taz"
        } else {
            "zec"
        },
        version: global.tx_version,
        version_group_id: global.version_group_id,
        consensus_branch_id: global.consensus_branch_id,
        locktime: global.fallback_lock_time,
        expiry: global.expiry_height,
        inputs,
        outputs,
    })
}

/// The PCZT `pczt` as `@trezor/connect-core`'s `signTransaction` takes it:
/// amounts as `BigInt`s. Throws on anything the firmware can't sign, before
/// the device hears about it.
#[wasm_bindgen]
pub fn pczt_trezor_transaction(network: &str, pczt: &[u8]) -> Result<JsValue, JsError> {
    let network = parse_network(network).map_err(|e| JsError::new(&e))?;
    let tx = transaction(&network, pczt).map_err(|e| JsError::new(&e))?;
    let serializer = serde_wasm_bindgen::Serializer::new()
        .serialize_large_number_types_as_bigints(true)
        .serialize_missing_as_null(true);
    tx.serialize(&serializer)
        .map_err(|e| JsError::new(&e.to_string()))
}

#[cfg(test)]
mod tests {
    use std::convert::Infallible;

    use pczt::roles::verifier::Verifier;
    use zcash_address::unified::{Container, Encoding, Fvk, Revision, Ufvk, Uitem};
    use zcash_keys::keys::UnifiedFullViewingKey;

    use super::*;
    use crate::build::pczt;
    use crate::ledger::HARDENED;
    use crate::send::tests::{wallet_ufvk, SEED, TIP};
    use crate::wallet::{Wallet, WalletData};

    const MAIN: Network = Network::MainNetwork;

    /// The seed's account 0, as a Trezor exports it: its transparent key
    /// alone, in a Revision 2 viewing key.
    fn trezor_ufvk() -> String {
        let (net, _, items) = Ufvk::decode(&wallet_ufvk()).unwrap();
        let p2pkh = items
            .items()
            .into_iter()
            .find_map(|item| match item {
                Fvk::P2pkh(key) => Some(key),
                _ => None,
            })
            .unwrap();
        Ufvk::try_from_items(Revision::R2, vec![Uitem::Data(Fvk::P2pkh(p2pkh))])
            .unwrap()
            .encode(&net)
    }

    fn fingerprint() -> [u8; 32] {
        zip32::fingerprint::SeedFingerprint::from_seed(&SEED)
            .unwrap()
            .to_bytes()
    }

    /// 50,000 from a 100,000 coin at the account's first address, to an
    /// outside transparent address, change staying transparent.
    fn transparent_send() -> Pczt {
        transparent_send_to(UnifiedFullViewingKey::decode(&MAIN, &trezor_ufvk()).unwrap())
    }

    /// The same send, planned and built for the viewing key given: a
    /// transparent-only account's pins V5, the seed account's stays V6.
    fn transparent_send_to(ufvk: UnifiedFullViewingKey) -> Pczt {
        let encoded = ufvk.encode(&MAIN).unwrap();
        let ours = crate::transparent_tx::derive(&MAIN, &encoded, "external", 0, 1)
            .unwrap()
            .remove(0);
        let utxo = crate::wallet::UtxoData::for_tests(&ours, 100_000, 1, TIP - 50);
        let wallet = Wallet::new(
            MAIN,
            &WalletData {
                tip: TIP,
                notes: vec![],
                utxos: vec![utxo],
            },
        )
        .unwrap();
        let to = crate::transparent_tx::derive(&MAIN, &encoded, "external", 5, 1)
            .unwrap()
            .remove(0);
        let proposal = crate::send::tests::plan_from(&wallet, &to, 50_000, "transparent");
        pczt(
            &wallet,
            &ufvk,
            fingerprint(),
            0,
            &proposal,
            &Default::default(),
            // Transparent change goes to the internal address at index 0.
            Some(0),
        )
        .unwrap()
    }

    /// What a device holding the seed returns for `unsigned`: the
    /// signatures the keychain's own signer makes for the same transparent
    /// keys, as connect's `signTransaction` hands them over.
    fn device_signatures(unsigned: &Pczt) -> Vec<String> {
        let signed = crate::roles::sign(&MAIN, unsigned.clone(), &SEED, 0).unwrap();
        let mut transparent = Vec::new();
        Verifier::new(signed)
            .with_transparent::<Infallible, _>(|bundle| {
                transparent = bundle
                    .inputs()
                    .iter()
                    .map(|i| hex::encode(i.partial_signatures().values().next().unwrap()))
                    .collect();
                Ok(())
            })
            .unwrap();
        transparent
    }

    #[test]
    fn reads_a_transparent_only_send_as_connect_takes_it() {
        let unsigned = transparent_send();

        // The planner pinned V5 for the transparent-only account.
        let tx = transaction(&MAIN, &unsigned.clone().serialize().unwrap()).unwrap();
        assert_eq!((tx.version, tx.version_group_id), (5, V5_VERSION_GROUP_ID));
        assert_eq!(tx.coin, "zec");

        assert_eq!(tx.inputs.len(), 1);
        let input = &tx.inputs[0];
        assert_eq!(
            input.address_n,
            // The account hardened, the coin, the change chain, the index.
            vec![44 | HARDENED, 133 | HARDENED, HARDENED, 0, 0]
        );
        assert_eq!(input.amount, 100_000);
        assert_eq!(input.script_type, "SPENDADDRESS");
        assert_eq!(input.prev_hash.len(), 64);

        let payment = tx
            .outputs
            .iter()
            .find(|o| o.address.is_some())
            .expect("the payment");
        assert_eq!(payment.amount, 50_000);
        assert!(payment.address_n.is_none());
        assert_eq!(payment.script_type, "PAYTOADDRESS");

        let change = tx
            .outputs
            .iter()
            .find(|o| o.address_n.is_some())
            .expect("the change");
        assert!(change.address.is_none());
        assert_eq!(
            change.address_n,
            Some(vec![44 | HARDENED, 133 | HARDENED, HARDENED, 1, 0])
        );

        // Named as connect's API names them.
        let json = serde_json::to_value(&tx).unwrap();
        assert_eq!(json["versionGroupId"], V5_VERSION_GROUP_ID);
        assert_eq!(json["branchId"], tx.consensus_branch_id);
        assert!(json["locktime"].is_number());
        assert!(json["expiry"].is_number());
        assert!(json["inputs"][0]["prev_index"].is_number());
        assert!(json["outputs"][0]["address"].is_string());
        assert!(json["outputs"][1]["addressN"].is_null());
    }

    #[test]
    fn trezor_signatures_make_a_transaction() {
        let unsigned = transparent_send();
        let signed = crate::ledger::apply(
            unsigned.clone(),
            crate::ledger::Signatures {
                orchard: vec![],
                ironwood: vec![],
                transparent: device_signatures(&unsigned),
            },
        )
        .unwrap();
        // The extractor checks every signature, transparent ones included.
        crate::roles::prove(signed, None).unwrap();
    }

    #[test]
    fn refuses_what_the_firmware_cant_sign() {
        // Any shielded component: out, before the version is even read.
        let shielded = crate::ledger::tests::ironwood_send();
        assert_eq!(
            transaction(&MAIN, &shielded.serialize().unwrap()).err(),
            Some("a Trezor can't sign a transaction that pays to or from shielded pools".into())
        );

        // A V6 transparent-only send, a seed account's: the version, then.
        let v6 = transparent_send_to(UnifiedFullViewingKey::decode(&MAIN, &wallet_ufvk()).unwrap());
        assert_eq!(
            transaction(&MAIN, &v6.serialize().unwrap()).err(),
            Some("a Trezor signs V5 transactions, not V6".into())
        );
    }
}
