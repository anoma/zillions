import type { AccountInfo, ProvedTx } from "@zillions/keychain-types";
import initZcore, { parse_transaction } from "@zillions/zcore";

import { invariant } from "../invariant";
import { keychain } from "../keychain/keychain";
import { dedupe, singleton } from "../utils";
import {
  activityHeights,
  authoredTxs,
  buildActivity,
  txidsToRead,
} from "./activity";
import { balances, spendable, walletData } from "./balance";
import { fetchTreeSizes, type TreeSizes } from "./chain/indexer";
import {
  fetchBlock,
  fetchLatestHeight,
  fetchTransaction,
} from "./chain/lightwalletd";
import { broadcastTransaction, type ProveStage } from "./chain/submit";
import { NETWORK } from "./config";
import {
  type Migration,
  nextStep,
  spareNotes,
  startMigration,
  stepSent,
} from "./migration";
import {
  confirmedAt,
  pendingActivity,
  prunePending,
  REQUIRED_CONFIRMATIONS,
  tipCheckMs,
} from "./pending";
import {
  maxSend,
  type MigrationPlan,
  planMigration,
  planPreparation,
  planSend,
  preparationTx,
  type SendRequest,
  sendTx,
  shieldTx,
  type Source,
  spendableNow,
} from "./send";
import { chunkChannel, CORES } from "./shielded/crawl";
import {
  backgroundPhase,
  progressOf,
  type SyncPhase,
  type SyncProgress,
} from "./shielded/phases";
import {
  crawlHistory,
  crawlRecent,
  recoverSends,
  type ShieldedRun,
} from "./shielded/sync";
import { emptyState, loadState, saveState, storageKey } from "./store";
import {
  cachedTransparent,
  keepReserved,
  nextInternalAddress,
  type ParsedTx,
  REORG_DEPTH,
  reserveInternalAddress,
  syncTransparent,
  type TransparentView,
} from "./transparent";
import type {
  Activity,
  CheckSwapExecutionStatusResponse,
  Note,
  PendingActivity,
  SentOutput,
  TxHashDetails,
  WalletState,
} from "./types";

export type SyncEventListener = (e: SyncProgress) => void;

/** Every phase on every core, hidden tab or not. */
const FRY = import.meta.env.VITE_ALLOW_CPU_TO_FRY === "true";

/** How long after a sync ends, however it ends, the next one starts by itself. */
const RESYNC_MS = 60_000;

/** Whether the browser asks to save data (Chromium only). */
const saveData = () =>
  (navigator as { connection?: { saveData?: boolean } }).connection
    ?.saveData === true;

/** One account's wallet: its state, kept in storage and brought up to date by `sync`, and what the app reads and sends with. */
export class Wallet {
  /** The shielded account's keychain id: the keychain holds its viewing key. */
  readonly id: string;
  /** Block height below which nothing is crawled. Absent means full history. */
  readonly #birthday?: number;
  /** What the keychain tells of the account; read when storage is. */
  #info?: AccountInfo;

  #state: WalletState;
  #key?: CryptoKey;
  /** The chain tip, once this session's sync asks for it. */
  #tip?: number;
  /** The transparent side as stored, then as this session's sync finds it. */
  #transparent?: TransparentView;
  /** Whether this session's transparent sync landed: coins are planned only then. */
  #transparentSynced = false;
  /** Note and sent-output ids held, so a re-read chunk can't double them. */
  #applied = new Set<string>();
  #syncProgressListeners = new Set<SyncEventListener>();
  #abort = new AbortController();
  /** Saves are chained so two overlapping writes can't reorder the sync tip. */
  #saving: Promise<unknown> = Promise.resolve();
  /** Whether the state changed since the last save began. */
  #dirty = false;
  /** Block lookups for what chunks found, chained so none overlap. */
  #placing: Promise<unknown> = Promise.resolve();
  /** Heights whose block was fetched this sync. */
  #freshBlocks = new Set<number>();
  #progress: SyncProgress = { phase: "catch-up" };
  /** History, running in the background after a sync. */
  #history?: {
    phase: "history" | "spam";
    abort: AbortController;
    done: Promise<boolean>;
  };
  /** Whether history may download: not when the browser saves data, unless asked. */
  #historyAllowed = !saveData();
  #speedUp = false;
  /** The tree sizes the last sync read to; history reads to them too. */
  #sizes?: TreeSizes;
  #recentRunning = false;
  #resync?: ReturnType<typeof setTimeout>;
  /** Tip checks since the last sync ended. */
  #checks = 0;

  constructor(options: { id: string; birthday?: number }) {
    this.id = options.id;
    this.#birthday = options.birthday;
    this.#state = emptyState(this.id);
    this.#seed();
  }

  free = () => {
    clearTimeout(this.#resync);
    this.#abort.abort();
    this.#syncProgressListeners.clear();
  };

  #seed = singleton(async () => {
    this.#info = await keychain().accountInfo(this.id);
    this.#key = await storageKey(this.#info.storageKey);
    const stored = await loadState(this.id, this.#key);
    if (stored) this.#state = stored;
    const { notes, sent, transparent } = this.#state;
    if (transparent) {
      this.#transparent = await cachedTransparent(transparent, this.id);
    }
    for (const { id } of [...notes, ...sent]) this.#applied.add(id);
  });

  subscribeSyncProgress = (listener: SyncEventListener) => {
    this.#syncProgressListeners.add(listener);
    return () => {
      this.#syncProgressListeners.delete(listener);
    };
  };

  #emitProgress = () => {
    const progress = {
      ...this.#progress,
      spedUp: this.#speedUp,
      fry: FRY,
      syncing: this.#recentRunning,
    };
    this.#syncProgressListeners.forEach((listener) => listener(progress));
  };

  #announce = (progress: SyncProgress) => {
    this.#progress = progress;
    this.#emitProgress();
  };

  #workersLogged = "";

  #workers = (phase: SyncPhase) => {
    const [count, why]: [number, string] = FRY
      ? [CORES, "VITE_ALLOW_CPU_TO_FRY"]
      : globalThis.document?.hidden
        ? [1, "tab hidden"]
        : phase !== "history" && phase !== "spam"
          ? [CORES, "full power"]
          : this.#speedUp
            ? [CORES, "sped up"]
            : [2, "background"];
    const line = `${phase}: ${count} workers (${why})`;
    if (line !== this.#workersLogged) {
      console.log(`[sync] ${line}`);
      this.#workersLogged = line;
    }
    return count;
  };

  #newRun = (tip: number, signal: AbortSignal): ShieldedRun => ({
    key: { account: this.id },
    pools: this.#info?.pools ?? [],
    // An import's 0 means none: the whole history.
    birthday: this.#birthday || undefined,
    state: this.#state,
    tip,
    workers: this.#workers,
    applied: this.#applied,
    lookups: chunkChannel(),
    signal,
    onFound: () => {
      this.#placing = this.#placing.then(() =>
        this.#fetchBlocks().catch((err) =>
          console.error("[sync] block lookup failed", err),
        ),
      );
    },
    onAdvance: (progress) => {
      this.#save();
      this.#announce(progress);
    },
  });

  /**
   * Brings the wallet up to the chain tip: new chunks, and setup until it's
   * done. History then goes on in the background. A call while one runs
   * shares it, and pauses history meanwhile. It runs again by itself once a
   * new block is mined, or a minute after it ends, once nothing runs in the
   * background.
   */
  sync = dedupe(async () => {
    clearTimeout(this.#resync);
    this.#resync = undefined;
    try {
      await this.#syncRecent();
    } catch (err) {
      // `syncing` is false by now: says the run stopped short.
      this.#emitProgress();
      throw err;
    } finally {
      // Counted from the end, so a slow sync never queues another.
      this.#checks = 0;
      if (!this.#abort.signal.aborted) {
        this.#resync = setTimeout(this.#resyncTick, tipCheckMs());
      }
    }
  });

  /** The timed sync, held back while history or the spam era runs: a sync would pause it. */
  #resyncTick = async () => {
    const timer = this.#resync;
    this.#checks++;
    // A new block for something pending syncs even while history runs: it pauses for it.
    const waiting = this.#waiting();
    const due =
      (!this.#history || waiting) &&
      ((!this.#history && this.#checks * tipCheckMs() >= RESYNC_MS) ||
        (await fetchLatestHeight().catch(() => 0)) > (this.#tip ?? Infinity));
    // A sync started meanwhile schedules the next tick itself.
    if (this.#resync !== timer || this.#abort.signal.aborted) return;
    if (due && !this.#history) return this.resync();
    if (due && waiting)
      return void this.sync().catch((e) => console.error("[sync] failed", e));
    this.#resync = setTimeout(this.#resyncTick, tipCheckMs());
  };

  /** Whether something is pending: unmined, or mined with too few confirmations. */
  #waiting = () => {
    const tip = this.#tip;
    return (
      this.#state.pending.length > 0 ||
      (tip !== undefined &&
        [...this.#state.blocks.keys()].some(
          (height) => tip - height + 1 < REQUIRED_CONFIRMATIONS,
        ))
    );
  };

  /** A sync that, like the timed one, skips while history or the spam era runs. */
  resync = () => {
    if (this.#history) return;
    this.sync().catch((e) => console.error("[sync] failed", e));
  };

  #syncRecent = async () => {
    const startTime = Date.now();
    await this.#seed();
    // Raised first: a background run ending meanwhile must not start the next.
    this.#recentRunning = true;
    await this.#stopHistory();
    this.#emitProgress();

    this.#placing = Promise.resolve();
    this.#freshBlocks.clear();
    let transparent: Promise<unknown> = Promise.resolve();
    let run: ShieldedRun | undefined;
    let sizes: TreeSizes | undefined;
    // History's blocks are looked up whatever becomes of the crawl: what it
    // did find, and the transparent side, still deserve their txids and times.
    try {
      await initZcore();
      const tip = (this.#tip = await fetchLatestHeight());
      transparent = this.#syncTransparent(tip);
      sizes = await fetchTreeSizes();
      run = this.#newRun(tip, this.#abort.signal);
      await crawlRecent(run, sizes, this.#sizes);
    } finally {
      await transparent;
      await this.#finish(run, sizes);
      this.#recentRunning = false;
      console.log(
        `[sync] sync took ${((Date.now() - startTime) / 1000).toFixed(1)} s`,
      );
    }
    this.#sizes = sizes;
    this.#startHistory();
  };

  /** What a run leaves to do once its crawl ends, however it ends. */
  #finish = async (run?: ShieldedRun, sizes?: TreeSizes) => {
    const state = this.#state;
    await this.#placing;
    await this.#fetchBlocks();
    if (run && sizes) {
      await recoverSends(run, sizes, this.#authoredTxs()).catch((err) =>
        console.error("[sync] sends lookup failed", err),
      );
    }
    run?.lookups.terminate();
    state.pending = prunePending(state.pending, {
      spent: new Set(
        state.notes
          .filter((n) => n.spend.status === "spent")
          .map((n) => n.nf_mine),
      ),
      mined: new Set(this.#transparent?.txs.map((tx) => tx.txid)),
      tip: this.#tip,
    });
    this.#save();
    this.#emitProgress();
    await this.#saving;
  };

  /** Starts history or the spam era in the background, or says why neither runs. */
  #startHistory = () => {
    const { scan } = this.#state;
    const tip = this.#tip;
    const sizes = this.#sizes;
    if (!scan.setupDone || this.#history || !sizes || tip === undefined) return;
    if (this.#abort.signal.aborted || this.#recentRunning) return;
    const phase = backgroundPhase(scan, tip, this.#historyAllowed);
    if (phase !== "history" && phase !== "spam") {
      console.log(`[sync] background: ${phase}`);
      return this.#announce({ ...progressOf(scan, "spam", tip), phase });
    }

    const abort = new AbortController();
    const signal = AbortSignal.any([this.#abort.signal, abort.signal]);
    const run = this.#newRun(tip, signal);
    const startTime = Date.now();
    const done = crawlHistory(run, sizes, phase)
      .catch((err) => {
        console.error(`[sync] ${phase} failed`, err);
        return false;
      })
      .then(async (complete) => {
        await this.#finish(run, sizes);
        console.log(
          `[sync] ${phase} ${complete ? "done" : "stopped"} after ${((Date.now() - startTime) / 1000).toFixed(1)} s`,
        );
        return complete;
      })
      .finally(() => {
        if (this.#history?.done === done) this.#history = undefined;
      });
    this.#history = { phase, abort, done };
    // History done: on to the spam era, or why it waits.
    done.then((complete) => complete && this.#startHistory());
  };

  #stopHistory = async () => {
    this.#history?.abort.abort();
    await this.#history?.done;
    this.#history = undefined;
  };

  /** Push the given swap to the state. */
  pushSwap = async (
    depositAddress: string,
    outbound: boolean,
    originChainTxHashes: { hash: string; explorerUrl: string }[],
  ) => {
    this.#state.swaps ??= [];
    this.#state.swaps.push({ depositAddress, outbound, originChainTxHashes });
    this.#save();
  };

  /** Get all the swaps in the state. */
  getSwaps = () => {
    return this.#state.swaps;
  };

  /** Runs history on every core, or back on 2, for the rest of this session. */
  setSpeedUp = (on: boolean) => {
    this.#speedUp = on;
    this.#emitProgress();
  };

  /** Starts the spam era's sync, or pauses it; the account remembers which. */
  setSpamSync = async (on: boolean) => {
    this.#state.scan.spamSync = on;
    this.#save();
    if (!on && this.#history?.phase === "spam") await this.#stopHistory();
    this.#startHistory();
  };

  /** Lets history download although the browser saves data. */
  downloadHistory = () => {
    this.#historyAllowed = true;
    if (!this.#recentRunning) this.#startHistory();
  };

  /**
   * Transparent takes seconds, so it lands long before the shielded crawl;
   * announcing it on arrival shows that balance straight away. Blocks are
   * fetched now too: a new transparent transaction's, and recent ones a reorg
   * may have replaced.
   */
  #syncTransparent = (tip: number) =>
    syncTransparent(
      this.#state.transparent,
      this.id,
      tip,
      this.#info?.transparentIndex ?? 0,
    )
      .then(({ cache, view }) => {
        // Read on landing: an unshield may have reserved an address meanwhile.
        const reserved = keepReserved(this.#state.transparent?.reserved, cache);
        this.#state.transparent = { ...cache, reserved };
        this.#transparent = view;
        this.#transparentSynced = true;
        this.#save();
        this.#emitProgress();
        return this.#fetchBlocks();
      })
      .catch((err) => console.error("[sync] transparent failed", err));

  #authoredTxs = () =>
    authoredTxs(
      this.#state.notes,
      this.#transparent?.txs ?? [],
      this.#state.blocks,
    );

  /**
   * Fetches the blocks behind every transaction in history, once each: they
   * give shielded transactions their txids, which is what lets a transaction
   * seen from both sides show once, and every entry its time.
   */
  #fetchBlocks = async () => {
    const tip = this.#tip;
    const { notes, sent, blocks } = this.#state;
    const history = [
      ...activityHeights(notes, sent, this.#transparent?.txs ?? []),
    ];
    const missing = history.filter((height) => !blocks.has(height));
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
    const fetched = await Promise.allSettled(heights.map(fetchBlock));
    fetched.forEach((block, i) => {
      if (block.status === "fulfilled") {
        blocks.set(heights[i], block.value);
        this.#freshBlocks.add(heights[i]);
      } else
        console.error("[sync] block lookup failed", heights[i], block.reason);
    });
    if (heights.length) this.#save();
    await this.#fetchTxs();
    this.#emitProgress();
  };

  /** History's transactions in full: those fetched, and those the transparent sync read. */
  #fullTxs = () =>
    new Map<string, ParsedTx>([
      ...(this.#state.transparent?.txs ?? []).map(
        (tx) => [tx.txid, tx] as const,
      ),
      ...this.#state.txs,
    ]);

  /**
   * Fetches in full each transaction history reads that way, once: a txid
   * fixes its contents, so it's kept for good. One that fails is asked for
   * next sync.
   */
  #fetchTxs = async () => {
    const { notes, blocks } = this.#state;
    const known = this.#fullTxs();
    const txids = txidsToRead(notes, this.#transparent?.txs ?? [], blocks);
    const missing = [...txids].filter((txid) => !known.has(txid));
    if (!missing.length) return;
    await initZcore();
    const { txs } = this.#state;
    const fetched = await Promise.allSettled(missing.map(fetchTransaction));
    fetched.forEach((raw, i) => {
      if (raw.status === "fulfilled") {
        const { data, height } = raw.value;
        txs.set(missing[i], parse_transaction(NETWORK, height, data));
      } else console.error("[sync] tx lookup failed", missing[i], raw.reason);
    });
    this.#save();
  };

  /**
   * Stores the state as it is when the write starts. Calls made while one
   * write runs share the next, so a sync's many changes cost few writes.
   */
  #save = () => {
    this.#dirty = true;
    this.#saving = this.#saving
      .then(async () => {
        if (!this.#dirty || !this.#key) return;
        this.#dirty = false;
        await saveState(this.#state, this.#key);
      })
      .catch((err) => console.error("[sync] save failed", err));
  };

  // Both wait for what storage holds, so a query on mount never reads an
  // empty wallet first.
  async getBalance() {
    await this.#seed();
    const { notes, pending, blocks } = this.#state;
    const utxos = this.#transparent?.utxos ?? [];
    const tip = this.#tip;
    const now =
      tip === undefined
        ? undefined
        : await spendableNow(
            walletData(tip, spendable(notes, utxos, pending), blocks),
          );
    return balances(notes, utxos, pending, now);
  }

  /** Newest first, pending transactions on top until sync finds them mined. */
  async getTransactionHistory(): Promise<{
    activities: Activity[];
    swaps: (CheckSwapExecutionStatusResponse & { outbound: boolean })[];
  }> {
    await this.#seed();
    const { notes, sent, blocks, pending, swaps } = this.#state;
    // Request all swap statuses
    const swapDetails = await Promise.all(
      (swaps ?? []).map(({ depositAddress, originChainTxHashes, outbound }) => {
        const statusUrl = new URL("https://1click.chaindefuser.com/v0/status");
        statusUrl.searchParams.append("depositAddress", depositAddress);

        // Return the fetch promise
        return fetch(statusUrl)
          .then(async (response) => {
            if (!response.ok) {
              throw new Error("Network response was not ok");
            }
            const responseJson = await response.json();
            responseJson.swapDetails.originChainTxHashes.push(
              ...originChainTxHashes,
            );
            const augResponseJson = { ...responseJson, outbound: outbound };
            return augResponseJson;
          })
          .catch((error) => {
            console.log(`Failed for ${depositAddress}:`, error);
            return null; // Return null (or a custom flag) on error
          });
      }),
    );
    // Filter out the pending transactions covered by swaps
    const pendingFiltered = pending.filter((p) => {
      return !swapDetails.some((swap) => {
        if (swap == null) return false;
        const destHashes = swap.swapDetails?.destinationChainTxHashes || [];
        const origHashes = swap.swapDetails?.originChainTxHashes || [];
        return destHashes
          .concat(origHashes)
          .some((chainTxHash: TxHashDetails) => chainTxHash.hash == p.txid);
      });
    });
    // Until the transparent side names our addresses, an unshield to one of
    // them would read as a payment.
    const addresses = this.#transparent?.addresses;
    const history = buildActivity(
      notes,
      sent,
      this.#transparent?.txs ?? [],
      blocks,
      addresses && this.#fullTxs(),
      addresses,
    );
    // Filter out the history that's covered by swaps
    const historyFiltered = history.filter((p) => {
      return !swapDetails.some((swap) => {
        if (swap == null) return false;
        const destHashes = swap.swapDetails?.destinationChainTxHashes || [];
        const origHashes = swap.swapDetails?.originChainTxHashes || [];
        return destHashes
          .concat(origHashes)
          .some((chainTxHash: TxHashDetails) => chainTxHash.hash == p.txid);
      });
    });
    const mined = new Set(history.map((tx) => tx.txid));

    return {
      swaps: swapDetails,
      activities: [
        ...pendingActivity(pendingFiltered, mined),
        ...confirmedAt(historyFiltered, this.#tip),
      ],
    };
  }

  /**
   * What a send may spend at the chain tip. Throws before the tip is known, or
   * with `coins` before this session's transparent sync: they may have moved.
   */
  /** What zcore plans from; `keep` limits the notes it may spend. */
  #walletData = (coins: boolean, keep?: (note: Note) => boolean) => {
    const tip = this.#tip;
    invariant(tip !== undefined, "The wallet is still syncing");
    invariant(!coins || this.#transparentSynced, "The wallet is still syncing");
    const { notes, pending, blocks } = this.#state;
    const free = spendable(notes, this.#transparent?.utxos ?? [], pending);
    return walletData(
      tip,
      {
        notes: keep ? free.notes.filter(keep) : free.notes,
        utxos: coins ? free.utxos : [],
      },
      blocks,
    );
  };

  /** The payment link transaction `txid` funded, if it funded one. */
  linkOf = async (txid: string): Promise<SentOutput | undefined> => {
    const { sent, blocks } = this.#state;
    return sent.find(
      (s) =>
        s.link &&
        s.pool === "ironwood" &&
        blocks.get(s.height)?.txids.get(s.tx_index) === txid,
    );
  };

  planSend = (send: SendRequest, keep?: (note: Note) => boolean) =>
    planSend(this.#walletData(send.from === "transparent", keep), send);

  maxSend = (send: SendRequest) =>
    maxSend(this.#walletData(send.from === "transparent"), send);

  planMigration = () => planMigration(this.#walletData(false));

  /** The migration in progress, if any, its next step, and what's pending. */
  migration = () => {
    const migration = this.#state.migration;
    if (!migration) return null;
    const { notes } = spendable(this.#state.notes, [], this.#state.pending);
    const orchard = notes
      .filter((n) => n.pool === "orchard")
      .map(({ value, height }) => ({ value, height }));
    const pending = new Set(this.#state.pending.map((p) => p.txid));
    return {
      migration,
      next: nextStep(migration, orchard, pending),
      pending,
      tip: this.#tip,
    };
  };

  startMigration = (plan: MigrationPlan) => {
    this.#state.migration = startMigration(plan);
    this.#save();
  };

  stopMigration = () => {
    delete this.#state.migration;
    this.#save();
  };

  /** Records that a migration step went out as `txid` (see `stepSent`). */
  migrationStepSent = (
    kind: "preparation" | "transfer",
    index: number,
    txid: string,
  ) => {
    const migration: Migration | undefined = this.#state.migration;
    invariant(migration, "No migration in progress");
    invariant(this.#tip !== undefined, "The wallet is still syncing");
    stepSent(migration, kind, index, txid, this.#tip);
    this.#save();
  };

  /**
   * What a preparation plans from: zcore spends every Orchard note it's
   * given, so the notes made for transfers still to send are left out.
   */
  #preparationData = () => {
    const { migration, notes, pending } = this.#state;
    invariant(migration, "No migration in progress");
    const orchard = spendable(notes, [], pending).notes.filter(
      (n) => n.pool === "orchard",
    );
    const spare = new Set(spareNotes(migration, orchard));
    return this.#walletData(false, (n) => n.pool !== "orchard" || spare.has(n));
  };

  planPreparation = (parts: number[]) =>
    planPreparation(this.#preparationData(), parts);

  /** The next preparation, for the keychain to build. */
  preparationTx = async (parts: number[]) => {
    const { tx, plan } = await preparationTx(this.#preparationData(), parts);
    return { tx: { ...tx, account: this.id }, plan, changeTo: undefined };
  };

  /**
   * `send` for the keychain to build, and `changeTo`: the internal address
   * index its transparent change goes to, to record once it's sent.
   */
  sendTx = async (send: SendRequest, keep?: (note: Note) => boolean) => {
    const coins = send.from === "transparent";
    // Shielded sends need it too: zcore names it as ours when an unshield pays it.
    const internal = await this.internalAddress();
    const built = await sendTx(
      this.#walletData(coins, keep),
      send,
      internal?.index,
    );
    const transparentChange = built.plan.steps.some((step) =>
      step.change.some((c) => c.pool === "transparent"),
    );
    return {
      tx: { ...built.tx, account: this.id },
      plan: built.plan,
      changeTo: transparentChange ? internal?.index : undefined,
    };
  };

  /**
   * Shielding every transparent coin into Ironwood, for the keychain to
   * build, what it shields, and its fee.
   */
  proposeShield = async () => {
    const { tx, plan } = await shieldTx(this.#walletData(true));
    const shielded = plan.steps
      .flatMap((s) => s.change)
      .reduce((sum, c) => sum + BigInt(c.value), 0n);
    return {
      tx: { ...tx, account: this.id },
      value: shielded,
      fee: BigInt(plan.fee),
    };
  };

  /**
   * Broadcasts a transaction the keychain proved, then holds the notes and
   * coins it spends out of the balance and of new plans until it's mined or
   * expires. `change` is what it returns to us, by pool, shown as pending
   * meanwhile, and `receipt` what history lists for it, timed at the
   * broadcast.
   */
  submit = async (
    proved: ProvedTx,
    change: Record<Source, bigint>,
    receipt: Omit<PendingActivity, "timestamp">,
    onStage?: (stage: ProveStage) => void,
  ) => {
    const { txid, raw, expiryHeight } = await broadcastTransaction(
      proved,
      onStage,
    );
    const timestamp = Math.floor(Date.now() / 1000);
    const tip = this.#tip;
    invariant(tip !== undefined, "The wallet is still syncing");
    await initZcore();
    const tx = parse_transaction(NETWORK, tip, raw) as {
      inputs: { txid: string; index: number }[];
      nullifiers: string[];
    };
    this.#state.pending.push({
      txid,
      expiryHeight,
      nullifiers: tx.nullifiers,
      outpoints: tx.inputs.map((i) => `${i.txid}:${i.index}`),
      change: Number(change.shielded + change.transparent),
      transparentChange: Number(change.transparent),
      receipt: { ...receipt, timestamp },
    });
    this.#save();
    this.#emitProgress();
    return { txid, expiryHeight, timestamp };
  };

  /** The next internal address, shown nowhere; see `nextInternalAddress` for when it's null. */
  internalAddress = async () => {
    await this.#seed();
    return nextInternalAddress(this.#state.transparent, this.id);
  };

  /** Records a transaction paying `internalAddress()`'s `index`, so the next one goes elsewhere. */
  internalAddressUsed = async (index: number, expiryHeight: number) => {
    await this.#seed();
    this.#state.transparent = reserveInternalAddress(
      this.#state.transparent,
      index,
      expiryHeight,
    );
    this.#save();
    await this.#saving;
  };
}
