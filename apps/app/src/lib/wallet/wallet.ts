import initZcore, { parse_transaction, script_address } from "@zillions/zcore";

import { invariant } from "../invariant";
import { dedupe, singleton } from "../utils";
import {
  activityHeights,
  buildActivity,
  payments,
  sendingTxs,
} from "./activity";
import { balances, spendable, walletData } from "./balance";
import { fetchTreeSizes, type TreeSizes } from "./chain/indexer";
import { fetchBlock, fetchLatestHeight } from "./chain/lightwalletd";
import { submitTransaction } from "./chain/submit";
import { NETWORK } from "./config";
import { pendingActivity, prunePending } from "./pending";
import {
  maxSend,
  planMigration,
  planSend,
  sendPczt,
  type SendRequest,
  shieldPczt,
} from "./send";
import { CORES, workerChannel } from "./shielded/crawl";
import {
  progressOf,
  setupHeightFor,
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
  REORG_DEPTH,
  reserveInternalAddress,
  syncTransparent,
  type TransparentView,
} from "./transparent";
import type { Activity, PendingActivity, WalletState } from "./types";

export type SyncEventListener = (e: SyncProgress) => void;

/** Every phase on every core, hidden tab or not. */
const FRY = import.meta.env.VITE_ALLOW_CPU_TO_FRY === "true";

/** Whether the browser asks to save data (Chromium only). */
const saveData = () =>
  (navigator as { connection?: { saveData?: boolean } }).connection
    ?.saveData === true;

type Account = { seedFingerprint: string; hdIndex: number };

/** One account's wallet: its state, kept in storage and brought up to date by `sync`, and what the app reads and sends with. */
export class Wallet {
  readonly id: string;
  readonly #ufvk: string;
  /** Block height below which nothing is crawled. Absent means full history. */
  readonly #birthday?: number;

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
  #history?: { abort: AbortController; done: Promise<unknown> };
  /** Whether history may download: not when the browser saves data, unless asked. */
  #historyAllowed = !saveData();
  #speedUp = false;
  /** The tree sizes the last sync read to; history reads to them too. */
  #sizes?: TreeSizes;
  #recentRunning = false;

  constructor(options: { id: string; ufvk: string; birthday?: number }) {
    this.id = options.id;
    this.#ufvk = options.ufvk;
    this.#birthday = options.birthday;
    this.#state = emptyState(this.id);
    this.#seed();
  }

  free = () => {
    this.#abort.abort();
    this.#syncProgressListeners.clear();
  };

  #seed = singleton(async () => {
    this.#key = await storageKey(this.#ufvk);
    const stored = await loadState(this.id, this.#key);
    if (stored) this.#state = stored;
    const { notes, sent, transparent } = this.#state;
    if (transparent) {
      this.#transparent = await cachedTransparent(transparent, this.#ufvk);
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
    const progress = { ...this.#progress, spedUp: this.#speedUp, fry: FRY };
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
        : phase !== "history"
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

  #newRun = (
    tip: number,
    signal: AbortSignal,
    setupHeight: Promise<number>,
  ): ShieldedRun => ({
    ufvk: this.#ufvk,
    // An import's 0 means none: the whole history.
    birthday: this.#birthday || undefined,
    state: this.#state,
    tip,
    setupHeight,
    workers: this.#workers,
    applied: this.#applied,
    readChunks: new Set(),
    lookups: workerChannel(),
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
   * shares it, and pauses history meanwhile.
   */
  sync = dedupe(async () => {
    const startTime = Date.now();
    await this.#seed();
    await this.#stopHistory();
    this.#recentRunning = true;
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
      const birthday = this.#birthday || undefined;
      const setupHeight = (
        birthday
          ? Promise.resolve([
              setupHeightFor(tip, birthday),
              `birthday ${birthday}`,
            ] as const)
          : transparent.then(() => {
              const heights = this.#transparent?.txs.map((tx) => tx.height);
              const oldest = heights?.length ? Math.min(...heights) : undefined;
              const why =
                oldest === undefined
                  ? "a year back, no transparent history"
                  : `30 days before the oldest transparent transaction, ${oldest}`;
              return [setupHeightFor(tip, undefined, oldest), why] as const;
            })
      ).then(([height, why]) => {
        if (!this.#state.scan.setupDone) {
          console.log(
            `[sync] setup ends at height ${height} (${why}; never below 2,100,000 on mainnet)`,
          );
        }
        return height;
      });
      sizes = await fetchTreeSizes();
      run = this.#newRun(tip, this.#abort.signal, setupHeight);
      await crawlRecent(run, sizes);
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
  });

  /** What a run leaves to do once its crawl ends, however it ends. */
  #finish = async (run?: ShieldedRun, sizes?: TreeSizes) => {
    const state = this.#state;
    await this.#placing;
    await this.#fetchBlocks();
    if (run && sizes) {
      await recoverSends(run, sizes, this.#sendingTxs()).catch((err) =>
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

  /** Starts history in the background, or says why it waits or has nothing left. */
  #startHistory = () => {
    const { scan } = this.#state;
    const tip = this.#tip;
    const sizes = this.#sizes;
    if (!scan.setupDone || this.#history || !sizes || tip === undefined) return;
    if (this.#abort.signal.aborted) return;
    if (progressOf(scan, "history", tip).percentage === 100) {
      console.log("[sync] history: nothing left to read");
      return this.#announce({ phase: "done" });
    }
    if (!this.#historyAllowed) {
      console.log("[sync] history paused: the browser asks to save data");
      return this.#announce({ phase: "paused" });
    }

    const abort = new AbortController();
    const signal = AbortSignal.any([this.#abort.signal, abort.signal]);
    const run = this.#newRun(tip, signal, Promise.resolve(scan.setupHeight!));
    const startTime = Date.now();
    const done = crawlHistory(run, sizes)
      .catch((err) => {
        console.error("[sync] history failed", err);
        return false;
      })
      .then(async (complete) => {
        await this.#finish(run, sizes);
        console.log(
          `[sync] history ${complete ? "done" : "stopped"} after ${((Date.now() - startTime) / 1000).toFixed(1)} s`,
        );
        if (complete) this.#announce({ phase: "done" });
      })
      .finally(() => {
        if (this.#history?.done === done) this.#history = undefined;
      });
    this.#history = { abort, done };
  };

  #stopHistory = async () => {
    this.#history?.abort.abort();
    await this.#history?.done;
    this.#history = undefined;
  };

  /** Runs history on every core, or back on 2, for the rest of this session. */
  setSpeedUp = (on: boolean) => {
    this.#speedUp = on;
    this.#emitProgress();
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
    syncTransparent(this.#state.transparent, this.#ufvk, tip)
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

  #sendingTxs = () =>
    sendingTxs(
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
    this.#emitProgress();
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
    const { notes, pending } = this.#state;
    return balances(notes, this.#transparent?.utxos ?? [], pending);
  }

  /** Newest first, pending transactions on top until sync finds them mined. */
  async getTransactionHistory(): Promise<Activity[]> {
    await this.#seed();
    const { notes, sent, blocks, pending } = this.#state;
    const txs = this.#transparent?.txs ?? [];
    const addresses = this.#transparent?.addresses;
    await initZcore();
    // Until the transparent side names our addresses, an unshield to one of
    // them would read as a payment.
    const paid = addresses
      ? payments(this.#sendingTxs().values(), blocks, addresses, (script) =>
          script_address(NETWORK, script),
        )
      : undefined;
    const history = buildActivity(notes, sent, txs, blocks, paid, addresses);
    const mined = new Set(history.map((tx) => tx.txid));
    return [...pendingActivity(pending, mined), ...history];
  }

  /**
   * What a send may spend at the chain tip. Throws before the tip is known, or
   * with `coins` before this session's transparent sync: they may have moved.
   */
  #walletData = (coins: boolean) => {
    const tip = this.#tip;
    invariant(tip !== undefined, "The wallet is still syncing");
    invariant(!coins || this.#transparentSynced, "The wallet is still syncing");
    const { notes, pending, blocks } = this.#state;
    const free = spendable(notes, this.#transparent?.utxos ?? [], pending);
    return walletData(
      tip,
      { notes: free.notes, utxos: coins ? free.utxos : [] },
      blocks,
    );
  };

  planSend = (send: SendRequest) =>
    planSend(this.#walletData(send.from === "transparent"), send);

  maxSend = (send: SendRequest) =>
    maxSend(this.#walletData(send.from === "transparent"), send);

  planMigration = () => planMigration(this.#walletData(false));

  /**
   * The unsigned PCZT for `send`, for the keychain account that signs it, and
   * `changeTo`: the internal address index its transparent change goes to, to
   * record once it's sent.
   */
  sendPczt = async (send: SendRequest, account: Account) => {
    const coins = send.from === "transparent";
    const internal = coins ? await this.internalAddress() : null;
    const built = await sendPczt(
      this.#walletData(coins),
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
  proposeShield = async (account: Account) => {
    const { pczt, plan } = await shieldPczt(
      this.#walletData(true),
      this.#ufvk,
      account,
    );
    const shielded = plan.steps
      .flatMap((s) => s.change)
      .reduce((sum, c) => sum + BigInt(c.value), 0n);
    return { pczt, value: shielded, fee: BigInt(plan.fee) };
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
    receipt: PendingActivity,
  ) => {
    const { txid, raw, expiryHeight } = await submitTransaction(signed);
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
      change: Number(change),
      receipt,
    });
    this.#save();
    this.#emitProgress();
    return { txid, expiryHeight };
  };

  /** The next internal address, shown nowhere; see `nextInternalAddress` for when it's null. */
  internalAddress = async () => {
    await this.#seed();
    return nextInternalAddress(this.#state.transparent, this.#ufvk);
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
