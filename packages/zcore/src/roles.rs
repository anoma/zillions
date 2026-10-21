//! The PCZT roles past creation: the keychain's signer, the app's prover and
//! transaction extractor, and the summary the keychain's approval shows.
//! Creation is `build.rs`'s, from a plan.

use std::convert::Infallible;

use orchard::circuit::{OrchardCircuitVersion, ProvingKey, VerifyingKey};
use pczt::roles::verifier::OrchardError;
use pczt::roles::{
    prover::Prover, signer::Signer, spend_finalizer::SpendFinalizer,
    tx_extractor::TransactionExtractor, updater::Updater, verifier::Verifier,
};
use pczt::Pczt;
use serde::Serialize;
use transparent::address::TransparentAddress;
use transparent::keys::{NonHardenedChildIndex, TransparentKeyScope};
use wasm_bindgen::prelude::*;
use zcash_keys::address::{Address, UnifiedAddress};
use zcash_keys::keys::{UnifiedFullViewingKey, UnifiedSpendingKey};
use zcash_protocol::consensus::{Network, NetworkConstants, Parameters};
use zip32::fingerprint::SeedFingerprint;
use zip32::{AccountId, Scope};
use pczt::roles::combiner::Combiner;

use crate::parse_network;

const HARDENED: u32 = 0x8000_0000;

fn to_pczt_error(e: impl std::fmt::Debug) -> String {
    format!("{e:?}")
}

/// Signs every input the seed's account `hd_index` holds: transparent coins
/// by their BIP 44 path, shielded notes by their ZIP 32 account. Sapling spends
/// also get the proof generation key their prover needs, for the key scope
/// their own nullifier proves they were received on.
pub(crate) fn sign(
    network: &Network,
    pczt: Pczt,
    seed: &[u8],
    hd_index: u32,
) -> Result<Pczt, String> {
    let fingerprint = SeedFingerprint::from_seed(seed).ok_or("seed must be 32 to 252 bytes")?;
    let account = AccountId::try_from(hd_index).map_err(|_| "account index out of range")?;
    let usk = UnifiedSpendingKey::from_seed(network, seed, account).map_err(to_pczt_error)?;
    let coin = network.network_type().coin_type();
    let ours = |derivation: Option<AccountId>| derivation == Some(account);

    let sapling_external = usk.sapling().clone();
    let sapling_internal = sapling_external.derive_internal();
    let sapling_keys = [
        (Scope::External, &sapling_external),
        (Scope::Internal, &sapling_internal),
    ];

    let mut transparent_spends = Vec::new();
    let mut sapling_spends = Vec::new();
    let mut orchard_spends = Vec::new();
    let mut ironwood_spends = Vec::new();
    let pczt = Verifier::new(pczt)
        .with_transparent::<Infallible, _>(|bundle| {
            for (i, input) in bundle.inputs().iter().enumerate() {
                for derivation in input.bip32_derivation().values() {
                    if let Some((id, scope, index)) = derivation
                        .extract_bip_44_fields(&fingerprint, bip32::ChildNumber(coin | HARDENED))
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
                let derived = spend.zip32_derivation().as_ref().and_then(|d| {
                    d.extract_account_index(&fingerprint, zip32::ChildIndex::hardened(coin))
                });
                if !ours(derived) {
                    continue;
                }
                let (_, key) = sapling_keys
                    .iter()
                    .find(|(_, key)| {
                        spend
                            .verify_nullifier(Some(key.to_diversifiable_full_viewing_key().fvk()))
                            .is_ok()
                    })
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
                let derived = action.spend().zip32_derivation().as_ref().and_then(|d| {
                    d.extract_account_index(&fingerprint, zip32::ChildIndex::hardened(coin))
                });
                if ours(derived) {
                    orchard_spends.push(i);
                }
            }
            Ok(())
        })
        .map_err(to_pczt_error)?
        .with_ironwood::<Infallible, _>(|bundle| {
            for (i, action) in bundle.actions().iter().enumerate() {
                let derived = action.spend().zip32_derivation().as_ref().and_then(|d| {
                    d.extract_account_index(&fingerprint, zip32::ChildIndex::hardened(coin))
                });
                if ours(derived) {
                    ironwood_spends.push(i);
                }
            }
            Ok(())
        })
        .map_err(to_pczt_error)?
        .finish();
    if transparent_spends.is_empty()
        && sapling_spends.is_empty()
        && orchard_spends.is_empty()
        && ironwood_spends.is_empty()
    {
        return Err("no input belongs to this account".into());
    }

    let pczt = Updater::new(pczt)
        .update_sapling_with(|mut updater| {
            for (i, key) in &sapling_spends {
                updater.update_spend_with(*i, |mut spend| {
                    spend.set_proof_generation_key(key.expsk.proof_generation_key())
                })?;
            }
            Ok(())
        })
        .map_err(to_pczt_error)?
        .finish();

    let mut signer = Signer::new(pczt).map_err(to_pczt_error)?;
    for (i, scope, index) in transparent_spends {
        let sk = usk
            .transparent()
            .derive_secret_key(scope, index)
            .map_err(to_pczt_error)?;
        signer.sign_transparent(i, &sk).map_err(to_pczt_error)?;
    }
    for (i, key) in &sapling_spends {
        signer
            .sign_sapling(*i, &key.expsk.ask)
            .map_err(to_pczt_error)?;
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
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Summary {
    network: &'static str,
    transparent_inputs: Vec<Flow>,
    transparent_outputs: Vec<Flow>,
    sapling_inputs: Vec<Flow>,
    sapling_outputs: Vec<Flow>,
    orchard_inputs: Vec<Flow>,
    orchard_outputs: Vec<Flow>,
    ironwood_inputs: Vec<Flow>,
    ironwood_outputs: Vec<Flow>,
    fee: String,
}

#[derive(Serialize, Debug)]
struct Flow {
    address: Option<String>,
    value: String,
    /// Outputs only: whether it lands in the signing account, as its viewing
    /// key proves. Any other output is a payment.
    #[serde(skip_serializing_if = "Option::is_none")]
    mine: Option<bool>,
}

/// An output as the summary shows it: where it pays (`None` when it's ours),
/// how much, and whether it's ours.
type Output = (Option<String>, u64, bool);

pub(crate) enum Receiver {
    Orchard(orchard::Address),
    Sapling(sapling::PaymentAddress),
}

/// The address to show for a payment. The dapp's `user_address` must hold the
/// note's actual receiver; without one, the receiver alone is encoded.
pub(crate) fn payee(
    network: &Network,
    user_address: &Option<String>,
    to: Receiver,
) -> Result<String, String> {
    let Some(claimed) = user_address else {
        return Ok(match to {
            Receiver::Orchard(r) => UnifiedAddress::from_receivers(Some(r), None, None)
                .ok_or("an Orchard receiver makes no address")?
                .encode(network),
            Receiver::Sapling(r) => Address::Sapling(r).encode(network),
        });
    };
    let holds = match (Address::decode(network, claimed), to) {
        (Some(Address::Unified(ua)), Receiver::Orchard(r)) => ua.orchard() == Some(&r),
        (Some(Address::Unified(ua)), Receiver::Sapling(r)) => ua.sapling() == Some(&r),
        (Some(Address::Sapling(pa)), Receiver::Sapling(r)) => pa == r,
        _ => false,
    };
    if holds {
        Ok(claimed.clone())
    } else {
        Err(format!(
            "output claims to pay {claimed} but pays someone else"
        ))
    }
}

/// Every non-padding output, its note checked against its commitment so the
/// value and receiver shown are the ones signed.
fn shielded_outputs(
    network: &Network,
    pczt: &Pczt,
    ufvk: &UnifiedFullViewingKey,
) -> Result<[Vec<Output>; 3], String> {
    let action_outputs = |bundle: &orchard::pczt::Bundle| -> Result<Vec<Output>, String> {
        let mut outputs = Vec::new();
        for action in bundle.actions() {
            let output = action.output();
            // Padding carries no value and names no one.
            if output.value().is_some_and(|v| v.inner() == 0) && output.user_address().is_none() {
                continue;
            }
            output
                .verify_note_commitment(action.spend())
                .map_err(|e| format!("an output doesn't match its note: {e:?}"))?;
            let (Some(recipient), Some(value)) = (*output.recipient(), *output.value()) else {
                unreachable!("a verified note has its receiver and value");
            };
            let mine = ufvk
                .orchard()
                .is_some_and(|fvk| fvk.scope_for_address(&recipient).is_some());
            let address = match mine {
                true => None,
                false => Some(payee(
                    network,
                    output.user_address(),
                    Receiver::Orchard(recipient),
                )?),
            };
            outputs.push((address, value.inner(), mine));
        }
        Ok(outputs)
    };

    let mut sapling_outputs = Vec::new();
    let mut orchard_outputs = Vec::new();
    let mut ironwood_outputs = Vec::new();
    Verifier::new(pczt.clone())
        .with_sapling::<String, _>(|bundle| {
            for output in bundle.outputs() {
                if output.value().is_some_and(|v| v.inner() == 0) && output.user_address().is_none()
                {
                    continue;
                }
                output.verify_note_commitment()?;
                let (Some(recipient), Some(value)) = (*output.recipient(), *output.value()) else {
                    unreachable!("a verified note has its receiver and value");
                };
                let mine = ufvk
                    .sapling()
                    .is_some_and(|dfvk| dfvk.decrypt_diversifier(&recipient).is_some());
                let address = match mine {
                    true => None,
                    false => Some(
                        payee(network, output.user_address(), Receiver::Sapling(recipient))
                            .map_err(pczt::roles::verifier::SaplingError::Custom)?,
                    ),
                };
                sapling_outputs.push((address, value.inner(), mine));
            }
            Ok(())
        })
        .map_err(to_pczt_error)?
        .with_orchard::<String, _>(|bundle| {
            orchard_outputs = action_outputs(bundle).map_err(OrchardError::Custom)?;
            Ok(())
        })
        .map_err(to_pczt_error)?
        .with_ironwood::<String, _>(|bundle| {
            ironwood_outputs = action_outputs(bundle).map_err(OrchardError::Custom)?;
            Ok(())
        })
        .map_err(to_pczt_error)?;
    Ok([sapling_outputs, orchard_outputs, ironwood_outputs])
}

/// Transparent outputs. One is ours when it names a BIP 44 path whose key,
/// derived from the viewing key, is the one its script pays.
fn transparent_outputs(
    network: &Network,
    pczt: &Pczt,
    ufvk: &UnifiedFullViewingKey,
) -> Result<Vec<Output>, String> {
    let address = |script: &[u8]| crate::transparent_tx::script_address(network, script);
    let mut derivations = Vec::new();
    Verifier::new(pczt.clone())
        .with_transparent::<Infallible, _>(|bundle| {
            derivations = bundle
                .outputs()
                .iter()
                .map(|o| {
                    o.bip32_derivation()
                        .iter()
                        .map(|(pubkey, d)| (*pubkey, d.derivation_path().clone()))
                        .collect::<Vec<_>>()
                })
                .collect();
            Ok(())
        })
        .map_err(to_pczt_error)?;
    let ours = |paths: &[([u8; 33], Vec<bip32::ChildNumber>)]| -> Option<String> {
        let account = ufvk.transparent()?;
        paths.iter().find_map(|(pubkey, path)| {
            let [.., scope, index] = path[..] else {
                return None;
            };
            let derived = account
                .derive_address_pubkey(
                    TransparentKeyScope::custom(scope.index())?,
                    NonHardenedChildIndex::from_index(index.index())?,
                )
                .ok()?;
            (derived.serialize() == *pubkey).then(|| {
                Address::Transparent(TransparentAddress::from_pubkey(&derived)).encode(network)
            })
        })
    };
    Ok(pczt
        .transparent()
        .outputs()
        .iter()
        .zip(derivations)
        .map(|(o, paths)| {
            let pays = address(o.script_pubkey());
            let mine = pays.is_some() && ours(&paths) == pays;
            (pays, *o.value(), mine)
        })
        .collect())
}

pub(crate) fn summarize(
    network: &Network,
    pczt: &Pczt,
    ufvk: &UnifiedFullViewingKey,
) -> Result<Summary, String> {
    let address = |script: &[u8]| crate::transparent_tx::script_address(network, script);
    let transparent_inputs: Vec<_> = pczt
        .transparent()
        .inputs()
        .iter()
        .map(|i| (address(i.script_pubkey()), *i.value()))
        .collect();
    let transparent_outputs = transparent_outputs(network, pczt, ufvk)?;
    let [sapling_outputs, orchard_outputs, ironwood_outputs] =
        shielded_outputs(network, pczt, ufvk)?;

    // A bundle's net value is what its spends brought in beyond its outputs.
    let sapling_net = *pczt.sapling().value_sum();
    let action_net = |bundle: &pczt::orchard::Bundle| {
        let (magnitude, negative) = *bundle.value_sum();
        if negative {
            -i128::from(magnitude)
        } else {
            i128::from(magnitude)
        }
    };
    let orchard_net = action_net(pczt.orchard());
    let ironwood_net = action_net(pczt.ironwood());
    let sum = |list: &[Output]| list.iter().map(|(_, v, _)| i128::from(*v)).sum::<i128>();
    let sapling_in = sapling_net + sum(&sapling_outputs);
    let orchard_in = orchard_net + sum(&orchard_outputs);
    let ironwood_in = ironwood_net + sum(&ironwood_outputs);
    let fee = transparent_inputs
        .iter()
        .map(|(_, v)| i128::from(*v))
        .sum::<i128>()
        - sum(&transparent_outputs)
        + sapling_net
        + orchard_net
        + ironwood_net;

    let flows = |list: Vec<Output>| {
        list.into_iter()
            .map(|(address, value, mine)| Flow {
                address,
                value: value.to_string(),
                mine: Some(mine),
            })
            .collect()
    };
    let total = |value: i128| {
        (value > 0)
            .then(|| Flow {
                address: None,
                value: value.to_string(),
                mine: None,
            })
            .into_iter()
            .collect()
    };
    Ok(Summary {
        network: match network {
            Network::MainNetwork => "main",
            Network::TestNetwork => "test",
        },
        transparent_inputs: transparent_inputs
            .into_iter()
            .map(|(address, value)| Flow {
                address,
                value: value.to_string(),
                mine: None,
            })
            .collect(),
        transparent_outputs: flows(transparent_outputs),
        sapling_inputs: total(sapling_in),
        sapling_outputs: flows(sapling_outputs),
        orchard_inputs: total(orchard_in),
        orchard_outputs: flows(orchard_outputs),
        ironwood_inputs: total(ironwood_in),
        ironwood_outputs: flows(ironwood_outputs),
        fee: fee.to_string(),
    })
}

/// A signed PCZT, proven and finalized: `{ txid, raw }` to broadcast.
#[derive(Serialize)]
struct Extracted {
    txid: String,
    raw: Vec<u8>,
    /// The last height it can be mined at; 0 for never.
    expiry_height: u32,
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
            spend: sapling::circuit::SpendParameters::read(spend, false)
                .map_err(|e| format!("spend params: {e}"))?,
            output: sapling::circuit::OutputParameters::read(output, false)
                .map_err(|e| format!("output params: {e}"))?,
        })
    }
}

pub(crate) fn prove(
    pczt: Pczt,
    sapling: Option<&SaplingParams>,
) -> Result<(String, Vec<u8>), String> {
    let circuit = OrchardCircuitVersion::PostNu6_3;
    let mut prover = Prover::new(pczt);
    if prover.requires_sapling_proofs() {
        let params = sapling.ok_or("Sapling proofs need the Sapling parameters")?;
        prover = prover
            .create_sapling_proofs(&params.spend, &params.output)
            .map_err(to_pczt_error)?;
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
    let pczt = SpendFinalizer::new(prover.finish())
        .finalize_spends()
        .map_err(to_pczt_error)?;
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
    pczt.serialize()
        .map_err(|e| JsError::new(&format!("{e:?}")))
}

/// The PCZT with every input the seed's account `hd_index` holds signed.
#[wasm_bindgen]
pub fn sign_pczt(
    network: &str,
    pczt: &[u8],
    seed: &[u8],
    hd_index: u32,
) -> Result<Vec<u8>, JsError> {
    let network = parse_network(network).map_err(|e| JsError::new(&e))?;
    let signed = sign(&network, parse(pczt)?, seed, hd_index).map_err(|e| JsError::new(&e))?;
    serialize(signed)
}

/// Combine the two given PCZTs.
#[wasm_bindgen]
pub fn combine_pczts(
    pczt0: &[u8],
    pczt1: &[u8],
) -> Result<Vec<u8>, JsError> {
    let pczt0 = parse(pczt0)?;
    let pczt1 = parse(pczt1)?;
    let pczt = Combiner::new(vec![pczt0, pczt1]).combine().map_err(|e| JsError::new(&to_pczt_error(&e)))?;
    serialize(pczt)
}

/// What a PCZT moves: `{ network, fee }` and inputs and outputs per pool
/// (`transparent`, `sapling`, `orchard`, `ironwood`), values in zatoshis as
/// strings. Each output says whether it's `mine`, by the signing account's
/// `ufvk`; throws if an output's note or label doesn't match what's signed.
#[wasm_bindgen]
pub fn pczt_summary(network: &str, pczt: &[u8], ufvk: &str) -> Result<JsValue, JsError> {
    let network = parse_network(network).map_err(|e| JsError::new(&e))?;
    let ufvk = UnifiedFullViewingKey::decode(&network, ufvk).map_err(|e| JsError::new(&e))?;
    let summary = summarize(&network, &parse(pczt)?, &ufvk).map_err(|e| JsError::new(&e))?;
    serde_wasm_bindgen::to_value(&summary).map_err(|e| JsError::new(&e.to_string()))
}

/// Whether proving `pczt` needs the Sapling parameters (~51 MB to fetch).
#[wasm_bindgen]
pub fn needs_sapling_params(pczt: &[u8]) -> Result<bool, JsError> {
    Ok(Prover::new(parse(pczt)?).requires_sapling_proofs())
}

/// Proves a signed PCZT and extracts its transaction: `{ txid, raw, expiry_height }`. The
/// Sapling parameters are needed only when [`needs_sapling_params`] says so.
/// Building the Halo2 proving key alone takes seconds; run it off the UI thread.
#[wasm_bindgen]
pub fn prove_pczt(
    pczt: &[u8],
    sapling_spend: Option<Vec<u8>>,
    sapling_output: Option<Vec<u8>>,
) -> Result<JsValue, JsError> {
    let sapling = match (sapling_spend, sapling_output) {
        (Some(spend), Some(output)) => {
            Some(SaplingParams::read(&spend, &output).map_err(|e| JsError::new(&e))?)
        }
        _ => None,
    };
    let pczt = parse(pczt)?;
    let expiry_height = *pczt.global().expiry_height();
    let (txid, raw) = prove(pczt, sapling.as_ref()).map_err(|e| JsError::new(&e))?;
    serde_wasm_bindgen::to_value(&Extracted {
        txid,
        raw,
        expiry_height,
    })
    .map_err(|e| JsError::new(&e.to_string()))
}
