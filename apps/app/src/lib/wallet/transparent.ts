/**
 * Transparent balance and history: addresses derived offline from the viewing
 * key, their activity read from lightwalletd. What a sync learns is kept, so
 * the next one asks only about blocks since, and nothing at an unmoved tip.
 */

import initZcore, {
  derive_transparent,
  gap_limits,
  parse_transaction,
} from "@zillions/zcore";
import {
  fetchAddressTransactions,
  fetchUtxos,
  type RawTransaction,
  type Utxo,
} from "./chain/lightwalletd";
import { NETWORK } from "./config";

/** Unused addresses in a row that end a chain, from zcore once it's loaded. */
const gapLimits = () => gap_limits() as Record<Scope, number>;

/** Blocks below the tip a reorg can still replace; zcashd refuses deeper ones. */
export const REORG_DEPTH = 100;

const SCOPES = ["external", "internal"] as const;

type Scope = (typeof SCOPES)[number];

/** A UTXO with where its address sits on the account's chains: what spending it needs. */
export type OwnUtxo = Utxo & { scope: Scope; address_index: number };

let ready: Promise<unknown> | undefined;

/** `parse_transaction`'s result. Txids are in explorer byte order. */
export interface ParsedTx {
  txid: string;
  /** `address` is the sender's, when the input spends a P2PKH coin. */
  inputs: { txid: string; index: number; address?: string }[];
  outputs: { index: number; value: number; address?: string }[];
  /** What leaves the shielded pools, net: the fee is this plus the inputs' value less the outputs'. */
  value_balance: number;
  /** 0 for none. */
  expiry_height: number;
}

export interface TransparentCache {
  tip: number;
  /** Heights up to here are past any reorg; the ones above are fetched again. */
  final: number;
  /** Per chain: the highest address index used, and how many were checked. */
  chains: Record<Scope, { lastUsed: number; checked: number }>;
  txs: (ParsedTx & { height: number })[];
  utxos: Utxo[];
  /** Internal addresses paid by transactions not yet seen mined, until they expire. */
  reserved?: { index: number; expiryHeight: number }[];
}

const emptyCache = (): TransparentCache => ({
  tip: 0,
  final: 0,
  chains: {
    external: { lastUsed: -1, checked: 0 },
    internal: { lastUsed: -1, checked: 0 },
  },
  txs: [],
  utxos: [],
});

/** One transaction's effect on the wallet's transparent funds. */
export interface TransparentTx {
  txid: string;
  height: number;
  /** Paid to our addresses. */
  received: bigint;
  /** Of `received`, what our receiving (external) addresses got: not change. */
  receiving: bigint;
  /** Our earlier outputs this transaction spent. */
  spent: bigint;
  /** Where they went: ours if paid to us, else the outside address it paid. */
  to?: string;
  /** It spent no transparent coin: its funds came from a shielded pool. */
  shielded?: true;
}

/**
 * One chain's activity up to `tip`, until its gap limit of addresses in a row
 * show none; addresses already checked are asked only about blocks above `final`.
 */
async function discover(
  ufvk: string,
  scope: Scope,
  tip: number,
  final: number,
  known: TransparentCache["chains"][Scope],
) {
  const txs: RawTransaction[] = [];
  let { lastUsed } = known;
  const gap = gapLimits()[scope];
  let from = 0;
  for (; from <= lastUsed + gap; from += gap) {
    const window = derive_transparent(NETWORK, ufvk, scope, from, gap);
    const activity = await Promise.all(
      window.map((address, i) =>
        fetchAddressTransactions(
          address,
          from + i < known.checked ? final + 1 : 1,
          tip,
        ),
      ),
    );
    activity.forEach((found, i) => {
      if (!found.length) return;
      lastUsed = Math.max(lastUsed, from + i);
      txs.push(...found);
    });
  }
  return { txs, chain: { lastUsed, checked: from } };
}

/** Our view of the transparent side: coins, transactions and addresses. */
export type TransparentView = Awaited<ReturnType<typeof transparentState>>;

/**
 * Brings `stored` up to `tip`. The new cache carries no reserved addresses:
 * an unshield may reserve one meanwhile, so `keepReserved` merges them in
 * from whatever is stored once this lands.
 */
export async function syncTransparent(
  stored: TransparentCache | undefined,
  ufvk: string,
  tip: number,
) {
  await (ready ??= initZcore());
  const cache = stored ?? emptyCache();

  const moved = tip !== cache.tip;
  // Above `final` a reorg may have replaced them: they're fetched again.
  const kept = moved
    ? cache.txs.filter((tx) => tx.height <= cache.final)
    : cache.txs;
  // A transaction touching two of our addresses arrives once for each.
  const parsed = new Map(kept.map((tx) => [tx.txid, tx]));
  let { chains, utxos } = cache;
  if (moved) {
    const found = await Promise.all(
      SCOPES.map((scope) =>
        discover(ufvk, scope, tip, cache.final, cache.chains[scope]),
      ),
    );
    for (const raw of found.flatMap(({ txs }) => txs)) {
      const tx: ParsedTx = parse_transaction(NETWORK, raw.height, raw.data);
      parsed.set(tx.txid, { ...tx, height: raw.height });
    }
    chains = { external: found[0].chain, internal: found[1].chain };
  }

  const mine = ownAddresses(ufvk, chains);
  if (moved) utxos = await fetchUtxos([...mine.keys()]);
  const state = transparentState(mine, [...parsed.values()], utxos);

  const synced: TransparentCache = {
    tip,
    final: tip - REORG_DEPTH,
    chains,
    txs: [...parsed.values()],
    utxos,
  };
  return { cache: synced, view: state };
}

/** `reserved` less the addresses `cache` shows used and the transactions expired by its tip. */
export const keepReserved = (
  reserved: TransparentCache["reserved"],
  cache: TransparentCache,
) =>
  // Expiry 0 means the transaction never expires.
  reserved?.filter(
    (r) =>
      r.index > cache.chains.internal.lastUsed &&
      (r.expiryHeight === 0 || r.expiryHeight > cache.tip),
  );

/** The transparent side as `cache` left it, without asking the chain: what shows before a sync answers. */
export async function cachedTransparent(cache: TransparentCache, ufvk: string) {
  await (ready ??= initZcore());
  return transparentState(
    ownAddresses(ufvk, cache.chains),
    cache.txs,
    cache.utxos,
  );
}

/** Every address of ours checked, used or not. */
const ownAddresses = (ufvk: string, chains: TransparentCache["chains"]) =>
  new Map(
    SCOPES.flatMap((scope) =>
      derive_transparent(NETWORK, ufvk, scope, 0, chains[scope].checked).map(
        (address, address_index) =>
          [address, { scope, address_index }] as const,
      ),
    ),
  );

/** Our coins, each transaction's effect on our transparent funds, and our addresses. */
function transparentState(
  mine: ReturnType<typeof ownAddresses>,
  parsed: TransparentCache["txs"],
  utxos: Utxo[],
): {
  utxos: OwnUtxo[];
  txs: TransparentTx[];
  addresses: Set<string>;
} {
  // Each of our outputs, so the input that later spends it can be priced
  // and placed: an input names only the output it consumes.
  const ours = new Map<string, { value: bigint; address: string }>();
  for (const tx of parsed) {
    for (const out of tx.outputs) {
      if (out.address && mine.has(out.address)) {
        ours.set(`${tx.txid}:${out.index}`, {
          value: BigInt(out.value),
          address: out.address,
        });
      }
    }
  }

  const txs = parsed.map(({ txid, height, inputs, outputs }) => {
    const received = outputs.flatMap((out) => {
      const own = ours.get(`${txid}:${out.index}`);
      return own ? [own] : [];
    });
    const spent = inputs.flatMap((input) => {
      const own = ours.get(`${input.txid}:${input.index}`);
      return own ? [own] : [];
    });
    const paid = outputs.find((out) => out.address && !mine.has(out.address));
    return {
      txid,
      height,
      received: received.reduce((sum, own) => sum + own.value, 0n),
      receiving: received
        .filter((own) => mine.get(own.address)?.scope === "external")
        .reduce((sum, own) => sum + own.value, 0n),
      spent: spent.reduce((sum, own) => sum + own.value, 0n),
      // Only a payer names an outside recipient; paid to us, it's our address.
      to: spent.length
        ? (paid?.address ?? received[0]?.address)
        : received[0]?.address,
      ...(inputs.length ? {} : { shielded: true as const }),
    };
  });
  return {
    utxos: utxos.map((utxo) => ({ ...utxo, ...mine.get(utxo.address)! })),
    txs,
    addresses: new Set(mine.keys()),
  };
}

/**
 * The next internal address, for an unshield or transparent change: the first
 * neither used nor held by a pending transaction. Null before the first sync,
 * or while pending ones fill the gap limit: going past it would hide funds
 * from other wallets restoring the phrase.
 */
export async function nextInternalAddress(
  cache: TransparentCache | undefined,
  ufvk: string,
) {
  if (!cache) return null;
  const { lastUsed } = cache.chains.internal;
  const held = new Set(cache.reserved?.map((r) => r.index));
  await (ready ??= initZcore());
  for (
    let index = lastUsed + 1;
    index <= lastUsed + gapLimits().internal;
    index++
  ) {
    if (held.has(index)) continue;
    const [address] = derive_transparent(NETWORK, ufvk, "internal", index, 1);
    return { index, address };
  }
  return null;
}

/** Holds internal address `index` for a transaction paying it, until it's mined or expires. */
export const reserveInternalAddress = (
  cache: TransparentCache = emptyCache(),
  index: number,
  expiryHeight: number,
): TransparentCache => ({
  ...cache,
  reserved: [...(cache.reserved ?? []), { index, expiryHeight }],
});
