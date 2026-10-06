import initZcore, {
  find_spends,
  nullifiers_spent,
  parse_transaction,
  script_address,
} from "@zillions/zcore";

import { invariant } from "../invariant";
import type { TransactionReceipt } from "../sdk/types";
import { dedupe, singleton } from "../utils";
import { crawlChunks, workerChannel } from "./crawl";
import {
  loadBlocks,
  loadNotes,
  loadSent,
  loadSyncStatus,
  saveBlocks,
  saveSyncState,
} from "./db";
import {
  buildHistory,
  historyHeights,
  locatorId,
  type Payment,
} from "./history";
import {
  CHUNK_SIZE,
  fetchNullifierChunk,
  fetchTreeSizes,
  firstChunkFrom,
  lastChunk,
  type TreeSizes,
} from "./indexer";
import {
  type Block,
  fetchBlock,
  fetchTransaction,
  outputPositions,
} from "./lightwalletd";
import {
  maxSend,
  planMigration,
  planSend,
  sendPczt,
  type SendRequest,
  shieldPczt,
  type WalletData,
} from "./send";
import { submitTransaction } from "./submit";
import {
  cachedTransparent,
  nextInternalAddress,
  type OwnUtxo,
  REORG_DEPTH,
  reserveInternalAddress,
  syncTransparent,
  type TransparentTx,
} from "./transparent";
import type {
  ChunkWorkerSuccess,
  Note,
  PendingReceipt,
  Pool,
  Sent,
  SentOutput,
  SyncStatus,
  TxLocator,
} from "./types";

export type SyncEventListener = (e: { percentage: number }) => void;

const NETWORK = import.meta.env.VITE_ZCASH_NETWORK ?? "main";

/** Each pool's last chunk, possibly still filling; -1 for an empty pool. */
type LastChunks = Record<Pool, number>;

/**
 * Blocks past a pending transaction's expiry before it's dropped: the indexer
 * trails the chain, and one mined at its last height must show up first.
 */
const EXPIRY_MARGIN = 10;

/** Newest pool first: that's where recent activity lands. */
const POOLS = ["ironwood", "orchard", "sapling"] as const satisfies Pool[];

const percentageOf = (scanned: SyncStatus["scanned"], last: LastChunks) => {
  let [done, total] = [0, 0];
  for (const pool of POOLS) {
    const scan = scanned[pool];
    if (!scan) continue;
    done += Math.max(0, scan.next - scan.start);
    total += Math.max(0, last[pool] + 1 - scan.start);
  }
  return total > 0 ? Math.min(100, (done / total) * 100) : 100;
};

const emptySyncStatus = (accountId: string): SyncStatus => ({
  id: accountId,
  percentage: 0,
  scanned: {},
  saplingNullifiers: 0,
  sendsRead: [],
  pending: [],
});

/** Notes' nullifiers as zcore takes them: 32 bytes each, back to back. */
const packNullifiers = (notes: Note[]) =>
  Uint8Array.from(
    notes.flatMap((n) => n.nf_mine.match(/../g)!.map((b) => parseInt(b, 16))),
  );

type Lookups = ReturnType<typeof workerChannel>;

export class ZWallet {
  readonly id: string;
  readonly #ufvk: string;
  /** Block height below which nothing is crawled. Absent means full history. */
  readonly #birthday?: number;

  #notes: Note[] = [];
  #sent: Sent[] = [];
  /** Note and sent-output ids already held, so a re-read chunk can't double them. */
  #applied: Set<string> = new Set();
  #syncStatus: SyncStatus;
  /** The transparent side; `tip` is absent until a sync lands. */
  #transparent: {
    utxos: OwnUtxo[];
    txs: TransparentTx[];
    tip?: number;
    addresses?: Set<string>;
  } = {
    utxos: [],
    txs: [],
  };
  /** Blocks history names, for their txids, times and transparent outputs. */
  #blocks: Map<number, Block> = new Map();
  #syncProgressListeners: Set<SyncEventListener> = new Set();
  #abort = new AbortController();
  /** Saves are chained so two overlapping writes can't reorder the sync tip. */
  #saving: Promise<unknown> = Promise.resolve();
  /**
   * Each crawled chunk's spend lookup, then its cursor move, chained in chunk
   * order: the cursor never passes a chunk whose spends aren't placed.
   */
  #locating: Promise<unknown> = Promise.resolve();
  /** Chunks read in full this sync, as `pool:chunk`: their sends are in. */
  #readChunks = new Set<string>();
  /** Heights whose block was fetched this sync. */
  #freshBlocks = new Set<number>();

  constructor(options: { id: string; ufvk: string; birthday?: number }) {
    this.id = options.id;
    this.#ufvk = options.ufvk;
    this.#birthday = options.birthday;
    this.#syncStatus = emptySyncStatus(this.id);
    this.#seed();
  }

  free = () => {
    this.#abort.abort();
    this.#syncProgressListeners.clear();
  };

  #seed = singleton(async () => {
    // TODO review if we should have a unified method to load the whole wallet
    const [notes, sent, syncStatus, transparent] = await Promise.all([
      loadNotes(this.id),
      loadSent(this.id),
      loadSyncStatus(this.id),
      cachedTransparent(this.id, this.#ufvk),
    ]);
    this.#notes = notes;
    this.#sent = sent;
    if (syncStatus) {
      this.#syncStatus = syncStatus;
    }
    // No tip: nothing is planned on coins the chain may have moved since.
    if (transparent) this.#transparent = transparent;
    for (const note of notes) this.#applied.add(note.id);
    for (const out of sent) this.#applied.add(out.id);
    await this.#restoreBlocks([
      ...historyHeights(notes, sent, this.#transparent.txs),
    ]);
  });

  subscribeSyncProgress = (listener: SyncEventListener) => {
    this.#syncProgressListeners.add(listener);
    return () => {
      this.#syncProgressListeners.delete(listener);
    };
  };

  #emitProgress = () => {
    const { percentage } = this.#syncStatus;
    this.#syncProgressListeners.forEach((listener) => listener({ percentage }));
  };

  /**
   * Scans each pool oldest-first, from the birthday's chunk (or chunk 0) to
   * the tip, then on later syncs from where it stopped. Every note older than
   * a chunk is known when that chunk is read, so its spends show up in it.
   */
  sync = dedupe(async () => {
    const startTime = Date.now();
    await this.#seed();
    this.#emitProgress();

    // Transparent takes seconds, so it lands long before the shielded crawl;
    // announcing it on arrival shows that balance straight away. Blocks are
    // fetched now too, the tip being known: a new transparent transaction's,
    // and recent ones a reorg may have replaced.
    const transparent = syncTransparent(this.id, this.#ufvk)
      .then((result) => {
        this.#transparent = result;
        this.#emitProgress();
        return this.#fetchBlocks();
      })
      .catch((err) => console.error("[sync] transparent failed", err));

    const lookups = workerChannel();
    this.#locating = Promise.resolve();
    this.#readChunks.clear();
    this.#freshBlocks.clear();
    let sizes: TreeSizes | undefined;
    // History's blocks are looked up whatever becomes of the crawl: what it
    // did find, and the transparent side, still deserve their txids and times.
    try {
      await initZcore();
      sizes = await fetchTreeSizes();
      const last = Object.fromEntries(
        POOLS.map((pool) => [pool, lastChunk(sizes![pool])]),
      ) as LastChunks;
      const { scanned } = this.#syncStatus;
      for (const pool of POOLS) {
        if (scanned[pool]) continue;
        const start =
          this.#birthday === undefined
            ? 0
            : await firstChunkFrom(pool, this.#birthday, last[pool]);
        scanned[pool] = { start, next: start };
      }

      for (const pool of POOLS) {
        if (last[pool] < 0) continue;
        const scan = scanned[pool]!;
        await crawlChunks({
          ufvk: this.#ufvk,
          pool,
          // The last chunk read may have been the tip, still filling.
          from: Math.max(scan.start, scan.next - 1),
          to: last[pool],
          signal: this.#abort.signal,
          onChunk: (result) => this.#applyChunk(pool, result, last, lookups),
        });
        await this.#locating;
        if (this.#abort.signal.aborted) break;

        if (pool === "sapling") {
          await this.#checkSaplingSpends();
        } else {
          // Read to the tip: whatever is still unchecked hasn't been spent.
          for (const note of this.#notes) {
            if (note.pool === pool && note.spent === undefined) {
              note.spent = false;
            }
          }
        }
        this.#advance(last);
      }
    } finally {
      await transparent;
      await this.#fetchBlocks(await this.#unplacedPendingHeights());
      this.#locateSaplingSpends();
      if (sizes) {
        await this.#recoverSends(sizes, lookups).catch((err) =>
          console.error("[sync] sends lookup failed", err),
        );
      }
      lookups.terminate();
      this.#prunePending();
      this.#save();
      this.#emitProgress();
      await this.#saving;
      console.log("[sync] took (seconds):", (Date.now() - startTime) / 1000);
    }
  });

  /** Applies one chunk, in chunk order: its notes and sends, then which of our notes it spends. */
  #applyChunk = (
    pool: Pool,
    { chunk, hits, sent, body }: ChunkWorkerSuccess,
    last: LastChunks,
    lookups: Lookups,
  ) => {
    // A worker reads a chunk in full exactly when it holds a note of ours.
    if (hits.length) this.#readChunks.add(`${pool}:${chunk}`);
    this.#applySent(pool, sent);
    for (const hit of hits) {
      const note: Note = {
        ...hit,
        id: `${this.id}_${pool}_${hit.position}`,
        spent: undefined,
      };
      if (this.#applied.has(note.id)) continue;
      this.#applied.add(note.id);
      this.#notes.push(note);
    }

    // An Orchard or Ironwood action names the nullifier it spends as its rho.
    const spends = pool === "sapling" ? [] : this.#findSpends(pool, body);
    const scan = this.#syncStatus.scanned[pool]!;
    this.#locating = this.#locating.then(async () => {
      if (spends.length) await this.#placeSpends(pool, chunk, spends, lookups);
      scan.next = Math.max(scan.next, chunk + 1);
      this.#advance(last);
    });
  };

  #applySent = (pool: Pool, sent: SentOutput[]) => {
    for (const out of sent) {
      const id = `${this.id}_${pool}_${out.position}`;
      if (this.#applied.has(id)) continue;
      this.#applied.add(id);
      this.#sent.push({ ...out, id });
    }
  };

  /** Records of `body` spending notes found so far, by index. */
  #findSpends = (pool: Pool, body: Uint8Array) => {
    const ours = this.#notes.filter(
      (n) => n.pool === pool && typeof n.spent !== "object",
    );
    return ours.length
      ? [...find_spends(pool, body, packNullifiers(ours))]
      : [];
  };

  /** Places `spends`, records of `chunk`, and takes what the chunk shows we sent. */
  #placeSpends = async (
    pool: Pool,
    chunk: number,
    spends: number[],
    lookups: Lookups,
  ) => {
    const result = await lookups.run({ ufvk: this.#ufvk, chunk, pool, spends });
    this.#readChunks.add(`${pool}:${chunk}`);
    this.#applySent(pool, result.sent);
    for (const place of result.spends) {
      const note = this.#notes.find(
        (n) => n.pool === pool && n.nf_mine === place.nf,
      );
      if (note) note.spent = { height: place.height, tx_index: place.tx_index };
    }
  };

  /**
   * Checks Sapling notes against the indexer's nullifier chunks, from the
   * first one not checked yet. A Sapling spend doesn't sit beside an output
   * of its own, so this finds that a note was spent, not where.
   */
  #checkSaplingSpends = async () => {
    const unchecked = () =>
      this.#notes.filter((n) => n.pool === "sapling" && !n.spent);
    if (!unchecked().length) return;
    for (let chunk = this.#syncStatus.saplingNullifiers; ; chunk++) {
      if (this.#abort.signal.aborted) return;
      const body = await fetchNullifierChunk("sapling", chunk);
      if (!body) break;
      const ours = unchecked();
      const { spent, frozen } = nullifiers_spent(
        body,
        packNullifiers(ours),
      ) as { spent: number[]; frozen: boolean };
      for (const i of spent) ours[i].spent = true;
      if (!frozen) break;
      // A full chunk never changes, so it's never read again.
      this.#syncStatus.saplingNullifiers = chunk + 1;
    }
    for (const note of unchecked()) note.spent = false;
  };

  /**
   * Places each Sapling spend in a transaction of ours, from the Sapling
   * nullifiers in the blocks history fetched. One in a transaction with
   * nothing else of ours stays `true`: spent, transaction unknown.
   */
  #locateSaplingSpends = () => {
    for (const note of this.#notes) {
      if (note.pool !== "sapling" || note.spent !== true) continue;
      for (const [height, block] of this.#blocks) {
        const tx_index =
          height >= note.height
            ? block.saplingSpends.get(note.nf_mine)
            : undefined;
        if (tx_index !== undefined) {
          note.spent = { height, tx_index };
          break;
        }
      }
    }
  };

  /**
   * Where pending transactions mined with a Sapling spend no block of ours
   * places, as when nothing else of ours is in them. lightwalletd broadcast
   * them, so asking it for them back tells it nothing new.
   */
  #unplacedPendingHeights = async () => {
    const unplaced = new Set(
      this.#notes.filter((n) => n.spent === true).map((n) => n.nf_mine),
    );
    const heights = await Promise.all(
      this.#syncStatus.pending
        .filter((p) => p.nullifiers.some((nf) => unplaced.has(nf)))
        .map((p) =>
          fetchTransaction(p.txid).then(
            (tx) => tx.height,
            (err) => {
              console.error("[sync] pending lookup failed", p.txid, err);
              return 0;
            },
          ),
        ),
    );
    return heights.filter((height) => height > 0);
  };

  /** Our transactions that spent notes or coins of ours, by `height:tx_index`. */
  #sendingTxs = () => {
    const txs = new Map<string, TxLocator>();
    for (const { spent } of this.#notes) {
      if (typeof spent === "object") {
        txs.set(`${spent.height}:${spent.tx_index}`, spent);
      }
    }
    for (const { txid, height, spent } of this.#transparent.txs) {
      if (!spent) continue;
      const txids = this.#blocks.get(height)?.txids ?? [];
      const tx_index = [...txids].find(([, id]) => id === txid)?.[0];
      if (tx_index !== undefined) {
        txs.set(`${height}:${tx_index}`, { height, tx_index });
      }
    }
    return txs;
  };

  /**
   * Reads what our own transactions sent, in every pool they pay into: the
   * crawl only reads chunks holding a note or spend of ours, but a payment
   * can sit in another pool's chunk. Its block says exactly where.
   */
  #recoverSends = async (sizes: TreeSizes, lookups: Lookups) => {
    const done = new Set(this.#syncStatus.sendsRead);
    try {
      for (const [id, { height, tx_index }] of this.#sendingTxs()) {
        const block = this.#blocks.get(height);
        if (done.has(id) || !block) continue;
        const places = outputPositions(block, tx_index).filter((p) => p.count);
        // Not indexed yet: try again next sync.
        if (places.some((p) => p.first + p.count > sizes[p.pool])) continue;
        for (const { pool, first, count } of places) {
          const from = Math.floor(first / CHUNK_SIZE);
          const to = Math.floor((first + count - 1) / CHUNK_SIZE);
          for (let chunk = from; chunk <= to; chunk++) {
            if (this.#readChunks.has(`${pool}:${chunk}`)) continue;
            const { sent } = await lookups.run({
              ufvk: this.#ufvk,
              chunk,
              pool,
              spends: [],
            });
            this.#applySent(pool, sent);
            this.#readChunks.add(`${pool}:${chunk}`);
          }
        }
        done.add(id);
      }
    } finally {
      this.#syncStatus.sendsRead = [...done];
    }
  };

  /** Drops pending transactions seen mined (a spend of theirs is on chain) or past expiry. */
  #prunePending = () => {
    const { tip, txs } = this.#transparent;
    const spent = new Set(
      this.#notes.filter((n) => n.spent).map((n) => n.nf_mine),
    );
    const mined = new Set(txs.map((tx) => tx.txid));
    this.#syncStatus.pending = this.#syncStatus.pending.filter(
      (p) =>
        !mined.has(p.txid) &&
        !p.nullifiers.some((nf) => spent.has(nf)) &&
        (p.expiryHeight === 0 ||
          tip === undefined ||
          tip <= p.expiryHeight + EXPIRY_MARGIN),
    );
  };

  /** Nullifiers and `txid:index` outpoints pending transactions spend. */
  #held = () => {
    const { pending } = this.#syncStatus;
    return {
      notes: new Set(pending.flatMap((p) => p.nullifiers)),
      coins: new Set(pending.flatMap((p) => p.outpoints)),
    };
  };

  /**
   * Fetches the blocks behind every transaction in history, and at `extra`,
   * once each: they give shielded transactions their txids, which is what
   * lets a transaction seen from both sides show once, and every entry its
   * time.
   */
  #fetchBlocks = async (extra: number[] = []) => {
    const { tip } = this.#transparent;
    const history = [
      ...historyHeights(this.#notes, this.#sent, this.#transparent.txs),
      ...extra,
    ];
    const missing = await this.#restoreBlocks(history);
    // A block a reorg can still replace is stored, so history shows it on
    // load, but fetched again once per sync.
    const unsettled =
      tip === undefined
        ? []
        : history.filter(
            (height) =>
              height > tip - REORG_DEPTH && !this.#freshBlocks.has(height),
          );
    const heights = [...new Set([...missing, ...unsettled])];
    // A block that fails is simply asked for again next sync.
    const blocks = await Promise.allSettled(heights.map(fetchBlock));
    const fetched: (Block & { height: number })[] = [];
    blocks.forEach((block, i) => {
      if (block.status === "fulfilled") {
        this.#blocks.set(heights[i], block.value);
        this.#freshBlocks.add(heights[i]);
        fetched.push({ ...block.value, height: heights[i] });
      } else
        console.error("[sync] block lookup failed", heights[i], block.reason);
    });
    await saveBlocks(fetched).catch((err) =>
      console.error("[sync] block save failed", err),
    );
    this.#emitProgress();
  };

  /** Takes the stored blocks among `heights`; returns those still missing. */
  #restoreBlocks = async (heights: number[]) => {
    const wanted = heights.filter((height) => !this.#blocks.has(height));
    const stored = await loadBlocks(wanted);
    stored.forEach((block) => block && this.#blocks.set(block.height, block));
    return wanted.filter((height) => !this.#blocks.has(height));
  };

  /** Recomputes progress from the scanned chunks, then persists and announces it. */
  #advance = (last: LastChunks) => {
    this.#syncStatus.percentage = percentageOf(this.#syncStatus.scanned, last);
    this.#save();
    this.#emitProgress();
  };

  // TODO persist only the notes that changed, instead of the whole set.
  #save = () => {
    console.log("[sync] persisting notes:", this.#notes.length);
    const snapshot = {
      ...this.#syncStatus,
      scanned: structuredClone(this.#syncStatus.scanned),
    };
    this.#saving = this.#saving
      // TODO review if it's safe to persist the note.nf_mine.
      // Otherwise we need to compute them during the seed phase.
      // The sync phase already compute them in memory only.
      .then(() => saveSyncState(this.#notes, this.#sent, snapshot))
      .catch((err) => console.error("[sync] save failed", err));
  };

  /** Unspent notes and UTXOs, less what pending transactions spend. */
  #spendable = () => {
    const held = this.#held();
    return {
      notes: this.#notes.filter(
        (n) => n.spent === false && !held.notes.has(n.nf_mine),
      ),
      utxos: this.#transparent.utxos.filter(
        (u) => !held.coins.has(`${u.txid}:${u.index}`),
      ),
    };
  };

  // Both wait for what storage holds, so a query on mount never reads an
  // empty wallet first.
  async getBalance() {
    await this.#seed();
    const { notes, utxos } = this.#spendable();
    return {
      shieldedBalance: notes.reduce((sum, n) => sum + BigInt(n.value), 0n),
      /** The part of `shieldedBalance` still in Orchard, closed since NU6.3. */
      orchardBalance: notes
        .filter((n) => n.pool === "orchard")
        .reduce((sum, n) => sum + BigInt(n.value), 0n),
      pendingChange: this.#syncStatus.pending.reduce(
        (sum, p) => sum + BigInt(p.change),
        0n,
      ),
      // TODO
      pendingSpendable: 0n,
      unshieldedBalance: utxos.reduce((sum, u) => sum + BigInt(u.value), 0n),
    };
  }

  /** What a send may spend, at the chain tip. */
  #walletData = (): WalletData => {
    const { tip } = this.#transparent;
    invariant(tip !== undefined, "The wallet is still syncing");
    const { notes, utxos } = this.#spendable();
    return {
      tip,
      notes: notes.map((n) => ({
        pool: n.pool,
        scope: n.scope,
        note: n.note,
        output_index: n.output_index,
        position: n.position,
        height: n.height,
        // Only names the note: a block not fetched yet mustn't hold a send up.
        txid:
          this.#blocks.get(n.height)?.txids.get(n.tx_index) ??
          n.position.toString(16).padStart(64, "0"),
      })),
      utxos,
    };
  };

  /**
   * Proves and broadcasts a signed PCZT, then holds the notes and coins it
   * spends out of the balance and of new plans until it's mined or expires.
   * `change` is what it returns to us, shown as pending meanwhile, and
   * `receipt` what history lists for it.
   */
  submit = async (
    signed: Uint8Array,
    change: bigint,
    receipt: PendingReceipt,
  ) => {
    const { txid, raw, expiryHeight } = await submitTransaction(signed);
    const { tip } = this.#transparent;
    invariant(tip !== undefined, "The wallet is still syncing");
    await initZcore();
    const tx = parse_transaction(NETWORK, tip, raw) as {
      inputs: { txid: string; index: number }[];
      nullifiers: string[];
    };
    this.#syncStatus.pending.push({
      txid,
      expiryHeight,
      nullifiers: tx.nullifiers,
      outpoints: tx.inputs.map((i) => `${i.txid}:${i.index}`),
      change: Number(change),
      receipt,
    });
    this.#save();
    this.#emitProgress();
    return { txid, expiryHeight };
  };

  planSend = (send: SendRequest) => planSend(this.#walletData(), send);

  /** The next internal address, shown nowhere; see `nextInternalAddress` for when it's null. */
  internalAddress = () => nextInternalAddress(this.id, this.#ufvk);

  /** Records a transaction paying `internalAddress()`'s `index`, so the next one goes elsewhere. */
  internalAddressUsed = (index: number, expiryHeight: number) =>
    reserveInternalAddress(this.id, index, expiryHeight);

  maxSend = (send: SendRequest) => maxSend(this.#walletData(), send);

  planMigration = () => planMigration(this.#walletData());

  /** The unsigned PCZT for `send`, for the keychain account that signs it. */
  /**
   * The unsigned PCZT for `send`, and `changeTo`: the internal address index
   * its transparent change goes to, to record once it's sent.
   */
  sendPczt = async (
    send: SendRequest,
    account: { seedFingerprint: string; hdIndex: number },
  ) => {
    const internal =
      send.from === "transparent" ? await this.internalAddress() : null;
    const built = await sendPczt(
      this.#walletData(),
      send,
      this.#ufvk,
      account,
      internal?.index,
    );
    const transparentChange = built.plan.steps.some((step) =>
      step.change.some((c) => c.pool === "transparent"),
    );
    return {
      ...built,
      changeTo: transparentChange ? internal?.index : undefined,
    };
  };

  /**
   * The unsigned PCZT shielding every transparent coin into Ironwood, what it
   * shields, and its fee.
   */
  proposeShield = async (account: {
    seedFingerprint: string;
    hdIndex: number;
  }) => {
    const { pczt, plan } = await shieldPczt(
      this.#walletData(),
      this.#ufvk,
      account,
    );
    const shielded = plan.steps
      .flatMap((s) => s.change)
      .reduce((sum, c) => sum + BigInt(c.value), 0n);
    return { pczt, value: shielded, fee: BigInt(plan.fee) };
  };

  /**
   * What our sending transactions paid to transparent addresses not ours, by
   * `locatorId`, from their blocks. Empty until the transparent sync names
   * our addresses: an unshield to one of them isn't a payment.
   */
  #payments = async () => {
    const paid = new Map<string, Payment[]>();
    const { addresses } = this.#transparent;
    if (!addresses) return paid;
    await initZcore();
    for (const locator of this.#sendingTxs().values()) {
      const vout = this.#blocks.get(locator.height)?.vout.get(locator.tx_index);
      const theirs = (vout ?? []).flatMap(({ value, script }) => {
        const recipient = script_address(NETWORK, script);
        return recipient && addresses.has(recipient)
          ? []
          : [{ value, recipient }];
      });
      if (theirs.length) paid.set(locatorId(locator), theirs);
    }
    return paid;
  };

  /** Newest first, pending transactions on top until sync finds them mined. */
  async getTransactionHistory(): Promise<TransactionReceipt[]> {
    await this.#seed();
    const history = buildHistory(
      this.#notes,
      this.#sent,
      this.#transparent.txs,
      this.#blocks,
      await this.#payments(),
      this.#transparent.addresses,
    );
    const mined = new Set(history.map((tx) => tx.txid));
    const pending = this.#syncStatus.pending
      .filter((p) => p.receipt && !mined.has(p.txid))
      .reverse()
      .map(({ txid, receipt }) => ({
        ...receipt!,
        txid,
        status: "Pending" as const,
        block_height: 0,
        confirmations: 0,
        memo: undefined,
        pool: "mixed" as const,
      }));
    return [...pending, ...history];
  }
}
