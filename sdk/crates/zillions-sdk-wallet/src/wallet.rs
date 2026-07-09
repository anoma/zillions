use std::collections::{BTreeMap, HashSet};
use std::num::NonZeroUsize;

use bip0039::{English, Mnemonic};
use nonempty::NonEmpty;
use secrecy::{ExposeSecret, SecretVec, Zeroize};
use tonic::{
    client::GrpcService,
    codegen::{Body, Bytes, StdError},
};

use crate::error::Error;
use crate::BlockRange;
use zillions_sdk_common::Network;

use pczt::roles::combiner::Combiner;
use pczt::roles::prover::Prover;

use pczt::Pczt;
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::fmt::Debug;
use std::hash::Hash;
use std::sync::Arc;
use subtle::ConditionallySelectable;
use tokio::sync::RwLock;
use zcash_address::ZcashAddress;
use zcash_client_backend::data_api::wallet::TargetHeight;
use zcash_client_backend::data_api::wallet::{
    create_pczt_from_proposal, create_proposed_transactions, decrypt_and_store_transaction,
    extract_and_store_transaction_from_pczt, input_selection::GreedyInputSelector,
    propose_shielding, propose_transfer, ConfirmationsPolicy, SpendingKeys,
};
use zcash_client_backend::data_api::{
    Account, AccountBirthday, AccountPurpose, InputSource, TransactionDataRequest,
    TransactionStatus, TransparentOutputFilter, WalletRead, WalletSummary, WalletWrite,
};
use zcash_client_backend::data_api::{WalletCommitmentTrees, Zip32Derivation};
use zcash_client_backend::fees::standard::MultiOutputChangeStrategy;
use zcash_client_backend::fees::{
    ChangeValue, DustOutputPolicy, SplitPolicy, StandardFeeRule, TransactionBalance,
};
use zcash_client_backend::proposal::Proposal;
use zcash_client_backend::proto::service::{
    self, compact_tx_streamer_client::CompactTxStreamerClient,
};
use zcash_client_backend::wallet::{OvkPolicy, WalletTransparentOutput};
use zcash_client_backend::zip321::{Payment, TransactionRequest};
use zcash_client_memory::{MemBlockCache, MemoryWalletDb};
use zcash_keys::address::Address;
use zcash_keys::keys::{UnifiedFullViewingKey, UnifiedSpendingKey};
use zcash_primitives::transaction::fees::transparent as transparent_fees;
use zcash_primitives::transaction::fees::zip317::P2PKH_STANDARD_OUTPUT_SIZE;
use zcash_primitives::transaction::fees::FeeRule;
use zcash_primitives::transaction::TxId;
use zcash_protocol::{PoolType, ShieldedProtocol};

use futures_util::TryStreamExt;
use orchard::tree::MerkleHashOrchard;
use transparent::address::Script;
use transparent::bundle::{OutPoint, TxOut};
use zcash_client_backend::data_api::chain::{
    error::Error as ChainError, scan_cached_blocks, BlockCache, CommitmentTreeRoot,
};
use zcash_keys::encoding::AddressCodec;
use zcash_primitives::merkle_tree::HashSer;
use zcash_script::script;

use zcash_protocol::consensus::{BlockHeight, BranchId, Parameters};
use zcash_protocol::value::Zatoshis;
use zip32;
use zip32::fingerprint::SeedFingerprint;

/// Rewind margin applied below the height where a chain reorg is detected.
const REORG_REWIND_MARGIN: u32 = 10;

/// constant that signals what's the minimum transparent balance for proposing a
/// shielding transaction
const SHIELDING_THRESHOLD: Zatoshis = Zatoshis::const_from_u64(100000);

/// # A Zcash wallet
///
/// A wallet is a set of accounts that can be synchronized together with the blockchain.
/// Once synchronized these can be used to build transactions that spend notes
///
/// ## Adding Accounts
///
/// TODO
///
/// ## Synchronizing
///
/// A wallet can be syncced with the blockchain by feeding it blocks. The accounts currently managed by the wallet will be used to
/// scan the blocks and retrieve relevant transactions. The wallet itself keeps track of blocks it has seen and can be queried for
/// the suggest range of blocks that should be retrieved for it to process next.
///
/// ## Building Transactions
///
/// TODO
///
pub struct Wallet<W, T> {
    /// Internal database used to maintain wallet data (e.g. accounts, transactions, cached blocks)
    pub(crate) db: Arc<RwLock<W>>,
    // gRPC client used to connect to a lightwalletd instance for network data
    pub(crate) client: CompactTxStreamerClient<T>,
    pub(crate) network: Network,
    pub(crate) min_confirmations: ConfirmationsPolicy,
    /// Note management: the number of notes to maintain in the wallet
    pub(crate) target_note_count: usize,
    /// Note management: the minimum allowed value for split change amounts
    pub(crate) min_split_output_value: u64,
}

impl<W, T: Clone> Clone for Wallet<W, T> {
    fn clone(&self) -> Self {
        Self {
            db: self.db.clone(),
            client: self.client.clone(),
            network: self.network,
            min_confirmations: self.min_confirmations,
            target_note_count: self.target_note_count,
            min_split_output_value: self.min_split_output_value,
        }
    }
}

impl<P: Parameters, T> Wallet<MemoryWalletDb<P>, T> {
    // Encodes the MemoryWallet into protobuf bytes
    pub async fn db_to_bytes(&self) -> Result<Vec<u8>, Error> {
        let mut memory_wallet_bytes = Vec::new();
        self.db.read().await.encode(&mut memory_wallet_bytes)?;
        Ok(memory_wallet_bytes)
    }
}

impl<W, T, AccountId, NoteRef> Wallet<W, T>
where
    W: WalletRead<AccountId = AccountId>
        + WalletWrite
        + InputSource<
            AccountId = <W as WalletRead>::AccountId,
            Error = <W as WalletRead>::Error,
            NoteRef = NoteRef,
        > + WalletCommitmentTrees,

    AccountId: Copy
        + Debug
        + Eq
        + Hash
        + Default
        + Send
        + Sync
        + ConditionallySelectable
        + Serialize
        + DeserializeOwned
        + 'static,
    NoteRef: Copy + Eq + Ord + Debug,
    Error: From<<W as WalletRead>::Error>,

    <W as WalletRead>::Error: std::error::Error + Send + Sync + 'static,
    <W as WalletCommitmentTrees>::Error: std::error::Error + Send + Sync + 'static,

    // GRPC connection Trait Bounds
    T: GrpcService<tonic::body::Body> + Clone,
    T::Error: Into<StdError>,
    T::ResponseBody: Body<Data = Bytes> + std::marker::Send + 'static,
    <T::ResponseBody as Body>::Error: Into<StdError> + std::marker::Send,
{
    /// Create a new instance of a Zcash wallet for a given network
    pub fn new(
        db: W,
        client: T,
        network: Network,
        min_confirmations: ConfirmationsPolicy,
    ) -> Result<Self, Error> {
        Ok(Wallet {
            db: Arc::new(RwLock::new(db)),
            client: CompactTxStreamerClient::new(client),
            network,
            min_confirmations,
            target_note_count: 4,
            min_split_output_value: 10000000,
        })
    }

    /// Add a new account to the wallet
    ///
    /// # Arguments
    /// seed_phrase - mnemonic phrase to initialise the wallet
    /// account_id - The HD derivation index to use. Can be any integer
    /// birthday_height - The block height at which the account was created, optionally None and the current height is used
    ///
    pub async fn create_account(
        &self,
        account_name: &str,
        seed_phrase: &str,
        account_hd_index: u32,
        birthday_height: Option<u32>,
        key_source: Option<&str>,
    ) -> Result<AccountId, Error> {
        // decode the mnemonic and derive the first account
        let (usk, seed_fp) = usk_from_seed_str(seed_phrase, account_hd_index, &self.network)?;
        let ufvk = usk.to_unified_full_viewing_key();

        let derivation =
            Zip32Derivation::new(seed_fp, zip32::AccountId::try_from(account_hd_index)?);

        tracing::info!("Key successfully decoded. Importing into wallet");

        self.import_account_ufvk(
            account_name,
            &ufvk,
            birthday_height,
            AccountPurpose::Spending {
                derivation: Some(derivation),
            },
            key_source,
        )
        .await
    }

    pub async fn import_ufvk(
        &self,
        account_name: &str,
        ufvk: &UnifiedFullViewingKey,
        purpose: AccountPurpose,
        birthday_height: Option<u32>,
        key_source: Option<&str>,
    ) -> Result<AccountId, Error> {
        self.import_account_ufvk(account_name, ufvk, birthday_height, purpose, key_source)
            .await
    }

    /// Helper method for importing an account directly from a Ufvk or from seed.
    async fn import_account_ufvk(
        &self,
        account_name: &str,
        ufvk: &UnifiedFullViewingKey,
        birthday_height: Option<u32>,
        purpose: AccountPurpose,
        key_source: Option<&str>,
    ) -> Result<AccountId, Error> {
        tracing::info!("Importing account");
        let mut client = self.client.clone();
        let birthday = match birthday_height {
            Some(height) => height,
            None => {
                let chain_tip: u32 = client
                    .get_latest_block(service::ChainSpec::default())
                    .await?
                    .into_inner()
                    .height
                    .try_into()
                    .expect("block heights must fit into u32");
                chain_tip - 100
            }
        };
        // Construct an `AccountBirthday` for the account's birthday.
        let birthday = {
            // Fetch the tree state corresponding to the last block prior to the wallet's
            // birthday height. NOTE: THIS APPROACH LEAKS THE BIRTHDAY TO THE SERVER!
            let request = service::BlockId {
                height: (birthday - 1).into(),
                ..Default::default()
            };
            let treestate = client.get_tree_state(request).await?.into_inner();
            AccountBirthday::from_treestate(treestate, None).map_err(|_| Error::Birthday)?
        };

        Ok(self
            .db
            .write()
            .await
            .import_account_ufvk(account_name, ufvk, &birthday, purpose, key_source)?
            .id())
    }

    pub async fn suggest_scan_ranges(&self) -> Result<Vec<BlockRange>, Error> {
        Ok(self.db.read().await.suggest_scan_ranges().map(|ranges| {
            ranges
                .iter()
                .map(|scan_range| {
                    BlockRange(
                        scan_range.block_range().start.into(),
                        scan_range.block_range().end.into(),
                    )
                })
                .collect()
        })?)
    }

    /// Sync stage: fetch the note commitment subtree roots from lightwalletd
    /// and store them in the wallet. Call once before the first scan of a
    /// session; scanning only needs the shards containing the wallet's notes.
    pub async fn sync_update_subtree_roots(&self) -> Result<(), Error> {
        let mut client = self.client.clone();

        let mut request = service::GetSubtreeRootsArg::default();
        request.set_shielded_protocol(service::ShieldedProtocol::Sapling);
        let sapling_roots: Vec<CommitmentTreeRoot<sapling::Node>> = client
            .get_subtree_roots(request)
            .await?
            .into_inner()
            .and_then(|root| async move {
                let root_hash = sapling::Node::read(&root.root_hash[..])?;
                Ok(CommitmentTreeRoot::from_parts(
                    BlockHeight::from_u32(root.completing_block_height as u32),
                    root_hash,
                ))
            })
            .try_collect()
            .await?;

        let mut request = service::GetSubtreeRootsArg::default();
        request.set_shielded_protocol(service::ShieldedProtocol::Orchard);
        let orchard_roots: Vec<CommitmentTreeRoot<MerkleHashOrchard>> = client
            .get_subtree_roots(request)
            .await?
            .into_inner()
            .and_then(|root| async move {
                let root_hash = MerkleHashOrchard::read(&root.root_hash[..])?;
                Ok(CommitmentTreeRoot::from_parts(
                    BlockHeight::from_u32(root.completing_block_height as u32),
                    root_hash,
                ))
            })
            .try_collect()
            .await?;

        let mut db = self.db.write().await;
        db.put_sapling_subtree_roots(0, &sapling_roots)
            .map_err(|e| Error::Sync(e.to_string()))?;
        db.put_orchard_subtree_roots(0, &orchard_roots)
            .map_err(|e| Error::Sync(e.to_string()))?;
        Ok(())
    }

    /// Sync stage: fetch the current chain tip from lightwalletd and notify
    /// the wallet, which updates its scan queue. Returns the tip height.
    pub async fn sync_update_chain_tip(&self) -> Result<u32, Error> {
        let mut client = self.client.clone();
        let tip_height: u32 = client
            .get_latest_block(service::ChainSpec::default())
            .await?
            .into_inner()
            .height
            .try_into()
            .map_err(|_| Error::Generic("chain tip height out of range".to_string()))?;

        self.db
            .write()
            .await
            .update_chain_tip(BlockHeight::from_u32(tip_height))?;
        Ok(tip_height)
    }

    /// Sync stage: refresh the wallet's view of transparent UTXOs for all
    /// accounts. Run before shielded scanning so UTXOs between the last
    /// scanned height and the chain tip are discovered.
    ///
    /// Receivers are derived within a BIP44 gap-limit window, and a
    /// discovered UTXO can widen that window, so each account is re-queried
    /// with the newly derived addresses until none appear.
    pub async fn sync_refresh_utxos(&self) -> Result<(), Error> {
        let account_ids = self.db.read().await.get_account_ids()?;
        for account_id in account_ids {
            let start_height = self.db.read().await.utxo_query_height(account_id)?;
            let mut queried: HashSet<String> = HashSet::new();
            loop {
                let addresses: Vec<String> = self
                    .db
                    .read()
                    .await
                    .get_transparent_receivers(account_id, true, true)?
                    .into_keys()
                    .map(|addr| addr.encode(&self.network))
                    .filter(|addr| !queried.contains(addr))
                    .collect();
                if addresses.is_empty() {
                    break;
                }
                queried.extend(addresses.iter().cloned());

                let mut client = self.client.clone();
                let utxos = client
                    .get_address_utxos_stream(service::GetAddressUtxosArg {
                        addresses,
                        start_height: start_height.into(),
                        max_entries: 0,
                    })
                    .await?
                    .into_inner()
                    .try_collect::<Vec<_>>()
                    .await?;

                let mut db = self.db.write().await;
                for reply in utxos {
                    let invalid =
                        |what: &str| Error::Generic(format!("invalid {what} from server"));
                    let output = WalletTransparentOutput::from_parts(
                        OutPoint::new(
                            reply.txid[..].try_into().map_err(|_| invalid("txid"))?,
                            reply.index.try_into().map_err(|_| invalid("utxo index"))?,
                        ),
                        TxOut::new(
                            Zatoshis::from_nonnegative_i64(reply.value_zat)
                                .map_err(|_| invalid("utxo value"))?,
                            Script(script::Code(reply.script)),
                        ),
                        Some(
                            BlockHeight::try_from(reply.height)
                                .map_err(|_| invalid("utxo height"))?,
                        ),
                        Some(account_id),
                        None,
                        None,
                    )
                    .ok_or_else(|| invalid("utxo script"))?;
                    db.put_received_transparent_utxo(&output)?;
                }
            }
        }
        Ok(())
    }

    /// Sync stage: service the wallet's transaction data requests.
    ///
    /// Compact-block scanning only yields incoming notes and nullifier
    /// spends, so this stage completes the picture: it downloads the full
    /// data of scanner-discovered transactions (recovering sent outputs,
    /// recipient addresses, memos and fees via trial decryption with the
    /// wallet's viewing keys) and queries lightwalletd for the history of
    /// each transparent receiver, which compact blocks do not carry at all.
    ///
    /// Servicing a request can surface new ones (e.g. a discovered output
    /// widens the transparent gap-limit window), so requests are re-derived
    /// until they stabilize, up to a bounded number of rounds.
    pub async fn sync_enhance_transactions(&self) -> Result<(), Error> {
        const MAX_ROUNDS: usize = 10;

        let mut previous: Option<Vec<TransactionDataRequest>> = None;
        for round in 0..MAX_ROUNDS {
            let requests = self.db.read().await.transaction_data_requests()?;
            if requests.is_empty() || previous.as_ref() == Some(&requests) {
                break;
            }
            if round + 1 == MAX_ROUNDS {
                tracing::warn!(
                    "sync_enhance_transactions did not converge within {MAX_ROUNDS} rounds; \
                     {} requests still outstanding",
                    requests.len()
                );
            }

            for request in &requests {
                match request {
                    TransactionDataRequest::GetStatus(txid) => {
                        let status = match self.fetch_transaction(*txid).await? {
                            Some((_, Some(height))) => TransactionStatus::Mined(height),
                            Some((_, None)) => TransactionStatus::NotInMainChain,
                            None => TransactionStatus::TxidNotRecognized,
                        };
                        self.db.write().await.set_transaction_status(*txid, status)?;
                    }
                    TransactionDataRequest::Enhancement(txid) => {
                        match self.fetch_transaction(*txid).await? {
                            Some((tx, mined_height)) => {
                                let mut db = self.db.write().await;
                                decrypt_and_store_transaction(
                                    &self.network,
                                    &mut *db,
                                    &tx,
                                    mined_height,
                                )?;
                            }
                            None => {
                                self.db.write().await.set_transaction_status(
                                    *txid,
                                    TransactionStatus::TxidNotRecognized,
                                )?;
                            }
                        }
                    }
                    TransactionDataRequest::TransactionsInvolvingAddress(req) => {
                        self.fetch_transactions_involving_address(req).await?;
                    }
                }
            }
            previous = Some(requests);
        }
        Ok(())
    }

    /// Fetch a full transaction from lightwalletd, returning it together
    /// with its mined height (`None` while it is in the mempool), or `None`
    /// if the node does not know the transaction at all.
    async fn fetch_transaction(
        &self,
        txid: TxId,
    ) -> Result<Option<(zcash_primitives::transaction::Transaction, Option<BlockHeight>)>, Error>
    {
        let mut client = self.client.clone();
        let response = client
            .get_transaction(service::TxFilter {
                block: None,
                index: 0,
                hash: txid.as_ref().to_vec(),
            })
            .await;

        let raw = match response {
            Ok(response) => response.into_inner(),
            Err(status) if transaction_not_found(&status) => return Ok(None),
            Err(status) => return Err(status.into()),
        };

        // lightwalletd reports mempool transactions with a zero (or, on some
        // servers, sentinel out-of-range) height.
        let mined_height = u32::try_from(raw.height)
            .ok()
            .filter(|h| *h > 0)
            .map(BlockHeight::from_u32);
        let branch_height = match mined_height {
            Some(height) => height,
            None => self
                .db
                .read()
                .await
                .chain_height()?
                .ok_or_else(|| Error::Generic("chain tip unknown".to_string()))?,
        };
        let tx = zcash_primitives::transaction::Transaction::read(
            &raw.data[..],
            BranchId::for_height(&self.network, branch_height),
        )
        .map_err(|e| Error::Generic(format!("failed to parse transaction: {e}")))?;
        Ok(Some((tx, mined_height)))
    }

    /// Service a [`TransactionDataRequest::TransactionsInvolvingAddress`]:
    /// fetch every transaction that sends to or spends from the address in
    /// the requested range and store it, then record the checked height.
    async fn fetch_transactions_involving_address(
        &self,
        request: &zcash_client_backend::data_api::TransactionsInvolvingAddress,
    ) -> Result<(), Error> {
        let Some(chain_tip) = self.db.read().await.chain_height()? else {
            return Ok(());
        };

        let start = u32::from(request.block_range_start());
        // The request's end bound is exclusive; the gRPC range is inclusive.
        let end = request
            .block_range_end()
            .map(|h| u32::from(h).saturating_sub(1))
            .unwrap_or_else(|| chain_tip.into());
        if end < start {
            return Ok(());
        }

        let mut client = self.client.clone();
        let mut stream = client
            .get_taddress_txids(service::TransparentAddressBlockFilter {
                address: request.address().encode(&self.network),
                range: Some(service::BlockRange {
                    start: Some(service::BlockId {
                        height: start as u64,
                        hash: vec![],
                    }),
                    end: Some(service::BlockId {
                        height: end as u64,
                        hash: vec![],
                    }),
                    pool_types: vec![],
                }),
            })
            .await?
            .into_inner();

        let mut raw_txs = Vec::new();
        while let Some(raw) = stream.try_next().await? {
            raw_txs.push(raw);
        }
        // Store in mined order so spends of earlier outputs resolve against
        // outputs already recorded (fee derivation, funding account lookup).
        raw_txs.sort_by_key(|raw| raw.height);

        for raw in raw_txs {
            let mined_height = u32::try_from(raw.height)
                .ok()
                .filter(|h| *h > 0)
                .map(BlockHeight::from_u32);
            let tx = zcash_primitives::transaction::Transaction::read(
                &raw.data[..],
                BranchId::for_height(&self.network, mined_height.unwrap_or(chain_tip)),
            )
            .map_err(|e| Error::Generic(format!("failed to parse transaction: {e}")))?;
            let mut db = self.db.write().await;
            decrypt_and_store_transaction(&self.network, &mut *db, &tx, mined_height)?;
        }

        self.db
            .write()
            .await
            .notify_address_checked(request.clone(), BlockHeight::from_u32(end))?;
        Ok(())
    }

    /// Sync stage: download and scan the compact blocks in `[start, end)`.
    ///
    /// A chain reorg detected while scanning rewinds the wallet internally;
    /// callers must re-request `suggest_scan_ranges` after every call, as
    /// scanning can reprioritize ranges or invalidate them via a rewind.
    pub async fn sync_scan_range(&self, start: u32, end: u32) -> Result<(), Error> {
        if end <= start {
            return Ok(());
        }
        let mut client = self.client.clone();

        let range = service::BlockRange {
            start: Some(service::BlockId {
                height: start as u64,
                hash: vec![],
            }),
            end: Some(service::BlockId {
                height: (end - 1) as u64,
                hash: vec![],
            }),
            pool_types: vec![],
        };
        let compact_blocks = client
            .get_block_range(range)
            .await?
            .into_inner()
            .try_collect::<Vec<_>>()
            .await?;

        let db_cache = MemBlockCache::new();
        db_cache
            .insert(compact_blocks)
            .await
            .map_err(|e| Error::Sync(e.to_string()))?;

        // The tree frontier just below the range anchors the scanned notes
        // into the commitment trees.
        let chain_state = client
            .get_tree_state(service::BlockId {
                height: (start - 1) as u64,
                hash: vec![],
            })
            .await?
            .into_inner()
            .to_chain_state()
            .map_err(|e| Error::Sync(format!("invalid tree state from server: {e}")))?;

        let scan_result = {
            let mut db = self.db.write().await;
            scan_cached_blocks(
                &self.network,
                &db_cache,
                &mut *db,
                BlockHeight::from_u32(start),
                &chain_state,
                (end - start) as usize,
            )
        };

        match scan_result {
            Err(ChainError::Scan(err)) if err.is_continuity_error() => {
                let rewind_height = err.at_height().saturating_sub(REORG_REWIND_MARGIN);
                tracing::info!(
                    "Chain reorg detected at {}, rewinding to {}",
                    err.at_height(),
                    rewind_height,
                );
                self.db.write().await.truncate_to_height(rewind_height)?;
                Ok(())
            }
            Ok(_) => Ok(()),
            Err(e) => Err(Error::Sync(e.to_string())),
        }
    }

    pub async fn get_wallet_summary(&self) -> Result<Option<WalletSummary<AccountId>>, Error> {
        Ok(self
            .db
            .read()
            .await
            .get_wallet_summary(self.min_confirmations)?)
    }

    ///
    /// Create a transaction proposal to send funds from the wallet to a given address
    ///
    pub async fn propose_transfer(
        &self,
        account_id: AccountId,
        to_address: ZcashAddress,
        value: u64,
    ) -> Result<Proposal<StandardFeeRule, NoteRef>, Error> {
        let input_selector = GreedyInputSelector::new();

        let change_strategy = self.default_change_strategy()?;
        let request = TransactionRequest::new(vec![Payment::without_memo(
            to_address,
            Zatoshis::from_u64(value)?,
        )])?;

        tracing::info!("Chain height: {:?}", self.db.read().await.chain_height()?);
        tracing::info!(
            "target and anchor heights: {:?}",
            self.db
                .read()
                .await
                .get_target_and_anchor_heights(self.min_confirmations.trusted())?
        );
        let mut db = self.db.write().await;
        let proposal = propose_transfer::<_, _, _,_, <W as WalletCommitmentTrees>::Error>(
            &mut *db,
            &self.network,
            account_id,
            &input_selector,
            &change_strategy,
            request,
            self.min_confirmations,
        )
        .map_err(|_e| Error::Generic("something bad happened when calling propose transfer. Possibly insufficient balance..".to_string()))?;
        tracing::info!("Transfer proposal created");
        Ok(proposal)
    }

    ///
    /// Do the proving and signing required to create one or more transaction from the proposal. Created transactions are stored in the wallet database.
    ///
    /// Note: At the moment this requires a USK but ideally we want to be able to hand the signing off to a separate service
    ///     e.g. browser plugin, hardware wallet, etc. Will need to look into refactoring librustzcash create_proposed_transactions to allow for this
    ///
    pub async fn create_proposed_transactions(
        &self,
        proposal: Proposal<StandardFeeRule, NoteRef>,
        usk: &UnifiedSpendingKey,
    ) -> Result<NonEmpty<TxId>, Error> {
        let prover = crate::proofs::sapling_prover()?;
        let mut db = self.db.write().await;
        let transactions = create_proposed_transactions::<
            _,
            _,
            <MemoryWalletDb<Network> as InputSource>::Error,
            _,
            <StandardFeeRule as FeeRule>::Error,
            _,
        >(
            &mut *db,
            &self.network,
            prover,
            prover,
            &SpendingKeys::from_unified_spending_key(usk.clone()),
            OvkPolicy::Sender,
            &proposal,
        )
        .map_err(|_| Error::FailedToCreateTransaction)?;
        Ok(transactions)
    }

    pub async fn send_authorized_transactions(&self, txids: &NonEmpty<TxId>) -> Result<(), Error> {
        let mut client = self.client.clone();
        for txid in txids.iter() {
            let (txid, raw_tx) = self
                .db
                .read()
                .await
                .get_transaction(*txid)?
                .map(|tx| {
                    let mut raw_tx = service::RawTransaction::default();
                    tx.write(&mut raw_tx.data).unwrap(); // safe to unwrap here as we know the tx is valid
                    (tx.txid(), raw_tx)
                })
                .ok_or(Error::TransactionNotFound(*txid))?;

            let response = client.send_transaction(raw_tx).await?.into_inner();

            if response.error_code != 0 {
                tracing::error!(
                    "Transaction rejected by network: code={}, reason={}",
                    response.error_code,
                    response.error_message
                );

                // Provide actionable hint for common rejection reasons
                let hint = if response.error_message.contains("unknown-anchor") {
                    " (Wallet out of sync - try resyncing)"
                } else if response.error_message.contains("missingorspent") {
                    " (UTXO already spent - try resyncing)"
                } else if response.error_message.contains("duplicate-nullifier") {
                    " (Note already spent - try resyncing)"
                } else {
                    ""
                };

                return Err(Error::SendFailed {
                    code: response.error_code,
                    reason: format!("{}{}", response.error_message, hint),
                });
            } else {
                tracing::info!("Transaction {} sent successfully :)", txid);
            }
        }
        Ok(())
    }

    ///
    /// A helper function that creates a proposal, creates a transaction from the proposal and then submits it
    ///
    pub async fn transfer(
        &self,
        seed_phrase: &str,
        account_hd_index: u32,
        from_account_id: AccountId,
        to_address: ZcashAddress,
        value: u64,
    ) -> Result<(), Error> {
        let (usk, _) = usk_from_seed_str(seed_phrase, account_hd_index, &self.network)?;
        let proposal = self
            .propose_transfer(from_account_id, to_address, value)
            .await?;
        // TODO: Add callback for approving the transaction here
        let txids = self.create_proposed_transactions(proposal, &usk).await?;

        // send the transactions to the network!!
        tracing::info!("Sending transactions");
        self.send_authorized_transactions(&txids).await
    }

    /// Ensure the wallet is synced to near the chain tip before creating a
    /// transaction; prevents expiry and anchor-mismatch errors. Syncing is
    /// driven by the caller (the JS sync engine), so this only checks.
    async fn ensure_synced(&self, op: &str) -> Result<(), Error> {
        let mut client = self.client.clone();
        let chain_tip: u32 = client
            .get_latest_block(service::ChainSpec::default())
            .await?
            .into_inner()
            .height
            .try_into()
            .expect("block heights must fit into u32");

        let wallet_height = self.db.read().await.chain_height()?.ok_or_else(|| {
            Error::Generic("Wallet has not been synced yet. Please sync first.".to_string())
        })?;
        let wallet_height_u32: u32 = wallet_height.into();
        if chain_tip.saturating_sub(wallet_height_u32) > 10 {
            return Err(Error::Generic(format!(
                "{op}: wallet is not synced to the chain tip (wallet={wallet_height_u32}, chain_tip={chain_tip}). Sync first."
            )));
        }
        Ok(())
    }

    /// The shared change strategy: ZIP-317 fees with change split into
    /// `target_note_count` Orchard notes.
    fn default_change_strategy(&self) -> Result<MultiOutputChangeStrategy<W>, Error> {
        Ok(MultiOutputChangeStrategy::new(
            StandardFeeRule::Zip317,
            None,
            ShieldedProtocol::Orchard,
            DustOutputPolicy::default(),
            SplitPolicy::with_min_output_value(
                NonZeroUsize::new(self.target_note_count)
                    .ok_or(Error::FailedToCreateTransaction)?,
                Zatoshis::from_u64(self.min_split_output_value)?,
            ),
        ))
    }

    /// Create a PCZT from a proposal, sharing the generic plumbing and error
    /// logging across the pczt_* entry points.
    fn pczt_from_proposal<NR: Copy + Eq + Ord + Debug>(
        &self,
        db: &mut W,
        account_id: AccountId,
        proposal: &Proposal<StandardFeeRule, NR>,
        op: &str,
    ) -> Result<Pczt, Error> {
        create_pczt_from_proposal::<
            _,
            _,
            <MemoryWalletDb<Network> as InputSource>::Error,
            _,
            <StandardFeeRule as FeeRule>::Error,
            _,
        >(db, &self.network, account_id, OvkPolicy::Sender, proposal)
        .map_err(|e| {
            tracing::error!("{op}: create_pczt_from_proposal failed: {:?}", e);
            Error::PcztCreate(format!("{:?}", e))
        })
    }

    /// Gather spendable transparent UTXOs across the account's addresses,
    /// sorted largest first (stable tiebreaker by outpoint for determinism).
    fn gather_spendable_utxos(
        &self,
        db: &W,
        account_id: AccountId,
        chain_tip_height: BlockHeight,
        target_height: TargetHeight,
    ) -> Result<Vec<WalletTransparentOutput<AccountId>>, Error> {
        let transparent_balances = db.get_transparent_balances(
            account_id,
            chain_tip_height.into(),
            self.min_confirmations,
        )?;
        let mut utxos = Vec::new();
        for addr in transparent_balances.into_keys() {
            utxos.extend(db.get_spendable_transparent_outputs(
                &addr,
                target_height,
                self.min_confirmations,
                TransparentOutputFilter::All,
            )?);
        }
        utxos.sort_by(|a, b| {
            b.value()
                .cmp(&a.value())
                .then_with(|| a.outpoint().cmp(b.outpoint()))
        });
        Ok(utxos)
    }

    /// Greedily select UTXOs, largest first, until they cover `value` plus the
    /// ZIP-317 fee for the given output shape. Returns the selection, its
    /// total input value, and the fee.
    fn select_utxos_for(
        &self,
        utxos: Vec<WalletTransparentOutput<AccountId>>,
        value: Zatoshis,
        target_height: TargetHeight,
        transparent_output_sizes: &[usize],
        sapling_output_count: usize,
        orchard_action_count: usize,
    ) -> Result<(Vec<WalletTransparentOutput<AccountId>>, Zatoshis, Zatoshis), Error> {
        let fee_rule = StandardFeeRule::Zip317;
        let mut selected = Vec::new();
        let mut input_total = Zatoshis::ZERO;
        for utxo in utxos {
            input_total = (input_total + utxo.value()).ok_or(Error::FailedToCreateTransaction)?;
            selected.push(utxo);
            let fee = fee_rule
                .fee_required(
                    &self.network,
                    BlockHeight::from(target_height),
                    selected
                        .iter()
                        .map(transparent_fees::InputView::serialized_size),
                    transparent_output_sizes.iter().copied(),
                    0,
                    sapling_output_count,
                    orchard_action_count,
                )
                .map_err(|e| Error::Generic(format!("Fee calculation failed: {:?}", e)))?;
            let required = (value + fee).ok_or(Error::FailedToCreateTransaction)?;
            if input_total >= required {
                return Ok((selected, input_total, fee));
            }
        }
        Err(Error::Generic(format!(
            "Insufficient transparent balance: have {:?}, need {:?} plus fee",
            input_total, value
        )))
    }

    /// Proposals carry account-agnostic transparent inputs; equivalent of the
    /// crate-private `redact_account_data`.
    fn redact_utxos(
        utxos: Vec<WalletTransparentOutput<AccountId>>,
    ) -> Vec<WalletTransparentOutput<()>> {
        utxos
            .into_iter()
            .map(|utxo| {
                WalletTransparentOutput::from_parts(
                    utxo.outpoint().clone(),
                    utxo.txout().clone(),
                    utxo.mined_height(),
                    utxo.recipient_account().map(|_| ()),
                    utxo.recipient_key_scope(),
                    None,
                )
                .expect("recipient address was already recognized for these UTXOs")
            })
            .collect()
    }

    /// Shield transparent funds into the account's Orchard pool.
    ///
    /// With `value: None`, sweeps all transparent funds above the shielding
    /// threshold. With `Some(value)`, shields at least `value`: UTXOs are
    /// selected greedily and shielded whole, so the shielded amount may exceed
    /// the request; no transparent change is created (UTXO-granular, which
    /// avoids the linkability of exact-amount partial shields).
    pub async fn pczt_shield(
        &self,
        account_id: AccountId,
        value: Option<u64>,
    ) -> Result<Pczt, Error> {
        match value {
            None => self.pczt_shield_all(account_id).await,
            Some(value) => self.pczt_shield_partial(account_id, value).await,
        }
    }

    async fn pczt_shield_partial(&self, account_id: AccountId, value: u64) -> Result<Pczt, Error> {
        tracing::info!(
            "pczt_shield: partial shield of {value} zatoshi for account {:?}",
            account_id
        );
        self.ensure_synced("pczt_shield").await?;

        let value = Zatoshis::from_u64(value)?;
        if value == Zatoshis::ZERO {
            return Err(Error::Generic(
                "Amount to shield must be greater than zero".to_string(),
            ));
        }

        // The shielded value lands in a single Orchard change output (the
        // bundle is padded to 2 actions); there are no transparent outputs.
        let orchard_action_count = orchard::builder::BundleType::DEFAULT
            .num_actions(0, 1)
            .expect("orchard DEFAULT bundle type permits any (spends, outputs) count");

        let mut db = self.db.write().await;
        let chain_tip_height = db
            .chain_height()?
            .ok_or_else(|| Error::Generic("Havent scanned yet, cant shield".to_string()))?;
        let target_height: TargetHeight = (chain_tip_height + 1).into();

        let utxos =
            self.gather_spendable_utxos(&db, account_id, chain_tip_height, target_height)?;
        let (selected, input_total, fee) =
            self.select_utxos_for(utxos, value, target_height, &[], 0, orchard_action_count)?;

        let shielded_value = (input_total - fee).ok_or(Error::FailedToCreateTransaction)?;
        let balance = TransactionBalance::new(
            vec![ChangeValue::shielded(
                ShieldedProtocol::Orchard,
                shielded_value,
                None,
            )],
            fee,
        )
        .map_err(|_| Error::FailedToCreateTransaction)?;

        let proposal: Proposal<StandardFeeRule, std::convert::Infallible> = Proposal::single_step(
            TransactionRequest::empty(),
            BTreeMap::new(),
            Self::redact_utxos(selected),
            None,
            balance,
            StandardFeeRule::Zip317,
            target_height,
            true,
        )
        .map_err(|e| Error::Generic(format!("Failed to build proposal: {:?}", e)))?;
        tracing::info!("pczt_shield: partial shielding proposal created");

        self.pczt_from_proposal(&mut db, account_id, &proposal, "pczt_shield")
    }

    async fn pczt_shield_all(&self, account_id: AccountId) -> Result<Pczt, Error> {
        tracing::info!("pczt_shield: Starting for account {:?}", account_id);
        self.ensure_synced("pczt_shield").await?;

        let change_strategy = self.default_change_strategy()?;
        let input_selector = GreedyInputSelector::new();
        let mut db = self.db.write().await;

        // Shield all funds immediately
        let max_height = match db.chain_height()? {
            Some(max_height) => {
                tracing::info!("pczt_shield: max_height = {:?}", max_height);
                max_height
            }
            // If we haven't scanned anything, there's nothing to do.
            None => {
                tracing::error!("pczt_shield: No chain height - haven't scanned yet");
                return Err(Error::Generic(
                    "Havent scanned yet, cant shield".to_string(),
                ));
            }
        };

        let transparent_balances =
            db.get_transparent_balances(account_id, max_height.into(), self.min_confirmations)?;
        tracing::info!(
            "pczt_shield: transparent_balances count: {}",
            transparent_balances.len()
        );
        for (addr, balance) in &transparent_balances {
            tracing::info!("pczt_shield: address {:?} has balance {:?}", addr, balance);
        }

        let from_addrs = transparent_balances.into_keys().collect::<Vec<_>>();
        tracing::info!("pczt_shield: from_addrs count: {}", from_addrs.len());
        for addr in &from_addrs {
            tracing::info!("pczt_shield: shielding from address {:?}", addr);
        }

        tracing::info!(
            "pczt_shield: Calling propose_shielding with threshold {:?}",
            SHIELDING_THRESHOLD
        );
        let proposal = propose_shielding::<_, _, _, _, <W as WalletCommitmentTrees>::Error>(
            &mut *db,
            &self.network,
            &input_selector,
            &change_strategy,
            SHIELDING_THRESHOLD,
            &from_addrs,
            account_id,
            self.min_confirmations,
            zcash_client_backend::data_api::TransparentOutputFilter::All,
        )
        .map_err(|e| {
            tracing::error!("pczt_shield: propose_shielding failed: {:?}", e);
            Error::Generic(format!("Error when shielding: {:?}", e))
        })?;
        tracing::info!("pczt_shield: proposal created successfully");

        self.pczt_from_proposal(&mut db, account_id, &proposal, "pczt_shield")
    }
    ///
    /// Create a PCZT
    ///
    pub async fn pczt_create_from_shielded(
        &self,
        account_id: AccountId,
        to_address: ZcashAddress,
        value: u64,
    ) -> Result<Pczt, Error> {
        self.ensure_synced("pczt_create_from_shielded").await?;

        let change_strategy = self.default_change_strategy()?;
        let input_selector = GreedyInputSelector::new();
        let request = TransactionRequest::new(vec![Payment::without_memo(
            to_address,
            Zatoshis::from_u64(value)?,
        )])?;
        let mut db = self.db.write().await;
        let proposal = propose_transfer::<_, _, _,_, <W as WalletCommitmentTrees>::Error>(
            &mut *db,
            &self.network,
            account_id,
            &input_selector,
            &change_strategy,
            request,
            self.min_confirmations,
        )
            .map_err(|e| Error::Generic(format!("something bad happened when calling propose transfer. Possibly insufficient balance... {:?}", e)))?;
        tracing::info!("PCZT proposal created");
        self.pczt_from_proposal(&mut db, account_id, &proposal, "pczt_create_from_shielded")
    }

    ///
    /// Create a PCZT spending transparent funds.
    ///
    /// Upstream `propose_transfer` only selects shielded notes, so this builds the
    /// proposal by hand: greedily select transparent UTXOs to cover `value` plus the
    /// ZIP-317 fee and pay `to_address` (transparent or shielded). For transparent
    /// recipients, change returns to the transparent address that funded the
    /// transaction; for shielded recipients, change is auto-shielded into Orchard.
    ///
    pub async fn pczt_create_from_transparent(
        &self,
        account_id: AccountId,
        to_address: ZcashAddress,
        value: u64,
    ) -> Result<Pczt, Error> {
        self.ensure_synced("pczt_create_from_transparent").await?;

        let value = Zatoshis::from_u64(value)?;

        // Fee inputs depend on the recipient pool. Transparent recipients get
        // transparent change back to the source address (payment + change = two
        // t-outs, no shielded actions); shielded recipients get an Orchard
        // change action, keeping change shielded.
        let recipient = Address::try_from_zcash_address(&self.network, to_address.clone())
            .map_err(|e| Error::Generic(format!("Unsupported recipient address: {:?}", e)))?;
        let (payment_pool, transparent_output_sizes, sapling_output_count, orchard_output_count) =
            match recipient {
                Address::Transparent(_) => (
                    PoolType::Transparent,
                    vec![P2PKH_STANDARD_OUTPUT_SIZE; 2],
                    0,
                    0,
                ),
                Address::Sapling(_) => (PoolType::SAPLING, vec![], 1, 1),
                Address::Unified(ua) if ua.orchard().is_some() => (PoolType::ORCHARD, vec![], 0, 2),
                Address::Unified(ua) if ua.sapling().is_some() => (PoolType::SAPLING, vec![], 1, 1),
                Address::Unified(ua) if ua.transparent().is_some() => (
                    PoolType::Transparent,
                    vec![P2PKH_STANDARD_OUTPUT_SIZE; 2],
                    0,
                    0,
                ),
                _ => {
                    return Err(Error::Generic(
                        "Unsupported recipient address type".to_string(),
                    ));
                }
            };
        let sapling_output_count = ::sapling::builder::BundleType::DEFAULT
            .num_outputs(0, sapling_output_count)
            .expect("sapling DEFAULT bundle type permits any (spends, outputs) count");
        let orchard_action_count = orchard::builder::BundleType::DEFAULT
            .num_actions(0, orchard_output_count)
            .expect("orchard DEFAULT bundle type permits any (spends, outputs) count");

        let mut db = self.db.write().await;
        let chain_tip_height = db
            .chain_height()?
            .ok_or_else(|| Error::Generic("Havent scanned yet, cant transfer".to_string()))?;
        let target_height: TargetHeight = (chain_tip_height + 1).into();

        let utxos =
            self.gather_spendable_utxos(&db, account_id, chain_tip_height, target_height)?;
        let (selected, input_total, fee) = self.select_utxos_for(
            utxos,
            value,
            target_height,
            &transparent_output_sizes,
            sapling_output_count,
            orchard_action_count,
        )?;

        // Change below the ZIP-317 marginal fee is not worth a transparent
        // output; it gets absorbed into the fee instead.
        const CHANGE_DUST_THRESHOLD: Zatoshis = Zatoshis::const_from_u64(5_000);

        let mut payments = vec![Payment::without_memo(to_address, value)];
        let mut payment_pools = BTreeMap::new();
        payment_pools.insert(0usize, payment_pool);

        let change = (input_total - value).and_then(|v| v - fee);
        let balance = match change {
            // t->t: return change to the transparent address we spent from, as
            // an explicit second output, so the funds stay transparent.
            Some(change)
                if payment_pool == PoolType::Transparent && change >= CHANGE_DUST_THRESHOLD =>
            {
                let change_address = Address::Transparent(*selected[0].recipient_address())
                    .to_zcash_address(&self.network);
                payments.push(Payment::without_memo(change_address, change));
                payment_pools.insert(1usize, PoolType::Transparent);
                TransactionBalance::new(vec![], fee)
            }
            // Shielded recipient: change is auto-shielded into Orchard.
            Some(change) if payment_pool != PoolType::Transparent && change > Zatoshis::ZERO => {
                TransactionBalance::new(
                    vec![ChangeValue::shielded(
                        ShieldedProtocol::Orchard,
                        change,
                        None,
                    )],
                    fee,
                )
            }
            // Inputs cover the payment (almost) exactly: absorb the leftover
            // into the fee instead of creating a dust output.
            _ => TransactionBalance::new(
                vec![],
                (input_total - value).ok_or(Error::FailedToCreateTransaction)?,
            ),
        }
        .map_err(|_| Error::FailedToCreateTransaction)?;

        let request = TransactionRequest::new(payments)
            .map_err(|e| Error::Generic(format!("Invalid payment request: {:?}", e)))?;

        let proposal: Proposal<StandardFeeRule, std::convert::Infallible> = Proposal::single_step(
            request,
            payment_pools,
            Self::redact_utxos(selected),
            None,
            balance,
            StandardFeeRule::Zip317,
            target_height,
            false,
        )
        .map_err(|e| Error::Generic(format!("Failed to build proposal: {:?}", e)))?;
        tracing::info!("pczt_create_from_transparent: proposal created");

        self.pczt_from_proposal(
            &mut db,
            account_id,
            &proposal,
            "pczt_create_from_transparent",
        )
    }

    ///
    /// Prove a PCZT
    ///
    /// Sapling spends must already carry their proof generation key; the
    /// keychain's `pczt_sign` attaches it while signing.
    pub async fn pczt_prove(&self, pczt: Pczt) -> Result<Pczt, Error> {
        let prover = crate::proofs::sapling_prover()?;
        let pczt = Prover::new(pczt)
            .create_orchard_proof(&orchard::circuit::ProvingKey::build())
            .map_err(|e| Error::PcztProve(format!("Failed to create Orchard proof: {:?}", e)))?
            .create_sapling_proofs(prover, prover)
            .map_err(|e| Error::PcztProve(format!("Failed to create Sapling proofs: {:?}", e)))?
            .finish();
        Ok(pczt)
    }

    pub async fn pczt_send(&self, pczt: Pczt) -> Result<(), Error> {
        // Verify the wallet is sufficiently synced before sending
        // The network only accepts anchors within the last 100 blocks
        let mut client = self.client.clone();
        let chain_tip: u32 = client
            .get_latest_block(service::ChainSpec::default())
            .await?
            .into_inner()
            .height
            .try_into()
            .expect("block heights must fit into u32");

        let db_read = self.db.read().await;
        let fully_scanned = db_read.chain_height()?;
        drop(db_read);

        if let Some(scanned_height) = fully_scanned {
            let scanned_height_u32: u32 = scanned_height.into();
            let blocks_behind = chain_tip.saturating_sub(scanned_height_u32);
            if blocks_behind > 100 {
                tracing::error!(
                    "Wallet too far behind: scanned={}, chain_tip={}, blocks_behind={}",
                    scanned_height_u32,
                    chain_tip,
                    blocks_behind
                );
                return Err(Error::Generic(format!(
                    "Wallet is {} blocks behind the chain tip. Please sync before sending (max allowed: 100 blocks).",
                    blocks_behind
                )));
            }
            tracing::info!(
                "pczt_send: Anchor validation passed. Wallet is {} blocks behind chain tip.",
                blocks_behind
            );
        } else {
            return Err(Error::Generic(
                "Wallet has not been synced yet. Please sync before sending.".to_string(),
            ));
        }

        let prover = crate::proofs::sapling_prover()?;
        let (spend_vk, output_vk) = prover.verifying_keys();
        let mut db = self.db.write().await;
        let txid = extract_and_store_transaction_from_pczt::<_, ()>(
            &mut *db,
            pczt,
            Some((&spend_vk, &output_vk)),
            Some(&orchard::circuit::VerifyingKey::build()),
        )
        .map_err(|e| {
            Error::PcztSend(format!(
                "Failed to extract and store transaction from PCZT: {:?}",
                e
            ))
        })?;
        drop(db);
        self.send_authorized_transactions(&NonEmpty::new(txid))
            .await
    }

    pub fn pczt_combine(&self, pczts: Vec<Pczt>) -> Result<Pczt, Error> {
        Combiner::new(pczts)
            .combine()
            .map_err(|e| Error::PcztCombine(format!("Failed to combine PCZT: {:?}", e)))
    }
}

/// Whether a gRPC error status means the queried transaction is unknown to
/// the node, as opposed to a transport or server failure.
fn transaction_not_found(status: &tonic::Status) -> bool {
    let message = status.message().to_lowercase();
    status.code() == tonic::Code::NotFound
        || message.contains("not found")
        || message.contains("no such mempool")
}

pub(crate) fn usk_from_seed_str(
    seed: &str,
    account_id: u32,
    network: &Network,
) -> Result<(UnifiedSpendingKey, SeedFingerprint), Error> {
    let mnemonic = <Mnemonic<English>>::from_phrase(seed).map_err(|_| Error::InvalidSeedPhrase)?;
    let seed = {
        let mut seed = mnemonic.to_seed("");
        let secret = seed.to_vec();
        seed.zeroize();
        SecretVec::new(secret)
    };
    let seed_fingerprint =
        SeedFingerprint::from_seed(seed.expose_secret()).expect("seed fingerprint");
    let usk = UnifiedSpendingKey::from_seed(network, seed.expose_secret(), account_id.try_into()?)?;
    Ok((usk, seed_fingerprint))
}
