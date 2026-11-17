//! The PCZT roles past creation: the keychain's signer, the app's prover and
//! transaction extractor, and the summary the keychain's approval shows.
//! Creation is `build.rs`'s, from a plan.

use std::convert::Infallible;
use std::sync::OnceLock;

use orchard::circuit::{OrchardCircuitVersion, ProvingKey, VerifyingKey};
use orchard::note::Rho;
use orchard::note_encryption::{
    DomainVersion, IronwoodVersion, NoteEncryptionDomain, OrchardVersion,
};
use pczt::roles::verifier::{OrchardError, SaplingError};
use pczt::roles::{
    combiner::Combiner, prover::Prover, signer::Signer, spend_finalizer::SpendFinalizer,
    tx_extractor::TransactionExtractor, updater::Updater, verifier::Verifier,
};
use pczt::Pczt;
use sapling::note_encryption::{SaplingDomain, Zip212Enforcement};
use serde::Serialize;
use transparent::address::TransparentAddress;
use transparent::keys::{NonHardenedChildIndex, TransparentKeyScope};
use wasm_bindgen::prelude::*;
use zcash_keys::address::{Address, UnifiedAddress};
use zcash_keys::keys::{UnifiedFullViewingKey, UnifiedSpendingKey};
use zcash_note_encryption::{
    note_bytes::NoteBytesData, try_output_recovery_with_ock, try_output_recovery_with_pkd_esk,
    Domain, EphemeralKeyBytes, OutgoingCipherKey, ShieldedOutput, OUT_CIPHERTEXT_SIZE,
};
use zcash_protocol::consensus::{Network, NetworkConstants, Parameters};
use zeroize::Zeroizing;
use zip32::fingerprint::SeedFingerprint;
use zip32::{AccountId, Scope};

use crate::{parse_network, FullOutput};

const HARDENED: u32 = 0x8000_0000;

pub(crate) fn to_pczt_error(e: impl std::fmt::Debug) -> String {
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
    // The checks the approval's summary made, again on what is signed.
    check_values(&pczt)?;
    shielded_outputs(network, &pczt, &usk.to_unified_full_viewing_key())?;
    let coin = network.network_type().coin_type();
    let ours = |derivation: Option<AccountId>| derivation == Some(account);

    let sapling_external = usk.sapling().clone();
    let sapling_internal = sapling_external
        .derive_internal()
        .ok_or("this Sapling key has no internal key")?;
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
                        SaplingError::Custom(
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
                    spend.set_proof_generation_key(key.expsk().proof_generation_key())
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
            .sign_sapling(&mut crate::rng(), *i, key.expsk().ask())
            .map_err(to_pczt_error)?;
    }
    let ask = orchard::keys::SpendAuthorizingKey::from(usk.orchard());
    for i in orchard_spends {
        signer
            .sign_orchard(&mut crate::rng(), i, &ask)
            .map_err(to_pczt_error)?;
    }
    for i in ironwood_spends {
        signer
            .sign_ironwood(&mut crate::rng(), i, &ask)
            .map_err(to_pczt_error)?;
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
    orchard_inputs: Vec<Flow>,
    orchard_outputs: Vec<Flow>,
    ironwood_inputs: Vec<Flow>,
    ironwood_outputs: Vec<Flow>,
    fee: String,
}

#[derive(Serialize)]
struct Flow {
    address: Option<String>,
    value: String,
    /// Outputs only: whether it lands in the signing account, as its viewing
    /// key proves. Any other output is a payment.
    #[serde(skip_serializing_if = "Option::is_none")]
    mine: Option<bool>,
    /// A transparent output of ours: where in the account, so the keychain
    /// can tell an address other wallets scan from one they never reach.
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<ChangePath>,
}

/// A transparent address's place in the account: scope 0 external or 1
/// internal, and its index.
#[derive(Clone, Copy, Serialize)]
pub(crate) struct ChangePath {
    scope: u32,
    index: u32,
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
            Receiver::Orchard(r) => UnifiedAddress::from_receivers(Some(r), None, None, None, None)
                .ok_or("an Orchard receiver makes no address")?
                .encode(network),
            Receiver::Sapling(r) => Address::Sapling(Box::new(r)).encode(network),
        });
    };
    let holds = match (Address::decode(network, claimed), to) {
        (Some(Address::Unified(ua)), Receiver::Orchard(r)) => ua.orchard() == Some(&r),
        (Some(Address::Unified(ua)), Receiver::Sapling(r)) => ua.sapling() == Some(&r),
        (Some(Address::Sapling(pa)), Receiver::Sapling(r)) => *pa == r,
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

/// Whether `output`'s ciphertexts deliver `note`, so its receiver's wallet
/// finds it and can spend it. Decrypted with the key the note's own `rseed`
/// derives (ZIP 212) toward its receiver, so it works for any receiver, in
/// the pool's `domain`, which also refuses another pool's note version. With
/// an `ock`, the outgoing ciphertext must recover the note as well.
fn delivers<D: Domain, O: ShieldedOutput<D>>(
    domain: &D,
    note: &D::Note,
    output: &O,
    ock: &Option<OutgoingCipherKey>,
    out_ciphertext: &[u8; OUT_CIPHERTEXT_SIZE],
) -> bool
where
    D::Note: PartialEq,
{
    let Some(esk) = D::derive_esk(note) else {
        return false;
    };
    let holds = |found: Option<(D::Note, D::Recipient, D::Memo)>| {
        found.is_some_and(|(found, _, _)| &found == note)
    };
    holds(try_output_recovery_with_pkd_esk(
        domain,
        D::get_pk_d(note),
        esk,
        output,
    )) && ock.as_ref().is_none_or(|ock| {
        holds(try_output_recovery_with_ock(
            domain,
            ock,
            output,
            out_ciphertext,
        ))
    })
}

const UNDELIVERABLE: &str =
    "an output's ciphertext doesn't hold its note, so its receiver could never find it";

/// Extract an Orchard (or Ironwood) bundle's outputs.
///
/// The parameter `V` is the pool's note version.
fn extract_orchard_outputs_from_pczt_bundle<V: DomainVersion>(
    network: &Network,
    ufvk: &UnifiedFullViewingKey,
    bundle: &orchard::pczt::Bundle,
) -> Result<Vec<Output>, OrchardError<String>> {
    let mut outputs = Vec::new();

    for action in bundle.actions() {
        let output = action.output();

        // Checked before anything is skipped: the value a PCZT claims is the
        // site's word until its commitment proves it.
        output.verify_note_commitment(action.spend()).map_err(|e| {
            OrchardError::Custom(format!("an output doesn't match its note: {e:?}"))
        })?;

        let (Some(recipient), Some(value), Some(rseed)) =
            (*output.recipient(), *output.value(), *output.rseed())
        else {
            unreachable!("a verified note has its receiver, value and seed");
        };

        // Padding carries no value and names no one.
        if value.inner() == 0 && output.user_address().is_none() {
            continue;
        }

        // A zero-valued output may carry a deliberately random ciphertext
        // (ZIP 326); it delivers nothing to lose.
        if value.inner() > 0 {
            let note = orchard::Note::from_parts(
                recipient,
                value,
                // Rho is the spend's nullifier, as the commitment check used.
                Rho::from_bytes(&action.spend().nullifier().to_bytes())
                    .into_option()
                    .expect("a nullifier is a valid rho"),
                rseed,
                *output.note_version(),
            )
            .into_option()
            .expect("a verified note");
            let encrypted = output.encrypted_note();
            let sent = FullOutput {
                eph_key: EphemeralKeyBytes(encrypted.epk_bytes),
                cm: *output.cmx(),
                enc: NoteBytesData(encrypted.enc_ciphertext.0),
            };
            let domain = NoteEncryptionDomain::<V>::for_pczt_action(action);
            if !delivers(
                &domain,
                &note,
                &sent,
                output.ock(),
                &encrypted.out_ciphertext,
            ) {
                return Err(OrchardError::Custom(UNDELIVERABLE.into()));
            }
        }

        let mine = ufvk
            .orchard()
            .is_some_and(|fvk| fvk.scope_for_address(&recipient).is_some());

        let address = (!mine)
            .then(|| {
                payee(network, output.user_address(), Receiver::Orchard(recipient))
                    .map_err(OrchardError::Custom)
            })
            .transpose()?;

        outputs.push((address, value.inner(), mine));
    }

    Ok(outputs)
}

/// Extract a Sapling bundle's outputs.
fn extract_sapling_outputs_from_pczt_bundle(
    network: &Network,
    ufvk: &UnifiedFullViewingKey,
    bundle: &sapling::pczt::Bundle,
) -> Result<Vec<Output>, SaplingError<String>> {
    let mut outputs = Vec::new();

    for output in bundle.outputs() {
        output.verify_note_commitment()?;

        let (Some(recipient), Some(value), Some(rseed)) =
            (*output.recipient(), *output.value(), *output.rseed())
        else {
            unreachable!("a verified note has its receiver, value and seed");
        };

        if value.inner() == 0 && output.user_address().is_none() {
            continue;
        }

        if value.inner() > 0 {
            let note =
                sapling::Note::from_parts(recipient, value, sapling::Rseed::AfterZip212(rseed));
            let sent = FullOutput {
                eph_key: output.ephemeral_key().clone(),
                cm: *output.cmu(),
                enc: NoteBytesData(*output.enc_ciphertext()),
            };
            let domain = SaplingDomain::new(Zip212Enforcement::On);
            if !delivers(&domain, &note, &sent, output.ock(), output.out_ciphertext()) {
                return Err(SaplingError::Custom(UNDELIVERABLE.into()));
            }
        }

        let mine = ufvk
            .sapling()
            .is_some_and(|dfvk| dfvk.decrypt_diversifier(&recipient).is_some());

        let address = (!mine)
            .then(|| {
                payee(network, output.user_address(), Receiver::Sapling(recipient))
                    .map_err(SaplingError::Custom)
            })
            .transpose()?;

        outputs.push((address, value.inner(), mine));
    }

    Ok(outputs)
}

/// Every non-padding output, its note checked against its commitment and its
/// ciphertexts, so the value and receiver shown are the ones signed and the
/// receiver can find it.
fn shielded_outputs(
    network: &Network,
    pczt: &Pczt,
    ufvk: &UnifiedFullViewingKey,
) -> Result<[Vec<Output>; 3], String> {
    let mut sapling_outputs = Vec::new();
    let mut orchard_outputs = Vec::new();
    let mut ironwood_outputs = Vec::new();

    Verifier::new(pczt.clone())
        .with_sapling::<String, _>(|bundle| {
            sapling_outputs = extract_sapling_outputs_from_pczt_bundle(network, ufvk, bundle)?;
            Ok(())
        })
        .map_err(to_pczt_error)?
        .with_orchard::<String, _>(|bundle| {
            orchard_outputs =
                extract_orchard_outputs_from_pczt_bundle::<OrchardVersion>(network, ufvk, bundle)?;
            Ok(())
        })
        .map_err(to_pczt_error)?
        .with_ironwood::<String, _>(|bundle| {
            ironwood_outputs =
                extract_orchard_outputs_from_pczt_bundle::<IronwoodVersion>(network, ufvk, bundle)?;
            Ok(())
        })
        .map_err(to_pczt_error)?;

    Ok([sapling_outputs, orchard_outputs, ironwood_outputs])
}

/// Transparent outputs, with the path of each that is ours. One is ours when
/// it names a BIP 44 path, `m/44'/coin'/account'/scope/index`, whose key,
/// derived from the viewing key, is the one its script pays, at a scope
/// Zillions scans: external or internal. Any other path, a custom scope or a
/// hardened step, would put the money where Zillions never looks: shown as a
/// payment. That includes ZIP 320's ephemeral scope (2): Zillions makes no TEX
/// sends, and wallets that do leave such outputs out of the balance.
fn transparent_outputs(
    network: &Network,
    pczt: &Pczt,
    ufvk: &UnifiedFullViewingKey,
) -> Result<Vec<(Output, Option<ChangePath>)>, String> {
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
    let coin = network.network_type().coin_type();
    let ours = |paths: &[([u8; 33], Vec<bip32::ChildNumber>)]| -> Option<(String, ChangePath)> {
        let account = ufvk.p2pkh()?;
        paths.iter().find_map(|(pubkey, path)| {
            let [purpose, coin_type, account_index, scope, index] = path[..] else {
                return None;
            };
            let standard = purpose == bip32::ChildNumber(44 | HARDENED)
                && coin_type == bip32::ChildNumber(coin | HARDENED)
                && account_index.is_hardened()
                && !scope.is_hardened()
                && scope.index() <= 1
                && !index.is_hardened();
            if !standard {
                return None;
            }
            let derived = account
                .derive_address_pubkey(
                    TransparentKeyScope::custom(scope.index())?,
                    NonHardenedChildIndex::from_index(index.index())?,
                )
                .ok()?;
            (derived.serialize() == *pubkey).then(|| {
                let address =
                    Address::Transparent(TransparentAddress::from_pubkey(&derived)).encode(network);
                let path = ChangePath {
                    scope: scope.index(),
                    index: index.index(),
                };
                (address, path)
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
            let path = ours(&paths)
                .filter(|(derived, _)| pays.as_ref() == Some(derived))
                .map(|(_, path)| path);
            ((pays, *o.value(), path.is_some()), path)
        })
        .collect())
}

/// A bundle the transaction drops (no spends or outputs, no actions) must
/// claim no value: its `value_sum` would count in the fee shown but never in
/// the one signed. And no pool can bring in less than nothing.
fn check_values(pczt: &Pczt) -> Result<(), String> {
    let sapling = pczt.sapling();
    if sapling.spends().is_empty() && sapling.outputs().is_empty() && *sapling.value_sum() != 0 {
        return Err("an empty Sapling bundle claims a value".into());
    }
    for (pool, bundle) in [("Orchard", pczt.orchard()), ("Ironwood", pczt.ironwood())] {
        if bundle.actions().is_empty() && bundle.value_sum().0 != 0 {
            return Err(format!("an empty {pool} bundle claims a value"));
        }
    }
    Ok(())
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
    check_values(pczt)?;
    let (transparent_outputs, change_paths): (Vec<Output>, Vec<Option<ChangePath>>) =
        transparent_outputs(network, pczt, ufvk)?
            .into_iter()
            .unzip();
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
    if fee < 0 || sapling_in < 0 || orchard_in < 0 || ironwood_in < 0 {
        return Err("the transaction's values don't add up".into());
    }

    let flows = |list: Vec<Output>| {
        list.into_iter()
            .map(|(address, value, mine)| Flow {
                address,
                value: value.to_string(),
                mine: Some(mine),
                path: None,
            })
            .collect::<Vec<_>>()
    };
    let total = |value: i128| {
        (value > 0)
            .then(|| Flow {
                address: None,
                value: value.to_string(),
                mine: None,
                path: None,
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
                path: None,
            })
            .collect(),
        transparent_outputs: flows(transparent_outputs)
            .into_iter()
            .zip(change_paths)
            .map(|(flow, path)| Flow { path, ..flow })
            .collect(),
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
    prove_with(pczt, sapling, &mut |_| {})
}

const CIRCUIT: OrchardCircuitVersion = OrchardCircuitVersion::PostNu6_3;

// Building each takes seconds and they never change: kept for the instance's life.
static PROVING_KEY: OnceLock<ProvingKey> = OnceLock::new();
static VERIFYING_KEY: OnceLock<VerifyingKey> = OnceLock::new();

/// [`prove`], calling `stage` as each slow step starts; see [`prove_pczt`].
fn prove_with(
    pczt: Pczt,
    sapling: Option<&SaplingParams>,
    stage: &mut dyn FnMut(&'static str),
) -> Result<(String, Vec<u8>), String> {
    let mut prover = Prover::new(pczt);
    if prover.requires_sapling_proofs() {
        stage("sapling-proofs");
        let params = sapling.ok_or("Sapling proofs need the Sapling parameters")?;
        prover = prover
            .create_sapling_proofs(&mut crate::rng(), &params.spend, &params.output)
            .map_err(to_pczt_error)?;
    }
    let halo2 = prover.requires_orchard_proof() || prover.requires_ironwood_proof();
    if halo2 {
        if PROVING_KEY.get().is_none() {
            stage("proving-key");
        }
        let pk = PROVING_KEY.get_or_init(|| ProvingKey::build(CIRCUIT));
        if prover.requires_orchard_proof() {
            stage("orchard-proof");
            prover = prover
                .create_orchard_proof(&mut crate::rng(), pk)
                .map_err(to_pczt_error)?;
        }
        if prover.requires_ironwood_proof() {
            stage("ironwood-proof");
            prover = prover
                .create_ironwood_proof(&mut crate::rng(), pk)
                .map_err(to_pczt_error)?;
        }
    }
    stage("verifying");
    let pczt = SpendFinalizer::new(prover.finish())
        .finalize_spends()
        .map_err(to_pczt_error)?;
    // Only when there's a Halo2 proof to check.
    let vk = halo2.then(|| VERIFYING_KEY.get_or_init(|| VerifyingKey::build(CIRCUIT)));
    let sapling_vks = sapling.map(|p| (p.spend.verifying_key(), p.output.verifying_key()));
    let mut extractor = TransactionExtractor::new(pczt);
    if let Some(vk) = vk {
        extractor = extractor.with_orchard(vk);
    }
    if let Some((spend_vk, output_vk)) = &sapling_vks {
        extractor = extractor.with_sapling(spend_vk, output_vk);
    }
    let tx = extractor
        .extract(&mut crate::rng())
        .map_err(to_pczt_error)?;
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
    seed: Vec<u8>,
    hd_index: u32,
) -> Result<Vec<u8>, JsError> {
    let network = parse_network(network).map_err(|e| JsError::new(&e))?;
    // The wasm copy of the seed is zero-filled when the call ends.
    let signed = sign(&network, parse(pczt)?, &Zeroizing::new(seed), hd_index)
        .map_err(|e| JsError::new(&e))?;
    serialize(signed)
}

/// The second PCZT's signatures and proofs merged into the first: the
/// keychain's copy (every input but the device's still unsigned) plus the
/// device's signed-and-redacted export makes the complete signed PCZT.
#[wasm_bindgen]
pub fn combine_pczts(pczt0: &[u8], pczt1: &[u8]) -> Result<Vec<u8>, JsError> {
    let combined = Combiner::new(vec![parse(pczt0)?, parse(pczt1)?])
        .combine()
        .map_err(|e| JsError::new(&format!("{e:?}")))?;
    serialize(combined)
}

/// A Keystone's firmware version, from the `keystone:fw_version` stamp its
/// signed PCZT responses carry in the global's proprietary map — the raw
/// `[major, minor, build]` bytes as "13.0.8". The device displays major
/// minus 10 ("3.0.8"); firmware that doesn't stamp has no readable version.
#[wasm_bindgen]
pub fn pczt_keystone_fw_version(pczt: &[u8]) -> Result<Option<String>, JsError> {
    let pczt = parse(pczt)?;
    let stamp = pczt.global().proprietary().get("keystone:fw_version");
    Ok(stamp.and_then(|bytes| match bytes.as_slice() {
        [major, minor, build] => Some(format!("{major}.{minor}.{build}")),
        _ => None,
    }))
}

/// What a PCZT moves: `{ network, fee }` and inputs and outputs per pool
/// (`transparent`, `sapling`, `orchard`, `ironwood`), values in zatoshis as
/// strings. Each output says whether it's `mine`, by the signing account's
/// `ufvk`; throws if an output's note or label doesn't match what's signed.
#[wasm_bindgen]
pub fn pczt_summary(network: &str, pczt: &[u8], ufvk: &str) -> Result<JsValue, JsError> {
    let network = parse_network(network).map_err(|e| JsError::new(&e))?;
    let ufvk =
        UnifiedFullViewingKey::decode(&network, ufvk).map_err(|e| JsError::new(&e.to_string()))?;
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
/// `on_stage(name)` is called as each slow step starts: `sapling-proofs`,
/// `proving-key`, `orchard-proof`, `ironwood-proof`, then `verifying`; each
/// is skipped when the transaction doesn't need it.
#[wasm_bindgen]
pub fn prove_pczt(
    pczt: &[u8],
    sapling_spend: Option<Vec<u8>>,
    sapling_output: Option<Vec<u8>>,
    on_stage: Option<js_sys::Function>,
) -> Result<JsValue, JsError> {
    let sapling = match (sapling_spend, sapling_output) {
        (Some(spend), Some(output)) => {
            Some(SaplingParams::read(&spend, &output).map_err(|e| JsError::new(&e))?)
        }
        _ => None,
    };
    let pczt = parse(pczt)?;
    let expiry_height = *pczt.global().expiry_height();
    let mut stage = |name: &'static str| {
        if let Some(f) = &on_stage {
            let _ = f.call1(&JsValue::NULL, &JsValue::from_str(name));
        }
    };
    let (txid, raw) =
        prove_with(pczt, sapling.as_ref(), &mut stage).map_err(|e| JsError::new(&e))?;
    serde_wasm_bindgen::to_value(&Extracted {
        txid,
        raw,
        expiry_height,
    })
    .map_err(|e| JsError::new(&e.to_string()))
}

/// Builds the Halo2 proving and verifying keys now, for this instance's
/// proofs to skip; seconds of work, so call it off the UI thread.
#[wasm_bindgen]
pub fn warm_prover() {
    PROVING_KEY.get_or_init(|| ProvingKey::build(CIRCUIT));
    VERIFYING_KEY.get_or_init(|| VerifyingKey::build(CIRCUIT));
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::build::tests::wallet_and_trees;
    use crate::send::tests::{plan, wallet_ufvk, SEED};
    use pczt::roles::redactor::Redactor;

    const MAIN: Network = Network::MainNetwork;

    fn ufvk() -> UnifiedFullViewingKey {
        UnifiedFullViewingKey::decode(&MAIN, &wallet_ufvk()).unwrap()
    }

    /// 50,000 from a 200,000 Ironwood note to a transparent address.
    fn ironwood_send() -> Pczt {
        let (wallet, trees, _) = wallet_and_trees("ironwood", 200_000);
        let to = crate::transparent_tx::derive(&MAIN, &wallet_ufvk(), "external", 5, 1)
            .unwrap()
            .remove(0);
        let proposal = plan(&wallet, &to, 50_000);
        crate::build::pczt(
            &wallet,
            &ufvk(),
            SeedFingerprint::from_seed(&SEED).unwrap().to_bytes(),
            0,
            &proposal,
            &trees,
            None,
        )
        .unwrap()
    }

    /// The device signs and strips the proof keys; combining restores them
    /// from the keyring's copy, so proving succeeds and the extractor's
    /// every-signature check passes.
    #[test]
    fn combines_a_devices_output_back_with_the_keychains_copy() {
        let unsigned = ironwood_send();
        let signed = sign(&MAIN, unsigned.clone(), &SEED, 0).unwrap();
        let from_device = Redactor::new(signed)
            .redact_ironwood_with(|mut bundle| {
                bundle.redact_actions(|mut action| action.clear_spend_fvk())
            })
            .finish()
            .serialize()
            .unwrap();
        assert!(prove(parse(&from_device).unwrap(), None).is_err());

        let combined =
            parse(&combine_pczts(&unsigned.serialize().unwrap(), &from_device).unwrap()).unwrap();
        prove(combined, None).unwrap();
    }

    /// `pczt` with one byte flipped inside the first copy of `part` on the
    /// wire; panics if the wire doesn't carry `part` as is.
    fn tamper(pczt: &Pczt, part: &[u8]) -> Pczt {
        let mut bytes = pczt.clone().serialize().unwrap();
        let at = bytes
            .windows(part.len())
            .position(|w| w == part)
            .expect("the wire carries the bytes");
        bytes[at + part.len() / 2] ^= 1;
        parse(&bytes).unwrap()
    }

    /// The ciphertexts of `pczt`'s Ironwood outputs that carry value.
    fn ironwood_ciphertexts(pczt: &Pczt) -> Vec<(Vec<u8>, Vec<u8>, bool)> {
        let mut found = Vec::new();
        Verifier::new(pczt.clone())
            .with_ironwood::<Infallible, _>(|bundle| {
                for action in bundle.actions() {
                    let output = action.output();
                    if output.value().is_some_and(|v| v.inner() > 0) {
                        let note = output.encrypted_note();
                        found.push((
                            note.enc_ciphertext.0.to_vec(),
                            note.out_ciphertext.to_vec(),
                            output.ock().is_some(),
                        ));
                    }
                }
                Ok(())
            })
            .unwrap();
        found
    }

    /// A site can't have its change, or a payment, land in a ciphertext no
    /// wallet can read: the approval refuses to describe it and the keyring
    /// to sign it.
    #[test]
    fn refuses_an_output_its_receiver_could_never_find() {
        let honest = ironwood_send();
        summarize(&MAIN, &honest, &ufvk()).unwrap();
        let outputs = ironwood_ciphertexts(&honest);
        assert_eq!(outputs.len(), 1, "the change");
        let (enc, out, has_ock) = &outputs[0];

        let garbled = tamper(&honest, enc);
        let err = summarize(&MAIN, &garbled, &ufvk()).err().unwrap();
        assert!(err.contains("could never find it"), "{err}");
        let err = sign(&MAIN, garbled, &SEED, 0).err().unwrap();
        assert!(err.contains("could never find it"), "{err}");

        // The outgoing ciphertext is checked only when its key is given.
        let garbled = tamper(&honest, out);
        assert_eq!(summarize(&MAIN, &garbled, &ufvk()).is_err(), *has_ock);
    }

    /// `value` as postcard writes an `Option<u64>` holding it.
    fn some_varint(mut value: u64) -> Vec<u8> {
        let mut bytes = vec![1];
        loop {
            let byte = (value & 0x7f) as u8;
            value >>= 7;
            if value == 0 {
                bytes.push(byte);
                return bytes;
            }
            bytes.push(byte | 0x80);
        }
    }

    /// The Ironwood outputs' claimed values, padding included.
    fn ironwood_values(pczt: &Pczt) -> Vec<u64> {
        let mut values = Vec::new();
        Verifier::new(pczt.clone())
            .with_ironwood::<Infallible, _>(|bundle| {
                values.extend(
                    bundle
                        .actions()
                        .iter()
                        .filter_map(|a| a.output().value().map(|v| v.inner())),
                );
                Ok(())
            })
            .unwrap();
        values
    }

    /// A site can't hide an output by claiming it's worth nothing: its claim
    /// is checked against the commitment the chain will hold, padding or not.
    #[test]
    fn refuses_an_output_that_claims_zero_but_commits_to_value() {
        let honest = ironwood_send();
        let change = *ironwood_values(&honest).iter().max().unwrap();
        assert!(change > 0);

        let mut bytes = honest.clone().serialize().unwrap();
        let claim = some_varint(change);
        let at = bytes
            .windows(claim.len())
            .position(|w| w == claim)
            .expect("the wire carries the change's value");
        bytes.splice(at..at + claim.len(), some_varint(0));
        let hidden = parse(&bytes).unwrap();
        assert!(
            !ironwood_values(&hidden).contains(&change),
            "the claim is now 0"
        );

        let err = summarize(&MAIN, &hidden, &ufvk()).err().expect("refused");
        assert!(err.contains("doesn't match its note"), "{err}");
        assert!(sign(&MAIN, hidden, &SEED, 0).is_err());
    }

    /// 50,000 from a 200,000 Ironwood note to our own transparent address at
    /// `scope`/`index`, its output labelled with `path`, as a site may.
    fn send_to_own(scope: u32, index: u32, path: Vec<u32>) -> Pczt {
        let (wallet, trees, _) = wallet_and_trees("ironwood", 200_000);
        let pubkey = ufvk()
            .p2pkh()
            .unwrap()
            .derive_address_pubkey(
                TransparentKeyScope::custom(scope).unwrap(),
                NonHardenedChildIndex::from_index(index).unwrap(),
            )
            .unwrap();
        let to = Address::Transparent(TransparentAddress::from_pubkey(&pubkey)).encode(&MAIN);
        let pczt = crate::build::pczt(
            &wallet,
            &ufvk(),
            SeedFingerprint::from_seed(&SEED).unwrap().to_bytes(),
            0,
            &plan(&wallet, &to, 50_000),
            &trees,
            None,
        )
        .unwrap();
        let derivation = transparent::pczt::Bip32Derivation::parse(
            SeedFingerprint::from_seed(&SEED).unwrap().to_bytes(),
            path,
        )
        .unwrap();
        Updater::new(pczt)
            .update_transparent_with(|mut updater| {
                updater.update_output_with(0, |mut output| {
                    output.set_bip32_derivation(pubkey.serialize(), derivation);
                    Ok(())
                })
            })
            .unwrap()
            .finish()
    }

    fn own_transparent_outputs(pczt: &Pczt) -> Vec<(bool, Option<(u32, u32)>)> {
        let summary = summarize(&MAIN, pczt, &ufvk()).unwrap();
        summary
            .transparent_outputs
            .iter()
            .map(|f| (f.mine == Some(true), f.path.map(|p| (p.scope, p.index))))
            .collect()
    }

    /// Change counts as ours only where Zillions looks: the account's own
    /// BIP 44 path, at the external or internal scope.
    #[test]
    fn calls_transparent_change_ours_only_on_a_standard_path() {
        let h = |n: u32| n | HARDENED;
        let standard = send_to_own(0, 5, vec![h(44), h(133), h(0), 0, 5]);
        assert_eq!(
            own_transparent_outputs(&standard),
            vec![(true, Some((0, 5)))]
        );

        let internal = send_to_own(1, 3, vec![h(44), h(133), h(0), 1, 3]);
        assert_eq!(
            own_transparent_outputs(&internal),
            vec![(true, Some((1, 3)))]
        );

        // A custom scope no wallet scans, though the key is truly the account's.
        let custom = send_to_own(1_234_567, 9, vec![h(44), h(133), h(0), 1_234_567, 9]);
        assert_eq!(own_transparent_outputs(&custom), vec![(false, None)]);

        // ZIP 320's ephemeral scope: Zillions never scans it.
        let ephemeral = send_to_own(2, 0, vec![h(44), h(133), h(0), 2, 0]);
        assert_eq!(own_transparent_outputs(&ephemeral), vec![(false, None)]);

        // A path whose prefix isn't BIP 44, or shorter, names no standard place.
        let odd = send_to_own(0, 5, vec![h(45), h(133), h(0), 0, 5]);
        assert_eq!(own_transparent_outputs(&odd), vec![(false, None)]);
        let short = send_to_own(0, 5, vec![0, 5]);
        assert_eq!(own_transparent_outputs(&short), vec![(false, None)]);
    }

    /// A fee the transaction can't pay means the values were made up.
    #[test]
    fn refuses_values_that_dont_add_up() {
        let honest = ironwood_send();
        summarize(&MAIN, &honest, &ufvk()).unwrap();
        // The payment's 50,000 raised past what was spent.
        let mut bytes = honest.serialize().unwrap();
        let claim = some_varint(50_000)[1..].to_vec();
        let at = bytes
            .windows(claim.len())
            .position(|w| w == claim)
            .expect("the wire carries the payment's value");
        bytes.splice(at..at + claim.len(), some_varint(5_000_000)[1..].to_vec());
        let inflated = parse(&bytes).unwrap();
        let err = summarize(&MAIN, &inflated, &ufvk()).err().expect("refused");
        assert!(err.contains("don't add up"), "{err}");
    }

    #[test]
    fn reads_a_devices_firmware_stamp() {
        let stamped = Updater::new(ironwood_send())
            .update_global_with(|mut global| {
                global.set_proprietary("keystone:fw_version".to_string(), vec![13, 0, 8]);
            })
            .finish();
        assert_eq!(
            pczt_keystone_fw_version(&stamped.serialize().unwrap()).unwrap(),
            Some("13.0.8".to_string())
        );
        // Firmware too old to stamp reads as no version at all.
        assert_eq!(
            pczt_keystone_fw_version(&ironwood_send().serialize().unwrap()).unwrap(),
            None
        );
    }
}
