//! A Ledger signs a PCZT from the fields `@ledgerhq/device-signer-kit-zcash`
//! streams to it, and returns only spend authorizations, which go back into
//! the PCZT here. Binding signatures stay with the app's extractor.

use std::convert::Infallible;

use ff::PrimeField;
use pczt::roles::signer::{Signer, SpendAuthSignature};
use pczt::roles::updater::Updater;
use pczt::roles::verifier::Verifier;
use pczt::Pczt;
use serde::{Deserialize, Serialize};
use serde_bytes::ByteBuf;
use wasm_bindgen::prelude::*;
use zcash_protocol::consensus::{Network, NetworkConstants, Parameters};

use crate::parse_network;
use crate::roles::to_pczt_error;

const HARDENED: u32 = 0x8000_0000;

/// Ironwood holds V3 note plaintexts, and the device wants that said.
const IRONWOOD_NOTE_VERSION: u8 = 3;

/// The kit's `PcztTransaction`.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Transaction {
    global: Global,
    transparent_inputs: Vec<TransparentInput>,
    transparent_outputs: Vec<TransparentOutput>,
    orchard_bundle: Bundle,
    /// V6 only, where it must be there even when empty.
    ironwood_bundle: Option<Bundle>,
}

/// `pczt::common::Global` up to its proprietary map, in its encoding's order:
/// the crate keeps three of these fields to itself.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Global {
    tx_version: u32,
    version_group_id: u32,
    consensus_branch_id: u32,
    fallback_lock_time: Option<u32>,
    expiry_height: u32,
    coin_type: u32,
    tx_modifiable: u8,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Derivation {
    signing_path: String,
    pubkey: ByteBuf,
    seed_fingerprint: ByteBuf,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TransparentInput {
    prevout_txid: ByteBuf,
    prevout_index: u32,
    sequence: Option<u32>,
    value: u64,
    script_pub_key: ByteBuf,
    sighash_type: u8,
    derivation: Derivation,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TransparentOutput {
    value: u64,
    script_pub_key: ByteBuf,
    derivation: Option<Derivation>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Action {
    cv_net: ByteBuf,
    nullifier: ByteBuf,
    rk: ByteBuf,
    spend_recipient: ByteBuf,
    spend_value: u64,
    spend_rho: ByteBuf,
    spend_rseed: ByteBuf,
    alpha: ByteBuf,
    signing_path: String,
    seed_fingerprint: ByteBuf,
    cmx: ByteBuf,
    ephemeral_key: ByteBuf,
    enc_ciphertext: ByteBuf,
    out_ciphertext: ByteBuf,
    recipient: ByteBuf,
    value: u64,
    rseed: ByteBuf,
    rcv: ByteBuf,
    #[serde(skip_serializing_if = "Option::is_none")]
    note_plaintext_version: Option<u8>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Bundle {
    actions: Vec<Action>,
    flags: u8,
    value_balance: i64,
    anchor: ByteBuf,
}

/// What the device returned, each signature hex.
#[derive(Deserialize)]
pub(crate) struct Signatures {
    /// One per Orchard spend the PCZT leaves unsigned, in action order.
    orchard: Vec<String>,
    /// Likewise for Ironwood.
    ironwood: Vec<String>,
    /// One per transparent input: DER, then the sighash type byte.
    transparent: Vec<String>,
}

fn bytes(b: impl AsRef<[u8]>) -> ByteBuf {
    ByteBuf::from(b.as_ref().to_vec())
}

fn path(indices: impl IntoIterator<Item = u32>) -> String {
    indices
        .into_iter()
        .map(|i| match i & HARDENED {
            0 => i.to_string(),
            _ => format!("{}'", i & !HARDENED),
        })
        .collect::<Vec<_>>()
        .join("/")
}

fn derivation(pubkey: &[u8; 33], d: &transparent::pczt::Bip32Derivation) -> Derivation {
    Derivation {
        signing_path: path(d.derivation_path().iter().map(|c| c.0)),
        pubkey: bytes(pubkey),
        seed_fingerprint: bytes(d.seed_fingerprint()),
    }
}

/// `bundle`'s actions as the device reads them. A dummy spend names no key,
/// but the device still derives the account's to check its output, so it
/// gets `account_path`.
fn actions(
    bundle: &orchard::pczt::Bundle,
    account_path: &str,
    note_version: Option<u8>,
) -> Result<Vec<Action>, String> {
    bundle
        .actions()
        .iter()
        .map(|action| {
            let spend = action.spend();
            let output = action.output();
            let missing = |field: &str| format!("a Ledger needs the {field} the PCZT redacted");
            let (signing_path, seed_fingerprint) = match spend.zip32_derivation() {
                Some(d) => (
                    path(d.derivation_path().iter().map(|c| c.index())),
                    *d.seed_fingerprint(),
                ),
                None => (account_path.to_string(), [0; 32]),
            };
            let note = output.encrypted_note();
            Ok(Action {
                cv_net: bytes(action.cv_net().to_bytes()),
                nullifier: bytes(spend.nullifier().to_bytes()),
                rk: bytes(<[u8; 32]>::from(spend.rk())),
                spend_recipient: bytes(
                    spend
                        .recipient()
                        .ok_or_else(|| missing("spent note"))?
                        .to_raw_address_bytes(),
                ),
                spend_value: spend.value().ok_or_else(|| missing("spent value"))?.inner(),
                spend_rho: bytes(spend.rho().ok_or_else(|| missing("spent rho"))?.to_bytes()),
                spend_rseed: bytes(
                    spend
                        .rseed()
                        .as_ref()
                        .ok_or_else(|| missing("spent rseed"))?
                        .as_bytes(),
                ),
                alpha: bytes(spend.alpha().ok_or_else(|| missing("alpha"))?.to_repr()),
                signing_path,
                seed_fingerprint: bytes(seed_fingerprint),
                cmx: bytes(output.cmx().to_bytes()),
                ephemeral_key: bytes(note.epk_bytes),
                enc_ciphertext: bytes(note.enc_ciphertext),
                out_ciphertext: bytes(note.out_ciphertext),
                recipient: bytes(
                    output
                        .recipient()
                        .ok_or_else(|| missing("output note"))?
                        .to_raw_address_bytes(),
                ),
                value: output
                    .value()
                    .ok_or_else(|| missing("output value"))?
                    .inner(),
                rseed: bytes(
                    output
                        .rseed()
                        .as_ref()
                        .ok_or_else(|| missing("output rseed"))?
                        .as_bytes(),
                ),
                rcv: bytes(
                    action
                        .rcv()
                        .as_ref()
                        .ok_or_else(|| missing("rcv"))?
                        .to_bytes(),
                ),
                note_plaintext_version: note_version,
            })
        })
        .collect()
}

fn bundle(raw: &pczt::orchard::Bundle, actions: Vec<Action>) -> Result<Bundle, String> {
    let (magnitude, negative) = *raw.value_sum();
    let magnitude = i64::try_from(magnitude).map_err(|_| "value balance out of range")?;
    Ok(Bundle {
        actions,
        flags: *raw.flags(),
        value_balance: if negative { -magnitude } else { magnitude },
        anchor: bytes(raw.anchor().unwrap_or_default()),
    })
}

/// The PCZT `encoded` as the device reads it, for the account at ZIP 32
/// index `hd_index`.
pub(crate) fn transaction(
    network: &Network,
    encoded: &[u8],
    hd_index: u32,
) -> Result<Transaction, String> {
    let pczt = Pczt::parse(encoded).map_err(|e| format!("{e:?}"))?;
    // A Ledger has no Sapling keys, so it can't authorize or review Sapling.
    if !pczt.sapling().spends().is_empty() || !pczt.sapling().outputs().is_empty() {
        return Err("a Ledger can't sign a transaction that pays to or from Sapling".into());
    }
    // After the 4-byte magic and 4-byte version, the encoding opens with the global.
    let (global, _) = postcard::take_from_bytes::<Global>(encoded.get(8..).unwrap_or_default())
        .map_err(|e| e.to_string())?;
    let v6 = global.tx_version >= 6;
    let account_path = path([
        32 | HARDENED,
        network.network_type().coin_type() | HARDENED,
        hd_index | HARDENED,
    ]);

    // The parsed bundle has what the raw one keeps private, and vice versa.
    let first = |map: &std::collections::BTreeMap<[u8; 33], transparent::pczt::Bip32Derivation>| {
        map.iter().next().map(|(pubkey, d)| derivation(pubkey, d))
    };
    let mut signing = Vec::new();
    let mut change = Vec::new();
    let mut orchard_actions = Vec::new();
    let mut ironwood_actions = Vec::new();
    Verifier::new(pczt.clone())
        .with_transparent::<Infallible, _>(|bundle| {
            signing = bundle
                .inputs()
                .iter()
                .map(|i| (i.sighash_type().encode(), first(i.bip32_derivation())))
                .collect();
            change = bundle
                .outputs()
                .iter()
                .map(|o| first(o.bip32_derivation()))
                .collect();
            Ok(())
        })
        .map_err(|e| format!("{e:?}"))?
        .with_orchard::<String, _>(|bundle| {
            orchard_actions = actions(bundle, &account_path, None)
                .map_err(pczt::roles::verifier::OrchardError::Custom)?;
            Ok(())
        })
        .map_err(|e| format!("{e:?}"))?
        .with_ironwood::<String, _>(|bundle| {
            ironwood_actions = actions(bundle, &account_path, Some(IRONWOOD_NOTE_VERSION))
                .map_err(pczt::roles::verifier::OrchardError::Custom)?;
            Ok(())
        })
        .map_err(|e| format!("{e:?}"))?;

    if !v6 && !ironwood_actions.is_empty() {
        return Err("a V5 transaction can't carry Ironwood actions".into());
    }
    let transparent_inputs = pczt
        .transparent()
        .inputs()
        .iter()
        .zip(signing)
        .map(|(raw, (sighash_type, derivation))| {
            Ok(TransparentInput {
                prevout_txid: bytes(raw.prevout_txid()),
                prevout_index: *raw.prevout_index(),
                sequence: *raw.sequence(),
                value: *raw.value(),
                script_pub_key: bytes(raw.script_pubkey()),
                sighash_type,
                derivation: derivation.ok_or("a transparent input names no key")?,
            })
        })
        .collect::<Result<_, String>>()?;
    let transparent_outputs = pczt
        .transparent()
        .outputs()
        .iter()
        .zip(change)
        .map(|(raw, derivation)| TransparentOutput {
            value: *raw.value(),
            script_pub_key: bytes(raw.script_pubkey()),
            derivation,
        })
        .collect();
    Ok(Transaction {
        global,
        transparent_inputs,
        transparent_outputs,
        orchard_bundle: bundle(pczt.orchard(), orchard_actions)?,
        ironwood_bundle: v6
            .then(|| bundle(pczt.ironwood(), ironwood_actions))
            .transpose()?,
    })
}

/// `pczt` with the device's signatures in. Each one is checked against the
/// PCZT's sighash, so a signature over anything else is refused here rather
/// than when the transaction is extracted.
pub(crate) fn apply(pczt: Pczt, signatures: Signatures) -> Result<Pczt, String> {
    // Dummy spends were signed when the PCZT's IO was finalized.
    let unsigned = |bundle: &pczt::orchard::Bundle| -> Vec<usize> {
        let actions = bundle.actions().iter().enumerate();
        actions
            .filter(|(_, a)| a.spend().spend_auth_sig().is_none())
            .map(|(i, _)| i)
            .collect()
    };
    let orchard = unsigned(pczt.orchard());
    let ironwood = unsigned(pczt.ironwood());
    let inputs = pczt.transparent().inputs().len();
    for (pool, want, got) in [
        ("Orchard", orchard.len(), signatures.orchard.len()),
        ("Ironwood", ironwood.len(), signatures.ironwood.len()),
        ("transparent", inputs, signatures.transparent.len()),
    ] {
        if want != got {
            return Err(format!(
                "the Ledger returned {got} {pool} signatures for {want} spends"
            ));
        }
    }

    // A P2PKH signature is checked against the key its hash commits to.
    let mut pubkeys = Vec::new();
    let pczt = Verifier::new(pczt)
        .with_transparent::<Infallible, _>(|bundle| {
            pubkeys = bundle
                .inputs()
                .iter()
                .map(|i| i.bip32_derivation().keys().next().copied())
                .collect();
            Ok(())
        })
        .map_err(to_pczt_error)?
        .finish();
    let pczt = Updater::new(pczt)
        .update_transparent_with(|mut updater| {
            for (i, pubkey) in pubkeys.iter().enumerate() {
                if let Some(pubkey) = pubkey {
                    updater.update_input_with(i, |mut input| {
                        input.set_hash160_preimage(pubkey.to_vec());
                        Ok(())
                    })?;
                }
            }
            Ok(())
        })
        .map_err(to_pczt_error)?
        .finish();

    let mut signer = Signer::new(pczt).map_err(to_pczt_error)?;
    for (pool, indices, sigs) in [
        (orchard::ValuePool::Orchard, orchard, &signatures.orchard),
        (orchard::ValuePool::Ironwood, ironwood, &signatures.ironwood),
    ] {
        for (i, sig) in indices.into_iter().zip(sigs) {
            let sig = crate::hex_n::<64>(sig)?;
            signer
                .apply_orchard_spend_auth_signature(&SpendAuthSignature::from_parts(pool, i, sig))
                .map_err(to_pczt_error)?;
        }
    }
    for (i, sig) in signatures.transparent.iter().enumerate() {
        let sig = hex::decode(sig).map_err(|e| e.to_string())?;
        let [der @ .., 0x01] = &sig[..] else {
            return Err("a transparent signature must be SIGHASH_ALL".into());
        };
        let mut sig = secp256k1::ecdsa::Signature::from_der(der).map_err(|e| e.to_string())?;
        // libsecp256k1 verifies only low-S signatures.
        sig.normalize_s();
        signer
            .append_transparent_signature(i, sig)
            .map_err(to_pczt_error)?;
    }
    Ok(signer.finish())
}

/// The PCZT `pczt` as `@ledgerhq/device-signer-kit-zcash`'s
/// `signPcztTransaction` takes it, for the account at ZIP 32 index `hd_index`:
/// byte fields as `Uint8Array`s, amounts as `bigint`s. Throws on a Sapling
/// spend or output, which a Ledger can't sign.
#[wasm_bindgen]
pub fn pczt_ledger_transaction(
    network: &str,
    pczt: &[u8],
    hd_index: u32,
) -> Result<JsValue, JsError> {
    let network = parse_network(network).map_err(|e| JsError::new(&e))?;
    let tx = transaction(&network, pczt, hd_index).map_err(|e| JsError::new(&e))?;
    let serializer = serde_wasm_bindgen::Serializer::new()
        .serialize_large_number_types_as_bigints(true)
        .serialize_missing_as_null(true);
    tx.serialize(&serializer)
        .map_err(|e| JsError::new(&e.to_string()))
}

/// `pczt` with a Ledger's `signatures` applied: `{ orchard, ironwood,
/// transparent }`, each a list of hex signatures in the order the kit returns
/// them. Throws if one doesn't sign this PCZT.
#[wasm_bindgen]
pub fn apply_ledger_signatures(pczt: &[u8], signatures: JsValue) -> Result<Vec<u8>, JsError> {
    let signatures: Signatures =
        serde_wasm_bindgen::from_value(signatures).map_err(|e| JsError::new(&e.to_string()))?;
    let pczt = Pczt::parse(pczt).map_err(|e| JsError::new(&format!("{e:?}")))?;
    let signed = apply(pczt, signatures).map_err(|e| JsError::new(&e))?;
    signed
        .serialize()
        .map_err(|e| JsError::new(&format!("{e:?}")))
}

#[cfg(test)]
mod tests {
    use zcash_keys::keys::UnifiedFullViewingKey;

    use super::*;
    use crate::build::pczt;
    use crate::send::tests::{wallet_ufvk, SEED, TIP};
    use crate::wallet::{Wallet, WalletData};

    const MAIN: Network = Network::MainNetwork;

    fn fingerprint() -> [u8; 32] {
        zip32::fingerprint::SeedFingerprint::from_seed(&SEED)
            .unwrap()
            .to_bytes()
    }

    fn ufvk() -> UnifiedFullViewingKey {
        UnifiedFullViewingKey::decode(&MAIN, &wallet_ufvk()).unwrap()
    }

    /// 50,000 from a 200,000 Ironwood note to a transparent address.
    fn ironwood_send() -> Pczt {
        let (wallet, trees, _) = crate::build::tests::wallet_and_trees("ironwood", 200_000);
        let to = crate::transparent_tx::derive(&MAIN, &wallet_ufvk(), "external", 5, 1)
            .unwrap()
            .remove(0);
        let proposal = crate::send::tests::plan(&wallet, &to, 50_000);
        pczt(&wallet, &ufvk(), fingerprint(), 0, &proposal, &trees, None).unwrap()
    }

    /// A 100,000 coin at the first external address, into Ironwood.
    fn shield() -> Pczt {
        let ours = crate::transparent_tx::derive(&MAIN, &wallet_ufvk(), "external", 0, 1)
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
        // Only its Ironwood tree, for the anchor.
        let (_, trees, _) = crate::build::tests::wallet_and_trees("ironwood", 1);
        let proposal = crate::send::tests::plan_shield(&wallet);
        pczt(&wallet, &ufvk(), fingerprint(), 0, &proposal, &trees, None).unwrap()
    }

    /// What a device holding `SEED` returns for `unsigned`: the signatures
    /// the keychain's own signer makes, in the kit's order.
    fn device_signatures(unsigned: &Pczt) -> Signatures {
        let signed = crate::roles::sign(&MAIN, unsigned.clone(), &SEED, 0).unwrap();
        let sigs = |before: &pczt::orchard::Bundle, after: &pczt::orchard::Bundle| {
            before
                .actions()
                .iter()
                .zip(after.actions())
                .filter(|(b, _)| b.spend().spend_auth_sig().is_none())
                .map(|(_, a)| hex::encode(a.spend().spend_auth_sig().unwrap()))
                .collect()
        };
        let mut transparent = Vec::new();
        Verifier::new(signed.clone())
            .with_transparent::<Infallible, _>(|bundle| {
                transparent = bundle
                    .inputs()
                    .iter()
                    .map(|i| hex::encode(i.partial_signatures().values().next().unwrap()))
                    .collect();
                Ok(())
            })
            .unwrap();
        Signatures {
            orchard: sigs(unsigned.orchard(), signed.orchard()),
            ironwood: sigs(unsigned.ironwood(), signed.ironwood()),
            transparent,
        }
    }

    #[test]
    fn reads_an_ironwood_spend_as_the_device_does() {
        let unsigned = ironwood_send();
        let tx = transaction(&MAIN, &unsigned.clone().serialize().unwrap(), 0).unwrap();

        assert_eq!((tx.global.tx_version, tx.global.coin_type), (6, 133));
        let ironwood = tx.ironwood_bundle.as_ref().expect("V6 sends Ironwood");
        assert_eq!(ironwood.actions.len(), unsigned.ironwood().actions().len());
        assert_eq!(
            tx.orchard_bundle.actions.len(),
            unsigned.orchard().actions().len()
        );
        // The spent note names its key; padding gets the account's.
        let (real, dummy): (Vec<_>, Vec<_>) =
            ironwood.actions.iter().partition(|a| a.spend_value > 0);
        assert_eq!(real.len(), 1);
        assert_eq!(real[0].spend_value, 200_000);
        assert_eq!(real[0].seed_fingerprint.as_slice(), fingerprint());
        assert!(dummy
            .iter()
            .all(|a| a.seed_fingerprint.as_slice() == [0; 32]));
        assert!(ironwood
            .actions
            .iter()
            .all(|a| a.signing_path == "32'/133'/0'" && a.note_plaintext_version == Some(3)));
        assert_eq!(tx.transparent_outputs.len(), 1);
        assert_eq!(tx.transparent_outputs[0].value, 50_000);
        assert!(tx.transparent_outputs[0].derivation.is_none());

        // Named as the kit's `PcztTransaction` names them.
        let json = serde_json::to_value(&tx).unwrap();
        assert!(json["global"]["fallbackLockTime"].is_number());
        assert!(json["ironwoodBundle"]["actions"][0]["notePlaintextVersion"].is_number());
        assert!(json["transparentOutputs"][0]["scriptPubKey"].is_array());
    }

    #[test]
    fn reads_a_transparent_input_as_the_device_does() {
        let tx = transaction(&MAIN, &shield().serialize().unwrap(), 0).unwrap();
        let [input] = &tx.transparent_inputs[..] else {
            panic!("one coin")
        };
        assert_eq!((input.value, input.sighash_type), (100_000, 1));
        assert_eq!(input.derivation.signing_path, "44'/133'/0'/0/0");
        assert_eq!(input.derivation.pubkey.len(), 33);
        assert_eq!(input.derivation.seed_fingerprint.as_slice(), fingerprint());
        assert!(tx
            .ironwood_bundle
            .unwrap()
            .actions
            .iter()
            .all(|a| a.spend_value == 0));
    }

    #[test]
    fn device_signatures_make_a_transaction() {
        for unsigned in [ironwood_send(), shield()] {
            let signed = apply(unsigned.clone(), device_signatures(&unsigned)).unwrap();
            // The extractor checks every signature, binding ones included.
            crate::roles::prove(signed, None).unwrap();
        }
    }

    #[test]
    fn refuses_signatures_that_dont_sign_this_pczt() {
        let unsigned = ironwood_send();
        let mut sigs = device_signatures(&unsigned);
        sigs.ironwood[0] = hex::encode([1u8; 64]);
        assert!(apply(unsigned.clone(), sigs).is_err());

        let mut sigs = device_signatures(&unsigned);
        sigs.ironwood.pop();
        assert!(apply(unsigned, sigs).is_err());

        let unsigned = shield();
        let mut sigs = device_signatures(&unsigned);
        // A well-formed signature by no key the coin names.
        sigs.transparent = vec![hex::encode([
            0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x01, 0x01,
        ])];
        assert!(apply(unsigned, sigs).is_err());
    }
}
