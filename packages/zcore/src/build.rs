//! A planned send into a PCZT for the keychain to sign: upstream's plan
//! carried out as upstream would, following zcash_client_backend 0.24.0
//! `build_proposed_transaction` and `create_pczt_from_proposal`
//! (`data_api/wallet.rs`), whose storage we don't have. Re-check on every
//! librustzcash bump.
//!
//! Witnesses and anchors come from ziziphus ([`crate::witness`]): the tip's
//! root anchors every pool with tree data, and each spent note's path is
//! assembled offline.

use std::collections::HashMap;
use std::convert::Infallible;

use nonempty::NonEmpty;
use orchard::tree::MerkleHashOrchard;
use pczt::roles::{creator::Creator, io_finalizer::IoFinalizer, updater::Updater};
use pczt::Pczt;
use rand_core::OsRng;
use serde::Deserialize;
use transparent::pczt::Bip32Derivation;
use zcash_client_backend::fees::StandardFeeRule;
use zcash_client_backend::proposal::Proposal;
use zcash_client_backend::wallet::Note;
use zcash_keys::address::Address;
use zcash_keys::keys::UnifiedFullViewingKey;
use zcash_primitives::transaction::builder::{BuildConfig, Builder, BundlePadding};
use zcash_protocol::consensus::{
    BlockHeight, Network, NetworkConstants, NetworkUpgrade, Parameters,
};
use zcash_protocol::memo::MemoBytes;
use zcash_protocol::{PoolType, ShieldedPool};
use zip32::Scope;

use crate::wallet::Wallet;
use crate::witness::{Node, Tip, TipBody, TreeChunkBody};

const HARDENED: u32 = 0x8000_0000;

/// One pool's tree data from ziziphus: the tip snapshot, and the frozen
/// chunks holding the notes to spend, by chunk number. Raw response bodies.
#[derive(Deserialize, Default)]
pub(crate) struct TreeData {
    #[serde(with = "serde_bytes")]
    tip: Vec<u8>,
    #[serde(default)]
    chunks: HashMap<u64, serde_bytes::ByteBuf>,
}

/// Tree data by pool name.
pub(crate) type Trees = HashMap<String, TreeData>;

struct PoolTree {
    tip: TipBody,
    chunks: HashMap<u64, TreeChunkBody>,
}

impl PoolTree {
    fn read(data: &TreeData) -> Result<Self, String> {
        let tip = postcard::from_bytes(&data.tip).map_err(|e| format!("tip: {e}"))?;
        let chunks = data
            .chunks
            .iter()
            .map(|(id, body)| {
                Ok((
                    *id,
                    postcard::from_bytes(body).map_err(|e| format!("chunk {id}: {e}"))?,
                ))
            })
            .collect::<Result<_, String>>()?;
        Ok(PoolTree { tip, chunks })
    }

    fn tip<H: Node>(&self) -> Result<Tip<'_, H>, String> {
        Tip::new(&self.tip)
    }

    fn path<H: Node>(&self, position: u64) -> Result<Vec<H>, String> {
        self.tip::<H>()?
            .path(position, self.chunks.get(&(position >> 14)))
    }
}

fn pool_tree<'a>(
    trees: &'a HashMap<&'static str, PoolTree>,
    pool: &'static str,
) -> Result<&'a PoolTree, String> {
    trees
        .get(pool)
        .ok_or_else(|| format!("no {pool} tree data to spend from"))
}

/// Which pools a step spends from, for choosing the outgoing viewing key.
fn input_sources(step_has: [bool; 3]) -> Option<NonEmpty<PoolType>> {
    let [sapling, orchard, transparent] = step_has;
    let mut sources = vec![];
    if sapling {
        sources.push(PoolType::SAPLING);
    }
    if orchard {
        sources.push(PoolType::ORCHARD);
    }
    if transparent {
        sources.push(PoolType::Transparent);
    }
    NonEmpty::from_vec(sources)
}

/// The shielded pools a step spends from, pays into or keeps change in.
pub(crate) fn touched_pools<N>(
    step: &zcash_client_backend::proposal::Step<N>,
) -> Vec<&'static str> {
    let name = |pool: ShieldedPool| match pool {
        ShieldedPool::Sapling => "sapling",
        ShieldedPool::Orchard => "orchard",
        ShieldedPool::Ironwood => "ironwood",
    };
    let inputs = step
        .shielded_inputs()
        .into_iter()
        .flat_map(|s| s.notes().iter().map(|n| n.note().pool()));
    let outputs = step
        .payment_pools()
        .values()
        .copied()
        .chain(
            step.balance()
                .proposed_change()
                .iter()
                .map(|c| c.output_pool()),
        )
        .filter_map(|p| match p {
            PoolType::Shielded(pool) => Some(pool),
            PoolType::Transparent => None,
        });
    let mut pools: Vec<_> = inputs.chain(outputs).map(name).collect();
    pools.sort_unstable();
    pools.dedup();
    pools
}

fn zip32_path(network: &Network, hd_index: u32) -> Vec<u32> {
    vec![
        32 | HARDENED,
        network.network_type().coin_type() | HARDENED,
        hd_index | HARDENED,
    ]
}

/// The PCZT for a single-step plan. `fingerprint` and `hd_index` name the
/// seed account, so the keychain can find its keys. `change_index` is the
/// unused internal address transparent change goes to; a plan with such
/// change fails without it.
pub(crate) fn pczt<N>(
    wallet: &Wallet,
    ufvk: &UnifiedFullViewingKey,
    fingerprint: [u8; 32],
    hd_index: u32,
    proposal: &Proposal<StandardFeeRule, N>,
    trees: &Trees,
    change_index: Option<u32>,
) -> Result<Pczt, String> {
    let network = wallet.network;
    let [step] = &proposal.steps().iter().collect::<Vec<_>>()[..] else {
        // ponytail: multi-step plans (ZIP 320 TEX payments) need a step's
        // outputs spent by the next; add when TEX sends are.
        return Err("multi-step sends are not supported yet".into());
    };
    let target_height = BlockHeight::from(proposal.min_target_height());

    let trees: HashMap<&'static str, PoolTree> = ["sapling", "orchard", "ironwood"]
        .into_iter()
        .filter_map(|pool| trees.get(pool).map(|data| (pool, data)))
        .map(|(pool, data)| Ok((pool, PoolTree::read(data)?)))
        .collect::<Result<_, String>>()?;
    // Every shielded pool the step spends from or pays into anchors to its
    // tree's real root at ziziphus's tip. The builder wants an anchor for each
    // pool; one with no actions has no bundle, so its anchor goes unused.
    for pool in touched_pools(step) {
        if !trees.contains_key(pool) {
            return Err(format!("no {pool} tree data for this transaction"));
        }
    }
    let orchard_root = |pool| -> Result<orchard::Anchor, String> {
        trees
            .get(pool)
            .map(|t| Ok(orchard::Anchor::from(t.tip::<MerkleHashOrchard>()?.root())))
            .unwrap_or_else(|| Ok(orchard::Anchor::empty_tree()))
    };
    let sapling_anchor = match trees.get("sapling") {
        Some(t) => sapling::Anchor::from(t.tip::<sapling::Node>()?.root()),
        None => sapling::Anchor::empty_tree(),
    };
    let orchard_anchor = orchard_root("orchard")?;
    let ironwood_anchor = orchard_root("ironwood")?;

    let mut builder = Builder::new(
        network,
        target_height,
        BuildConfig::Standard {
            sapling_anchor: Some(sapling_anchor),
            orchard_anchor: Some(orchard_anchor),
            ironwood_anchor: Some(ironwood_anchor),
            orchard_padding: BundlePadding::DEFAULT,
            ironwood_padding: step.ironwood_bundle_padding(),
        },
    );
    // A canonical ZIP 318 crossing takes the rolling expiry every migration
    // in its period shares (upstream refuses to override it).
    let canonical_fee =
        zcash_client_backend::fees::canonical_crossing_fee(&network, target_height).ok();
    let zip318 = zcash_client_backend::data_api::anchor_retention::PoolMigrationParams::new(
        zcash_client_backend::data_api::anchor_retention::AnchorRetentionInterval::ZIP_318,
    );
    if canonical_fee.is_some_and(|fee| step.is_canonical_crossing(&zip318, fee)) {
        builder = builder.with_expiry_height(zcash_protocol::zip318::expiry_height(target_height));
    }

    // Spends.
    let orchard_fvk = ufvk.orchard();
    let mut spends_sapling = false;
    let mut spends_orchard = false;
    for note in step
        .shielded_inputs()
        .map(|s| s.notes().iter().collect::<Vec<_>>())
        .unwrap_or_default()
    {
        let position = u64::from(note.note_commitment_tree_position());
        match note.note() {
            Note::Sapling(sapling_note) => {
                let dfvk = ufvk.sapling().ok_or("viewing key has no Sapling part")?;
                let fvk = match note.spending_key_scope() {
                    Scope::External => dfvk.fvk().clone(),
                    Scope::Internal => dfvk.to_internal_fvk(),
                };
                let path = pool_tree(&trees, "sapling")?.path::<sapling::Node>(position)?;
                let path = sapling::MerklePath::from_parts(path, position.into())
                    .map_err(|_| "bad sapling path")?;
                builder
                    .add_sapling_spend::<Infallible>(fvk, sapling_note.clone(), path)
                    .map_err(|e| format!("{e:?}"))?;
                spends_sapling = true;
            }
            Note::Orchard {
                note: orchard_note,
                pool,
            } => {
                let fvk = orchard_fvk
                    .ok_or("viewing key has no Orchard part")?
                    .clone();
                let name = match pool {
                    orchard::ValuePool::Orchard => "orchard",
                    orchard::ValuePool::Ironwood => "ironwood",
                };
                let path: [MerkleHashOrchard; 32] = pool_tree(&trees, name)?
                    .path::<MerkleHashOrchard>(position)?
                    .try_into()
                    .map_err(|_| "orchard path is not 32 long")?;
                let path = orchard::tree::MerklePath::from_parts(position as u32, path);
                match pool {
                    orchard::ValuePool::Orchard => {
                        builder.add_orchard_spend::<Infallible>(fvk, *orchard_note, path)
                    }
                    orchard::ValuePool::Ironwood => {
                        builder.add_ironwood_spend::<Infallible>(fvk, *orchard_note, path)
                    }
                }
                .map_err(|e| format!("{e:?}"))?;
                spends_orchard = true;
            }
        }
    }

    let account = ufvk.transparent();
    let mut transparent_inputs = Vec::new();
    for input in step.transparent_inputs() {
        let (_, scope, index) = wallet
            .utxos
            .iter()
            .find(|(o, _, _)| o.outpoint() == input.outpoint())
            .ok_or("planned a coin the wallet doesn't hold")?;
        let index = transparent::keys::NonHardenedChildIndex::from_index(*index)
            .ok_or("address index out of range")?;
        let pubkey = account
            .ok_or("viewing key has no transparent part")?
            .derive_address_pubkey(*scope, index)
            .map_err(|e| e.to_string())?;
        builder
            .add_transparent_p2pkh_input(pubkey, input.outpoint().clone(), input.txout().clone())
            .map_err(|e| format!("{e:?}"))?;
        transparent_inputs.push((*scope, index, pubkey));
    }

    // Payments, each to the receiver of the pool upstream chose.
    let sources = input_sources([
        spends_sapling,
        spends_orchard,
        !transparent_inputs.is_empty(),
    ])
    .ok_or("a send must spend something")?;
    let ovk = ufvk.select_ovk(Scope::External, &sources);
    let mut sapling_outputs = Vec::new();
    let mut orchard_outputs = Vec::new();
    let mut ironwood_outputs = Vec::new();
    for (index, pool) in step.payment_pools() {
        let payment = step
            .transaction_request()
            .payments()
            .get(index)
            .ok_or("plan lost a payment")?;
        let amount = payment.amount().ok_or("payment has no amount")?;
        let memo = payment.memo().cloned().unwrap_or_else(MemoBytes::empty);
        let to = payment.recipient_address();
        let address =
            Address::try_from_zcash_address(&network, to.clone()).map_err(|e| e.to_string())?;
        let encoded = to.encode();
        let receiver = |ua: &zcash_keys::address::UnifiedAddress| ua.orchard().copied();
        match (address, pool) {
            (Address::Unified(ua), PoolType::Shielded(ShieldedPool::Ironwood)) => {
                let to = receiver(&ua).ok_or("no Orchard receiver")?;
                builder
                    .add_ironwood_output::<Infallible>(ovk.map(Into::into), to, amount, memo)
                    .map_err(|e| format!("{e:?}"))?;
                ironwood_outputs.push(encoded);
            }
            (Address::Unified(ua), PoolType::Shielded(ShieldedPool::Orchard)) => {
                let to = receiver(&ua).ok_or("no Orchard receiver")?;
                builder
                    .add_orchard_output::<Infallible>(ovk.map(Into::into), to, amount, memo)
                    .map_err(|e| format!("{e:?}"))?;
                orchard_outputs.push(encoded);
            }
            (Address::Unified(ua), PoolType::Shielded(ShieldedPool::Sapling)) => {
                let to = *ua.sapling().ok_or("no Sapling receiver")?;
                builder
                    .add_sapling_output::<Infallible>(ovk.map(Into::into), to, amount, memo)
                    .map_err(|e| format!("{e:?}"))?;
                sapling_outputs.push(encoded);
            }
            (Address::Unified(ua), PoolType::Transparent) => {
                let to = *ua.transparent().ok_or("no transparent receiver")?;
                builder
                    .add_transparent_output(&to, amount)
                    .map_err(|e| format!("{e:?}"))?;
            }
            (Address::Sapling(to), _) => {
                builder
                    .add_sapling_output::<Infallible>(ovk.map(Into::into), to, amount, memo)
                    .map_err(|e| format!("{e:?}"))?;
                sapling_outputs.push(encoded);
            }
            (Address::Transparent(to), _) => {
                builder
                    .add_transparent_output(&to, amount)
                    .map_err(|e| format!("{e:?}"))?;
            }
            (Address::Tex(_), _) => return Err("TEX addresses need a multi-step send".into()),
        }
    }

    // Change, to our own internal addresses (upstream's `OvkPolicy::Sender`
    // gives change no outgoing key).
    for change in step.balance().proposed_change() {
        let memo = change.memo().cloned().unwrap_or_else(MemoBytes::empty);
        let value = change.value();
        match change.output_pool() {
            PoolType::Shielded(ShieldedPool::Sapling) => {
                let (_, to) = ufvk
                    .sapling()
                    .ok_or("viewing key has no Sapling part")?
                    .change_address();
                builder
                    .add_sapling_output::<Infallible>(None, to, value, memo)
                    .map_err(|e| format!("{e:?}"))?;
                sapling_outputs.push(String::new());
            }
            PoolType::Shielded(ShieldedPool::Orchard) => {
                let fvk = orchard_fvk.ok_or("viewing key has no Orchard part")?;
                let to = fvk.address_at(0u32, Scope::Internal);
                if network.is_nu_active(NetworkUpgrade::Nu6_3, target_height) {
                    // Orchard change after NU6.3 must go back to a spent note's
                    // own receiver; the builder matches it.
                    builder.add_orchard_change_output::<Infallible>(
                        fvk.clone(),
                        None,
                        to,
                        value,
                        memo,
                    )
                } else {
                    builder.add_orchard_output::<Infallible>(None, to, value, memo)
                }
                .map_err(|e| format!("{e:?}"))?;
                orchard_outputs.push(String::new());
            }
            PoolType::Shielded(ShieldedPool::Ironwood) => {
                let to = orchard_fvk
                    .ok_or("viewing key has no Orchard part")?
                    .address_at(0u32, Scope::Internal);
                builder
                    .add_ironwood_output::<Infallible>(None, to, value, memo)
                    .map_err(|e| format!("{e:?}"))?;
                ironwood_outputs.push(String::new());
            }
            PoolType::Transparent => {
                let index = change_index
                    .and_then(transparent::keys::NonHardenedChildIndex::from_index)
                    .ok_or("transparent change needs an unused internal address")?;
                let pubkey = account
                    .ok_or("viewing key has no transparent part")?
                    .derive_address_pubkey(transparent::keys::TransparentKeyScope::INTERNAL, index)
                    .map_err(|e| e.to_string())?;
                builder
                    .add_transparent_output(
                        &transparent::address::TransparentAddress::from_pubkey(&pubkey),
                        value,
                    )
                    .map_err(|e| format!("{e:?}"))?;
            }
        }
    }

    let built = builder
        .build_for_pczt(OsRng, &StandardFeeRule::Zip317)
        .map_err(|e| format!("{e:?}"))?;
    let user_addresses =
        |outputs: &[String], index: &dyn Fn(usize) -> Option<usize>| -> HashMap<usize, String> {
            outputs
                .iter()
                .enumerate()
                .filter(|(_, a)| !a.is_empty())
                .filter_map(|(i, a)| index(i).map(|at| (at, a.clone())))
                .collect()
        };
    let orchard_addresses = user_addresses(&orchard_outputs, &|i| {
        built.orchard_meta.output_action_index(i)
    });
    let ironwood_addresses = user_addresses(&ironwood_outputs, &|i| {
        built.ironwood_meta.output_action_index(i)
    });
    let sapling_addresses =
        user_addresses(&sapling_outputs, &|i| built.sapling_meta.output_index(i));

    let pczt = Creator::build_from_parts(built.pczt_parts)
        .ok_or("transaction version has no PCZT form")?;
    let pczt = IoFinalizer::new(pczt)
        .finalize_io()
        .map_err(|e| format!("{e:?}"))?;

    // Where each spend's key sits, so the keychain can find it, and where
    // each payment goes, so it can show it.
    let path = zip32_path(&network, hd_index);
    let orchard_family = |addresses: HashMap<usize, String>| {
        let path = path.clone();
        move |mut updater: orchard::pczt::Updater<'_>| {
            let real_spends: Vec<bool> = updater
                .bundle()
                .actions()
                .iter()
                .map(|a| a.spend().spend_auth_sig().is_none())
                .collect();
            for (index, real) in real_spends.into_iter().enumerate() {
                updater.update_action_with(index, |mut action| {
                    if real {
                        action.set_spend_zip32_derivation(
                            orchard::pczt::Zip32Derivation::parse(fingerprint, path.clone())
                                .expect("a ZIP 32 path parses"),
                        );
                    }
                    if let Some(address) = addresses.get(&index) {
                        action.set_output_user_address(address.clone());
                    }
                    Ok(())
                })?;
            }
            Ok(())
        }
    };
    let coin_type = network.network_type().coin_type();
    Updater::new(pczt)
        .update_orchard_with(orchard_family(orchard_addresses))
        .map_err(|e| format!("{e:?}"))?
        .update_ironwood_with(orchard_family(ironwood_addresses))
        .map_err(|e| format!("{e:?}"))?
        .update_sapling_with(|mut updater| {
            let real_spends: Vec<usize> = updater
                .bundle()
                .spends()
                .iter()
                .enumerate()
                .filter_map(|(i, s)| s.proof_generation_key().is_none().then_some(i))
                .collect();
            for index in real_spends {
                updater.update_spend_with(index, |mut spend| {
                    spend.set_zip32_derivation(
                        sapling::pczt::Zip32Derivation::parse(fingerprint, path.clone())
                            .expect("a ZIP 32 path parses"),
                    );
                    Ok(())
                })?;
            }
            for (index, address) in &sapling_addresses {
                updater.update_output_with(*index, |mut output| {
                    output.set_user_address(address.clone());
                    Ok(())
                })?;
            }
            Ok(())
        })
        .map_err(|e| format!("{e:?}"))?
        .update_transparent_with(|mut updater| {
            for (i, (scope, index, pubkey)) in transparent_inputs.iter().enumerate() {
                let path = vec![
                    44 | HARDENED,
                    coin_type | HARDENED,
                    hd_index | HARDENED,
                    bip32::ChildNumber::from(*scope).into(),
                    index.index(),
                ];
                let derivation =
                    Bip32Derivation::parse(fingerprint, path).expect("a BIP-44 path parses");
                updater.update_input_with(i, |mut input| {
                    input.set_bip32_derivation(pubkey.serialize(), derivation);
                    Ok(())
                })?;
            }
            Ok(())
        })
        .map(Updater::finish)
        .map_err(|e| format!("{e:?}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::send::tests::{orchard_family_note, wallet_ufvk, SEED, TIP};
    use crate::wallet::WalletData;
    use orchard::note::ExtractedNoteCommitment;

    /// A wallet with one note of `pool` (`"orchard"` or `"ironwood"`) at
    /// `position` 3 of a five-leaf tree, and that tree as ziziphus serves it.
    pub(crate) fn wallet_and_trees(pool: &str, value: u64) -> (Wallet, Trees, orchard::Anchor) {
        let data = orchard_family_note(pool, zip32::Scope::External, value, TIP - 100, 3);
        let version = if pool == "orchard" {
            orchard::NoteVersion::V2
        } else {
            orchard::NoteVersion::V3
        };
        let note = crate::notes::decode_orchard(&data.note_hex(), version).unwrap();
        let ours = MerkleHashOrchard::from_cmx(&ExtractedNoteCommitment::from(note.commitment()));
        let leaves: Vec<_> = (0..5u64)
            .map(|i| {
                if i == 3 {
                    ours
                } else {
                    crate::witness::tests::leaf(i)
                }
            })
            .collect();
        let tip = crate::witness::tests::snapshot(&leaves);
        let anchor = orchard::Anchor::from(Tip::<MerkleHashOrchard>::new(&tip).unwrap().root());
        // Change and payments may land in Ironwood whatever the note's pool.
        let empty = crate::witness::tests::snapshot::<MerkleHashOrchard>(&[]);
        let mut trees = Trees::from([(
            "ironwood".to_string(),
            TreeData {
                tip: postcard::to_allocvec(&empty).unwrap(),
                chunks: HashMap::new(),
            },
        )]);
        trees.insert(
            pool.to_string(),
            TreeData {
                tip: postcard::to_allocvec(&tip).unwrap(),
                chunks: HashMap::new(),
            },
        );
        let wallet = Wallet::new(
            Network::MainNetwork,
            &WalletData {
                tip: TIP,
                notes: vec![data],
                utxos: vec![],
            },
        )
        .unwrap();
        (wallet, trees, anchor)
    }

    /// The Sapling parameters, from the repo's params package.
    fn sapling_params() -> crate::roles::SaplingParams {
        let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/../sapling-params");
        let spend = std::fs::read(format!("{dir}/sapling-spend.params")).unwrap();
        let output = std::fs::read(format!("{dir}/sapling-output.params")).unwrap();
        crate::roles::SaplingParams::read(&spend, &output).unwrap()
    }

    /// Plan → PCZT → signature and proof generation key → Groth16 proofs → a
    /// transaction whose Sapling proofs and signatures the extractor verifies.
    /// A change note (`internal`) needs the internal proof generation key.
    fn sapling_send(internal: bool) {
        use zcash_keys::keys::UnifiedSpendingKey;
        let network = Network::MainNetwork;
        let usk = UnifiedSpendingKey::from_seed(&network, &SEED, zip32::AccountId::ZERO).unwrap();
        let key = if internal {
            usk.sapling().derive_internal()
        } else {
            usk.sapling().clone()
        };
        let (_, ours) = key.default_address();
        let note = sapling::Note::from_parts(
            ours,
            sapling::value::NoteValue::from_raw(200_000),
            sapling::Rseed::AfterZip212([5u8; 32]),
        );
        let leaves: Vec<sapling::Node> = (0..5u8)
            .map(|i| {
                let other = sapling::Note::from_parts(
                    ours,
                    sapling::value::NoteValue::from_raw(u64::from(i)),
                    sapling::Rseed::AfterZip212([i; 32]),
                );
                sapling::Node::from_cmu(&if i == 2 { note.cmu() } else { other.cmu() })
            })
            .collect();
        let tip = crate::witness::tests::snapshot(&leaves);
        let trees = Trees::from([(
            "sapling".to_string(),
            TreeData {
                tip: postcard::to_allocvec(&tip).unwrap(),
                chunks: HashMap::new(),
            },
        )]);
        let mut data = crate::wallet::NoteData::for_tests(
            "sapling",
            crate::notes::encode_sapling(&note),
            2,
            TIP - 100,
        );
        if internal {
            data.set_internal();
        }
        let wallet = Wallet::new(
            network,
            &WalletData {
                tip: TIP,
                notes: vec![data],
                utxos: vec![],
            },
        )
        .unwrap();

        let ufvk = UnifiedFullViewingKey::decode(&network, &wallet_ufvk()).unwrap();
        let fingerprint = zip32::fingerprint::SeedFingerprint::from_seed(&SEED)
            .unwrap()
            .to_bytes();
        let to = crate::transparent_tx::derive(&network, &wallet_ufvk(), "external", 5, 1)
            .unwrap()
            .remove(0);
        let proposal = crate::send::tests::plan(&wallet, &to, 50_000);
        let unsigned = pczt(&wallet, &ufvk, fingerprint, 0, &proposal, &trees, None).unwrap();

        let signed = crate::roles::sign(&network, unsigned, &SEED, 0).unwrap();
        assert!(
            crate::roles::prove(signed.clone(), None).is_err(),
            "Sapling proofs need the parameters"
        );
        let (_, raw) = crate::roles::prove(signed, Some(&sapling_params())).unwrap();
        let tx = zcash_primitives::transaction::Transaction::read(
            &raw[..],
            zcash_protocol::consensus::BranchId::Nu6_3,
        )
        .unwrap();
        assert_eq!(tx.sapling_bundle().unwrap().shielded_spends().len(), 1);
        assert_eq!(
            u64::from(tx.transparent_bundle().unwrap().vout[0].value()),
            50_000
        );
    }

    /// An Orchard note after NU6.3: its bundle may only return value to the
    /// note's own address, so upstream's plan and our build must route the
    /// payment and change so the restricted bundle still proves and verifies.
    #[test]
    fn sends_from_orchard_after_nu6_3_end_to_end() {
        let (wallet, trees, _) = wallet_and_trees("orchard", 200_000);
        let ufvk = UnifiedFullViewingKey::decode(&Network::MainNetwork, &wallet_ufvk()).unwrap();
        let fingerprint = zip32::fingerprint::SeedFingerprint::from_seed(&SEED)
            .unwrap()
            .to_bytes();
        let to =
            crate::transparent_tx::derive(&Network::MainNetwork, &wallet_ufvk(), "external", 5, 1)
                .unwrap()
                .remove(0);
        let proposal = crate::send::tests::plan(&wallet, &to, 50_000);
        let unsigned = pczt(&wallet, &ufvk, fingerprint, 0, &proposal, &trees, None).unwrap();
        let signed = crate::roles::sign(&Network::MainNetwork, unsigned, &SEED, 0).unwrap();
        let (_, raw) = crate::roles::prove(signed, None).unwrap();
        let tx = zcash_primitives::transaction::Transaction::read(
            &raw[..],
            zcash_protocol::consensus::BranchId::Nu6_3,
        )
        .unwrap();
        let orchard = tx.orchard_bundle().expect("the note is spent from Orchard");
        // Post-NU6.3 Orchard bundles carry the cross-address restriction.
        assert!(!orchard.flags().cross_address_enabled());
        assert_eq!(
            u64::from(tx.transparent_bundle().unwrap().vout[0].value()),
            50_000
        );
    }

    #[test]
    fn sends_from_sapling_end_to_end() {
        sapling_send(false);
    }

    #[test]
    fn sends_sapling_change_end_to_end() {
        sapling_send(true);
    }

    /// Upstream's shielding plan → PCZT anchored to ziziphus's Ironwood root →
    /// transparent signature → proof → a verified transaction.
    /// A transparent send's change goes back to the internal address it's
    /// given, with no shielded part to prove.
    #[test]
    fn sends_transparent_change_end_to_end() {
        let network = Network::MainNetwork;
        let ufvk_str = wallet_ufvk();
        let derive = |scope, index| {
            crate::transparent_tx::derive(&network, &ufvk_str, scope, index, 1)
                .unwrap()
                .remove(0)
        };
        let utxo = crate::wallet::UtxoData::for_tests(&derive("external", 0), 200_000, 1, TIP - 50);
        let wallet = Wallet::new(
            network,
            &WalletData {
                tip: TIP,
                notes: vec![],
                utxos: vec![utxo],
            },
        )
        .unwrap();
        let ufvk = UnifiedFullViewingKey::decode(&network, &ufvk_str).unwrap();
        let fingerprint = zip32::fingerprint::SeedFingerprint::from_seed(&SEED)
            .unwrap()
            .to_bytes();
        let proposal =
            crate::send::tests::plan_from_transparent(&wallet, &derive("external", 9), 50_000);

        let pczt_with = |index| {
            pczt(
                &wallet,
                &ufvk,
                fingerprint,
                0,
                &proposal,
                &Trees::new(),
                index,
            )
        };
        assert!(pczt_with(None).is_err(), "needs a change address");
        let unsigned = pczt_with(Some(3)).unwrap();
        let summary = serde_json::to_value(crate::roles::summarize(&network, &unsigned)).unwrap();
        let change = derive("internal", 3);
        assert_eq!(
            summary["transparentOutputs"],
            serde_json::json!([
                { "address": derive("external", 9), "value": "50000" },
                { "address": change, "value": "140000" },
            ])
        );

        let signed = crate::roles::sign(&network, unsigned, &SEED, 0).unwrap();
        let (_, raw) = crate::roles::prove(signed, None).unwrap();
        let tx = zcash_primitives::transaction::Transaction::read(
            &raw[..],
            zcash_protocol::consensus::BranchId::Nu6_3,
        )
        .unwrap();
        assert!(tx.orchard_bundle().is_none() && tx.ironwood_bundle().is_none());
        assert_eq!(tx.transparent_bundle().unwrap().vout.len(), 2);
    }

    #[test]
    fn shields_end_to_end() {
        let network = Network::MainNetwork;
        let ours = crate::transparent_tx::derive(&network, &wallet_ufvk(), "external", 0, 1)
            .unwrap()
            .remove(0);
        let utxo = crate::wallet::UtxoData::for_tests(&ours, 100_000, 1, TIP - 50);
        let wallet = Wallet::new(
            network,
            &WalletData {
                tip: TIP,
                notes: vec![],
                utxos: vec![utxo],
            },
        )
        .unwrap();
        // Ironwood already holds five notes, none of them ours.
        let leaves: Vec<_> = (0..5u64).map(crate::witness::tests::leaf).collect();
        let tip = crate::witness::tests::snapshot(&leaves);
        let anchor = orchard::Anchor::from(Tip::<MerkleHashOrchard>::new(&tip).unwrap().root());
        let trees = Trees::from([(
            "ironwood".to_string(),
            TreeData {
                tip: postcard::to_allocvec(&tip).unwrap(),
                chunks: HashMap::new(),
            },
        )]);
        let ufvk = UnifiedFullViewingKey::decode(&network, &wallet_ufvk()).unwrap();
        let fingerprint = zip32::fingerprint::SeedFingerprint::from_seed(&SEED)
            .unwrap()
            .to_bytes();

        let proposal = crate::send::tests::plan_shield(&wallet);
        assert!(
            pczt(
                &wallet,
                &ufvk,
                fingerprint,
                0,
                &proposal,
                &Trees::new(),
                None
            )
            .is_err(),
            "needs Ironwood's tree"
        );
        let unsigned = pczt(&wallet, &ufvk, fingerprint, 0, &proposal, &trees, None).unwrap();
        assert_eq!(unsigned.ironwood().anchor(), &Some(anchor.to_bytes()));

        // One coin into two padded Ironwood actions: 3 × 5,000.
        let summary = serde_json::to_value(crate::roles::summarize(&network, &unsigned)).unwrap();
        assert_eq!(
            (
                summary["fee"].as_str(),
                summary["orchardOutputs"][0]["value"].as_str()
            ),
            (Some("15000"), Some("85000"))
        );
        assert_eq!(
            summary["transparentInputs"][0]["address"].as_str(),
            Some(ours.as_str())
        );

        let signed = crate::roles::sign(&network, unsigned, &SEED, 0).unwrap();
        let (_, raw) = crate::roles::prove(signed, None).unwrap();
        let tx = zcash_primitives::transaction::Transaction::read(
            &raw[..],
            zcash_protocol::consensus::BranchId::Nu6_3,
        )
        .unwrap();
        assert!(tx.ironwood_bundle().is_some());
        assert_eq!(tx.transparent_bundle().unwrap().vin.len(), 1);
    }

    #[test]
    fn builds_a_pczt_spending_an_ironwood_note() {
        let (wallet, trees, anchor) = wallet_and_trees("ironwood", 200_000);
        let ufvk = UnifiedFullViewingKey::decode(&Network::MainNetwork, &wallet_ufvk()).unwrap();
        let fingerprint = zip32::fingerprint::SeedFingerprint::from_seed(&SEED)
            .unwrap()
            .to_bytes();
        let to =
            crate::transparent_tx::derive(&Network::MainNetwork, &wallet_ufvk(), "external", 5, 1)
                .unwrap()
                .remove(0);
        let proposal = crate::send::tests::plan(&wallet, &to, 50_000);

        let pczt = pczt(&wallet, &ufvk, fingerprint, 0, &proposal, &trees, None).unwrap();
        // Anchored at ziziphus's root; the payment is the one transparent output.
        assert_eq!(pczt.ironwood().anchor(), &Some(anchor.to_bytes()));
        let outputs = pczt.transparent().outputs();
        assert_eq!((outputs.len(), *outputs[0].value()), (1, 50_000));
        assert_eq!(outputs[0].user_address().as_deref(), None);
    }

    /// Plan → PCZT → keychain signature → proof → a transaction whose
    /// Ironwood proof and signatures the extractor verifies.
    #[test]
    fn sends_from_ironwood_end_to_end() {
        let (wallet, trees, _) = wallet_and_trees("ironwood", 200_000);
        let ufvk = UnifiedFullViewingKey::decode(&Network::MainNetwork, &wallet_ufvk()).unwrap();
        let fingerprint = zip32::fingerprint::SeedFingerprint::from_seed(&SEED)
            .unwrap()
            .to_bytes();
        let to =
            crate::transparent_tx::derive(&Network::MainNetwork, &wallet_ufvk(), "external", 5, 1)
                .unwrap()
                .remove(0);
        let proposal = crate::send::tests::plan(&wallet, &to, 50_000);
        let unsigned = pczt(&wallet, &ufvk, fingerprint, 0, &proposal, &trees, None).unwrap();

        assert!(
            crate::roles::sign(&Network::MainNetwork, unsigned.clone(), &[8u8; 32], 0).is_err()
        );
        // What the keychain shows: 200,000 in from Ironwood, 50,000 out, the
        // rest as change, and a fee that balances it.
        let summary =
            serde_json::to_value(crate::roles::summarize(&Network::MainNetwork, &unsigned))
                .unwrap();
        assert_eq!(summary["orchardInputs"][0]["value"], "200000");
        let fee: u64 = summary["fee"].as_str().unwrap().parse().unwrap();
        let change: u64 = summary["orchardOutputs"]
            .as_array()
            .unwrap()
            .iter()
            .map(|o| o["value"].as_str().unwrap().parse::<u64>().unwrap())
            .sum();
        assert_eq!(50_000 + change + fee, 200_000);

        let signed = crate::roles::sign(&Network::MainNetwork, unsigned, &SEED, 0).unwrap();
        let (_, raw) = crate::roles::prove(signed, None).unwrap();
        let tx = zcash_primitives::transaction::Transaction::read(
            &raw[..],
            zcash_protocol::consensus::BranchId::Nu6_3,
        )
        .unwrap();
        assert!(tx.ironwood_bundle().is_some());
        assert_eq!(
            u64::from(tx.transparent_bundle().unwrap().vout[0].value()),
            50_000
        );
    }
}
