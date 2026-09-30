// Copyright 2026 Heliax AG
// SPDX-License-Identifier: Apache-2.0, MIT

//! Shielding: the wallet's transparent coins into its own Ironwood address, as
//! a PCZT passed between three hands. The app creates it from the viewing key,
//! the keychain signs it with the seed, and the app proves it and extracts the
//! transaction to broadcast.
//!
//! From NU6.3 new shielded value lands in Ironwood: an Orchard bundle may only
//! send each note back to the address it came from.

use std::convert::Infallible;

use orchard::circuit::{OrchardCircuitVersion, ProvingKey, VerifyingKey};
use pczt::roles::{
    creator::Creator, io_finalizer::IoFinalizer, prover::Prover, signer::Signer,
    spend_finalizer::SpendFinalizer, tx_extractor::TransactionExtractor, updater::Updater,
    verifier::Verifier,
};
use pczt::Pczt;
use rand_core::OsRng;
use serde::{Deserialize, Serialize};
use transparent::bundle::{OutPoint, TxOut};
use transparent::keys::{NonHardenedChildIndex, TransparentKeyScope};
use transparent::pczt::Bip32Derivation;
use wasm_bindgen::prelude::*;
use zcash_keys::address::Address;
use zcash_keys::keys::{UnifiedAddressRequest, UnifiedFullViewingKey, UnifiedSpendingKey};
use zcash_primitives::transaction::builder::{BuildConfig, Builder, BundlePadding};
use zcash_primitives::transaction::fees::zip317::FeeRule;
use zcash_protocol::consensus::{BlockHeight, Network, NetworkConstants, Parameters};
use zcash_protocol::memo::MemoBytes;
use zcash_protocol::value::Zatoshis;
use zip32::fingerprint::SeedFingerprint;
use zip32::{AccountId, Scope};


use crate::parse_network;

const HARDENED: u32 = 0x8000_0000;

/// A coin to shield. Its address must be one of the viewing key's.
#[derive(Deserialize)]
pub(crate) struct Utxo {
    /// Explorer byte order.
    txid: String,
    index: u32,
    value: u64,
    address: String,
    /// Where the address sits: `"external"` or `"internal"` chain, and index.
    scope: String,
    address_index: u32,
}

fn key_scope(scope: &str) -> Result<TransparentKeyScope, String> {
    match scope {
        "external" => Ok(TransparentKeyScope::EXTERNAL),
        "internal" => Ok(TransparentKeyScope::INTERNAL),
        _ => Err(format!("unknown scope {scope}")),
    }
}

fn to_pczt_error(e: impl std::fmt::Debug) -> String {
    format!("{e:?}")
}

/// Every coin into one Ironwood note at the account's default address,
/// less the ZIP-317 fee.
pub(crate) fn create(
    network: &Network,
    ufvk: &str,
    seed_fingerprint: [u8; 32],
    hd_index: u32,
    utxos: &[Utxo],
    target_height: u32,
) -> Result<Pczt, String> {
    let ufvk = UnifiedFullViewingKey::decode(network, ufvk)?;
    let account = ufvk.transparent().ok_or("viewing key has no transparent part")?;
    let fvk = ufvk.orchard().ok_or("viewing key has no Orchard part")?;
    let (default, _) = ufvk
        .default_address(UnifiedAddressRequest::SHIELDED)
        .map_err(|e| e.to_string())?;
    let recipient = *default.orchard().ok_or("default address has no Orchard receiver")?;

    let mut inputs = Vec::with_capacity(utxos.len());
    let mut total = Zatoshis::ZERO;
    for utxo in utxos {
        let scope = key_scope(&utxo.scope)?;
        let index = NonHardenedChildIndex::from_index(utxo.address_index).ok_or("address index out of range")?;
        let pubkey = account.derive_address_pubkey(scope, index).map_err(|e| e.to_string())?;
        let Some(Address::Transparent(address)) = Address::decode(network, &utxo.address) else {
            return Err(format!("not a transparent address: {}", utxo.address));
        };
        let mut txid = crate::hex_n::<32>(&utxo.txid)?;
        txid.reverse();
        let value = Zatoshis::from_u64(utxo.value).map_err(|_| "UTXO value out of range")?;
        total = (total + value).ok_or("UTXO total out of range")?;
        inputs.push((scope, index, pubkey, OutPoint::new(txid, utxo.index), TxOut::new(value, address.script().into())));
    }

    // ponytail: the empty tree's root as anchor holds only while nothing is
    // spent from Ironwood here; spends need a real root from ziziphus.
    let builder = |value: Zatoshis| -> Result<Builder<Network, ()>, String> {
        let mut builder = Builder::new(
            *network,
            BlockHeight::from(target_height),
            BuildConfig::Standard {
                sapling_anchor: None,
                orchard_anchor: None,
                ironwood_anchor: Some(orchard::Anchor::empty_tree()),
                orchard_padding: BundlePadding::DEFAULT,
                ironwood_padding: BundlePadding::DEFAULT,
            },
        );
        for (_, _, pubkey, outpoint, coin) in &inputs {
            builder
                .add_transparent_p2pkh_input(*pubkey, outpoint.clone(), coin.clone())
                .map_err(to_pczt_error)?;
        }
        builder
            .add_ironwood_output::<Infallible>(Some(fvk.to_ovk(Scope::Internal)), recipient, value, MemoBytes::empty())
            .map_err(to_pczt_error)?;
        Ok(builder)
    };

    // The fee depends on the transaction's shape, never on the amounts.
    let fee_rule = FeeRule::standard();
    let fee = builder(total)?.get_fee(&fee_rule).map_err(to_pczt_error)?;
    let value = (total - fee).ok_or("not enough to cover the fee")?;
    let built = builder(value)?.build_for_pczt(OsRng, &fee_rule).map_err(to_pczt_error)?;
    let output = built.ironwood_meta.output_action_index(0).expect("one Ironwood output was added");
    let parts = built.pczt_parts;

    let pczt = Creator::build_from_parts(parts).ok_or("transaction version has no PCZT form")?;
    let pczt = IoFinalizer::new(pczt).finalize_io().map_err(to_pczt_error)?;

    // Each input names where its key sits, so the keychain can find it, and
    // the output its address, so the keychain can show where funds go.
    let coin_type = network.network_type().coin_type();
    Updater::new(pczt)
        .update_ironwood_with(|mut updater| {
            updater.update_action_with(output, |mut action| {
                action.set_output_user_address(default.encode(network));
                Ok(())
            })
        })
        .map_err(to_pczt_error)?
        .update_transparent_with(|mut updater| {
            for (i, (scope, index, pubkey, _, _)) in inputs.iter().enumerate() {
                let path = vec![
                    44 | HARDENED,
                    coin_type | HARDENED,
                    hd_index | HARDENED,
                    bip32::ChildNumber::from(*scope).into(),
                    index.index(),
                ];
                let derivation = Bip32Derivation::parse(seed_fingerprint, path).expect("a BIP-44 path parses");
                updater.update_input_with(i, |mut input| {
                    input.set_bip32_derivation(pubkey.serialize(), derivation);
                    Ok(())
                })?;
            }
            Ok(())
        })
        .map(Updater::finish)
        .map_err(to_pczt_error)
}

/// Signs every input the seed's account `hd_index` holds: transparent coins
/// by their BIP 44 path, shielded notes by their ZIP 32 account. Sapling spends
/// also get the proof generation key their prover needs, for the key scope
/// their own nullifier proves they were received on.
pub(crate) fn sign(network: &Network, pczt: Pczt, seed: &[u8], hd_index: u32) -> Result<Pczt, String> {
    let fingerprint = SeedFingerprint::from_seed(seed).ok_or("seed must be 32 to 252 bytes")?;
    let account = AccountId::try_from(hd_index).map_err(|_| "account index out of range")?;
    let usk = UnifiedSpendingKey::from_seed(network, seed, account).map_err(to_pczt_error)?;
    let coin = network.network_type().coin_type();
    let ours = |derivation: Option<AccountId>| derivation == Some(account);

    let sapling_external = usk.sapling().clone();
    let sapling_internal = sapling_external.derive_internal();
    let sapling_keys = [(Scope::External, &sapling_external), (Scope::Internal, &sapling_internal)];

    let mut transparent_spends = Vec::new();
    let mut sapling_spends = Vec::new();
    let mut orchard_spends = Vec::new();
    let mut ironwood_spends = Vec::new();
    let pczt = Verifier::new(pczt)
        .with_transparent::<Infallible, _>(|bundle| {
            for (i, input) in bundle.inputs().iter().enumerate() {
                for derivation in input.bip32_derivation().values() {
                    if let Some((id, scope, index)) =
                        derivation.extract_bip_44_fields(&fingerprint, bip32::ChildNumber(coin | HARDENED))
                    {
                        if id == account {
                            transparent_spends.push((i, scope, index));
                        }
                    }
                }
            }
            Ok(())
        })
        .map_err(to_pczt_error)?
        .with_sapling::<String, _>(|bundle| {
            for (i, spend) in bundle.spends().iter().enumerate() {
                let derived = spend
                    .zip32_derivation()
                    .as_ref()
                    .and_then(|d| d.extract_account_index(&fingerprint, zip32::ChildIndex::hardened(coin)));
                if !ours(derived) {
                    continue;
                }
                let (_, key) = sapling_keys
                    .iter()
                    .find(|(_, key)| spend.verify_nullifier(Some(key.to_diversifiable_full_viewing_key().fvk())).is_ok())
                    .ok_or_else(|| {
                        pczt::roles::verifier::SaplingError::Custom(
                            "a Sapling spend names this account but isn't its note".to_string(),
                        )
                    })?;
                sapling_spends.push((i, (*key).clone()));
            }
            Ok(())
        })
        .map_err(to_pczt_error)?
        .with_orchard::<Infallible, _>(|bundle| {
            for (i, action) in bundle.actions().iter().enumerate() {
                let derived = action
                    .spend()
                    .zip32_derivation()
                    .as_ref()
                    .and_then(|d| d.extract_account_index(&fingerprint, zip32::ChildIndex::hardened(coin)));
                if ours(derived) {
                    orchard_spends.push(i);
                }
            }
            Ok(())
        })
        .map_err(to_pczt_error)?
        .with_ironwood::<Infallible, _>(|bundle| {
            for (i, action) in bundle.actions().iter().enumerate() {
                let derived = action
                    .spend()
                    .zip32_derivation()
                    .as_ref()
                    .and_then(|d| d.extract_account_index(&fingerprint, zip32::ChildIndex::hardened(coin)));
                if ours(derived) {
                    ironwood_spends.push(i);
                }
            }
            Ok(())
        })
        .map_err(to_pczt_error)?
        .finish();
    if transparent_spends.is_empty() && sapling_spends.is_empty() && orchard_spends.is_empty() && ironwood_spends.is_empty() {
        return Err("no input belongs to this account".into());
    }

    let pczt = Updater::new(pczt)
        .update_sapling_with(|mut updater| {
            for (i, key) in &sapling_spends {
                updater.update_spend_with(*i, |mut spend| spend.set_proof_generation_key(key.expsk.proof_generation_key()))?;
            }
            Ok(())
        })
        .map_err(to_pczt_error)?
        .finish();

    let mut signer = Signer::new(pczt).map_err(to_pczt_error)?;
    for (i, scope, index) in transparent_spends {
        let sk = usk.transparent().derive_secret_key(scope, index).map_err(to_pczt_error)?;
        signer.sign_transparent(i, &sk).map_err(to_pczt_error)?;
    }
    for (i, key) in &sapling_spends {
        signer.sign_sapling(*i, &key.expsk.ask).map_err(to_pczt_error)?;
    }
    let ask = orchard::keys::SpendAuthorizingKey::from(usk.orchard());
    for i in orchard_spends {
        signer.sign_orchard(i, &ask).map_err(to_pczt_error)?;
    }
    for i in ironwood_spends {
        signer.sign_ironwood(i, &ask).map_err(to_pczt_error)?;
    }
    Ok(signer.finish())
}

/// A PCZT's value flows, as the keychain's approval screen shows them.
/// Shielded inputs are totals per pool: a spend's own value may be redacted,
/// but each bundle keeps its net value.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Summary {
    network: &'static str,
    transparent_inputs: Vec<Flow>,
    transparent_outputs: Vec<Flow>,
    sapling_inputs: Vec<Flow>,
    sapling_outputs: Vec<Flow>,
    /// Orchard and Ironwood together.
    orchard_inputs: Vec<Flow>,
    orchard_outputs: Vec<Flow>,
    fee: String,
}

#[derive(Serialize)]
struct Flow {
    address: Option<String>,
    value: String,
}

pub(crate) fn summarize(network: &Network, pczt: &Pczt) -> Summary {
    // The two standard scripts, which are all this wallet builds or holds.
    let address = |script: &[u8]| {
        use transparent::address::TransparentAddress::{PublicKeyHash, ScriptHash};
        let hash = |bytes: &[u8]| <[u8; 20]>::try_from(bytes).expect("20 bytes");
        let address = match script {
            [0x76, 0xa9, 0x14, h @ .., 0x88, 0xac] if h.len() == 20 => PublicKeyHash(hash(h)),
            [0xa9, 0x14, h @ .., 0x87] if h.len() == 20 => ScriptHash(hash(h)),
            _ => return None,
        };
        Some(Address::Transparent(address).encode(network))
    };
    let transparent_inputs: Vec<_> =
        pczt.transparent().inputs().iter().map(|i| (address(i.script_pubkey()), *i.value())).collect();
    let transparent_outputs: Vec<_> =
        pczt.transparent().outputs().iter().map(|o| (address(o.script_pubkey()), *o.value())).collect();
    // Padding outputs carry no value and name no one.
    let real = |value: Option<u64>, address: &Option<String>| value.filter(|v| *v > 0 || address.is_some());
    let sapling_outputs: Vec<_> = pczt
        .sapling()
        .outputs()
        .iter()
        .filter_map(|o| real(*o.value(), o.user_address()).map(|v| (o.user_address().clone(), v)))
        .collect();
    let orchard_family = [pczt.orchard(), pczt.ironwood()];
    let orchard_outputs: Vec<_> = orchard_family
        .iter()
        .flat_map(|bundle| bundle.actions())
        .filter_map(|a| real(*a.output().value(), a.output().user_address()).map(|v| (a.output().user_address().clone(), v)))
        .collect();

    // A bundle's net value is what its spends brought in beyond its outputs.
    let sapling_net = *pczt.sapling().value_sum();
    let orchard_net: i128 = orchard_family
        .iter()
        .map(|b| {
            let (magnitude, negative) = *b.value_sum();
            if negative { -i128::from(magnitude) } else { i128::from(magnitude) }
        })
        .sum();
    let sum = |list: &[(Option<String>, u64)]| list.iter().map(|(_, v)| i128::from(*v)).sum::<i128>();
    let sapling_in = sapling_net + sum(&sapling_outputs);
    let orchard_in = orchard_net + sum(&orchard_outputs);
    let fee = sum(&transparent_inputs) - sum(&transparent_outputs) + sapling_net + orchard_net;

    let flows = |list: Vec<(Option<String>, u64)>| {
        list.into_iter().map(|(address, value)| Flow { address, value: value.to_string() }).collect()
    };
    let total = |value: i128| {
        (value > 0).then(|| Flow { address: None, value: value.to_string() }).into_iter().collect()
    };
    Summary {
        network: match network {
            Network::MainNetwork => "main",
            Network::TestNetwork => "test",
        },
        transparent_inputs: flows(transparent_inputs),
        transparent_outputs: flows(transparent_outputs),
        sapling_inputs: total(sapling_in),
        sapling_outputs: flows(sapling_outputs),
        orchard_inputs: total(orchard_in),
        orchard_outputs: flows(orchard_outputs),
        fee: fee.to_string(),
    }
}

/// A signed PCZT, proven and finalized: `{ txid, raw }` to broadcast.
#[derive(Serialize)]
struct Extracted {
    txid: String,
    raw: Vec<u8>,
}

/// The Sapling proving parameters, read once their hashes have been checked.
pub(crate) struct SaplingParams {
    spend: sapling::circuit::SpendParameters,
    output: sapling::circuit::OutputParameters,
}

impl SaplingParams {
    /// Reads `sapling-spend.params` and `sapling-output.params`. Their
    /// encodings aren't re-checked: the caller verified the files' hashes.
    pub(crate) fn read(spend: &[u8], output: &[u8]) -> Result<Self, String> {
        Ok(SaplingParams {
            spend: sapling::circuit::SpendParameters::read(spend, false).map_err(|e| format!("spend params: {e}"))?,
            output: sapling::circuit::OutputParameters::read(output, false).map_err(|e| format!("output params: {e}"))?,
        })
    }
}

pub(crate) fn prove(pczt: Pczt, sapling: Option<&SaplingParams>) -> Result<(String, Vec<u8>), String> {
    let circuit = OrchardCircuitVersion::PostNu6_3;
    let mut prover = Prover::new(pczt);
    if prover.requires_sapling_proofs() {
        let params = sapling.ok_or("Sapling proofs need the Sapling parameters")?;
        prover = prover.create_sapling_proofs(&params.spend, &params.output).map_err(to_pczt_error)?;
    }
    if prover.requires_orchard_proof() || prover.requires_ironwood_proof() {
        let pk = ProvingKey::build(circuit);
        if prover.requires_orchard_proof() {
            prover = prover.create_orchard_proof(&pk).map_err(to_pczt_error)?;
        }
        if prover.requires_ironwood_proof() {
            prover = prover.create_ironwood_proof(&pk).map_err(to_pczt_error)?;
        }
    }
    let pczt = SpendFinalizer::new(prover.finish()).finalize_spends().map_err(to_pczt_error)?;
    let vk = VerifyingKey::build(circuit);
    let sapling_vks = sapling.map(|p| (p.spend.verifying_key(), p.output.verifying_key()));
    let mut extractor = TransactionExtractor::new(pczt).with_orchard(&vk);
    if let Some((spend_vk, output_vk)) = &sapling_vks {
        extractor = extractor.with_sapling(spend_vk, output_vk);
    }
    let tx = extractor.extract().map_err(to_pczt_error)?;
    let mut raw = Vec::new();
    tx.write(&mut raw).map_err(|e| e.to_string())?;
    Ok((tx.txid().to_string(), raw))
}

fn parse(bytes: &[u8]) -> Result<Pczt, JsError> {
    Pczt::parse(bytes).map_err(|e| JsError::new(&format!("{e:?}")))
}

fn serialize(pczt: Pczt) -> Result<Vec<u8>, JsError> {
    pczt.serialize().map_err(|e| JsError::new(&format!("{e:?}")))
}

/// An unsigned PCZT shielding `utxos` (`[{ txid, index, value, address,
/// scope, address_index }]`) into the account's own Ironwood address.
#[wasm_bindgen]
pub fn shield_pczt(
    network: &str,
    ufvk: &str,
    seed_fingerprint: &str,
    hd_index: u32,
    utxos: JsValue,
    target_height: u32,
) -> Result<Vec<u8>, JsError> {
    let network = parse_network(network).map_err(|e| JsError::new(&e))?;
    let fingerprint = crate::hex_n::<32>(seed_fingerprint).map_err(|e| JsError::new(&e))?;
    let utxos: Vec<Utxo> = serde_wasm_bindgen::from_value(utxos).map_err(|e| JsError::new(&e.to_string()))?;
    let pczt = create(&network, ufvk, fingerprint, hd_index, &utxos, target_height).map_err(|e| JsError::new(&e))?;
    serialize(pczt)
}

/// The PCZT with every input the seed's account `hd_index` holds signed.
#[wasm_bindgen]
pub fn sign_pczt(network: &str, pczt: &[u8], seed: &[u8], hd_index: u32) -> Result<Vec<u8>, JsError> {
    let network = parse_network(network).map_err(|e| JsError::new(&e))?;
    let signed = sign(&network, parse(pczt)?, seed, hd_index).map_err(|e| JsError::new(&e))?;
    serialize(signed)
}

/// What a PCZT moves: `{ network, transparentInputs, transparentOutputs,
/// orchardOutputs, fee }`, values in zatoshis as strings.
#[wasm_bindgen]
pub fn pczt_summary(network: &str, pczt: &[u8]) -> Result<JsValue, JsError> {
    let network = parse_network(network).map_err(|e| JsError::new(&e))?;
    let summary = summarize(&network, &parse(pczt)?);
    serde_wasm_bindgen::to_value(&summary).map_err(|e| JsError::new(&e.to_string()))
}

/// Whether proving `pczt` needs the Sapling parameters (~51 MB to fetch).
#[wasm_bindgen]
pub fn needs_sapling_params(pczt: &[u8]) -> Result<bool, JsError> {
    Ok(Prover::new(parse(pczt)?).requires_sapling_proofs())
}

/// Proves a signed PCZT and extracts its transaction: `{ txid, raw }`. The
/// Sapling parameters are needed only when [`needs_sapling_params`] says so.
/// Building the Halo2 proving key alone takes seconds; run it off the UI thread.
#[wasm_bindgen]
pub fn prove_pczt(pczt: &[u8], sapling_spend: Option<Vec<u8>>, sapling_output: Option<Vec<u8>>) -> Result<JsValue, JsError> {
    let sapling = match (sapling_spend, sapling_output) {
        (Some(spend), Some(output)) => Some(SaplingParams::read(&spend, &output).map_err(|e| JsError::new(&e))?),
        _ => None,
    };
    let (txid, raw) = prove(parse(pczt)?, sapling.as_ref()).map_err(|e| JsError::new(&e))?;
    serde_wasm_bindgen::to_value(&Extracted { txid, raw }).map_err(|e| JsError::new(&e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use zcash_protocol::consensus::BranchId;

    /// Creates, signs and proves a shielding of a made-up coin end to end: the
    /// extractor verifies the Ironwood proof and every signature.
    #[test]
    fn shields_a_coin_into_ironwood() {
        let network = Network::MainNetwork;
        let seed = [7u8; 32];
        let ufvk = UnifiedSpendingKey::from_seed(&network, &seed, AccountId::ZERO)
            .unwrap()
            .to_unified_full_viewing_key();
        let encoded = ufvk.encode(&network);
        let address = crate::transparent_tx::derive(&network, &encoded, "internal", 3, 1).unwrap().remove(0);
        let utxo = Utxo {
            txid: "11".repeat(32),
            index: 1,
            value: 100_000,
            address: address.clone(),
            scope: "internal".into(),
            address_index: 3,
        };
        let nu6_3 = network.activation_height(zcash_protocol::consensus::NetworkUpgrade::Nu6_3).unwrap();
        let fingerprint = SeedFingerprint::from_seed(&seed).unwrap().to_bytes();
        let pczt = create(&network, &encoded, fingerprint, 0, &[utxo], u32::from(nu6_3) + 10).unwrap();

        let summary = summarize(&network, &pczt);
        assert_eq!(summary.transparent_inputs[0].address.as_deref(), Some(address.as_str()));
        // One transparent input and two padded Ironwood actions: 3 × 5,000.
        assert_eq!(summary.fee, "15000");
        assert_eq!(summary.orchard_outputs.len(), 1);
        assert!(summary.orchard_outputs[0].address.as_deref().unwrap().starts_with("u1"));
        assert_eq!(summary.orchard_outputs[0].value, "85000");

        // Another account's seed signs nothing.
        assert!(sign(&network, pczt.clone(), &[8u8; 32], 0).is_err());
        let signed = sign(&network, pczt, &seed, 0).unwrap();
        let (txid, raw) = prove(signed, None).unwrap();
        let tx = zcash_primitives::transaction::Transaction::read(&raw[..], BranchId::Nu6_3).unwrap();
        assert_eq!(tx.txid().to_string(), txid);
        assert!(tx.ironwood_bundle().is_some());
        assert_eq!(tx.transparent_bundle().unwrap().vin.len(), 1);
    }
}
