/**
 * Transparent balance and history: addresses derived offline from the viewing
 * key, their activity read from lightwalletd. What a sync learns is kept, so
 * the next one asks only about blocks since, and nothing at an unmoved tip.
 */

import initZcore, {
  derive_transparent,
  parse_transaction,
} from "@zillions/zcore";
import { loadTransparent, saveTransparent } from "./db";
import {
  fetchAddressTransactions,
  fetchLatestHeight,
  fetchTransaction,
  fetchUtxos,
  type RawTransaction,
  type Utxo,
} from "./lightwalletd";

const NETWORK = import.meta.env.VITE_ZCASH_NETWORK ?? "main";

/** Unused addresses in a row after which a chain counts as exhausted (BIP-44). */
const GAP_LIMIT = 20;

/** Blocks below the tip a reorg can still replace; zcashd refuses deeper ones. */
export const REORG_DEPTH = 100;

const SCOPES = ["external", "internal"] as const;

type Scope = (typeof SCOPES)[number];

/** A UTXO with where its address sits on the account's chains: what spending it needs. */
export type OwnUtxo = Utxo & { scope: Scope; address_index: number };

let ready: Promise<unknown> | undefined;

/** `parse_transaction`'s result. Txids are in explorer byte order. */
interface ParsedTx {
  txid: string;
  inputs: { txid: string; index: number }[];
  outputs: { index: number; value: number; address?: string }[];
}

export interface TransparentCache {
  id: string;
  tip: number;
  /** Heights up to here are past any reorg; the ones above are fetched again. */
  final: number;
  /** Per chain: the highest address index used, and how many were checked. */
  chains: Record<Scope, { lastUsed: number; checked: number }>;
  txs: (ParsedTx & { height: number })[];
  /** The address an input spent from, by the `txid:index` it names. */
  senders: Record<string, string>;
  utxos: Utxo[];
}

const emptyCache = (id: string): TransparentCache => ({
  id,
  tip: 0,
  final: 0,
  chains: {
    external: { lastUsed: -1, checked: 0 },
    internal: { lastUsed: -1, checked: 0 },
  },
  txs: [],
  senders: {},
  utxos: [],
});

/** One transaction's effect on the wallet's transparent funds. */
export interface TransparentTx {
  txid: string;
  height: number;
  /** Paid to our addresses. */
  received: bigint;
  /** Our earlier outputs this transaction spent. */
  spent: bigint;
  /** Where the funds came from: our address it spent from, else the sender's. */
  from?: string;
  /** Where they went: ours if paid to us, else the outside address it paid. */
  to?: string;
}

/** A coinbase input spends nothing; its prevout txid is all zeros. */
const COINBASE = "0".repeat(64);

/** The address that received the output an input spends, from its transaction. */
async function senderOf(input: ParsedTx["inputs"][number]) {
  if (input.txid === COINBASE) return undefined;
  const raw = await fetchTransaction(input.txid);
  const tx: ParsedTx = parse_transaction(NETWORK, raw.height, raw.data);
  return tx.outputs[input.index]?.address;
}

/**
 * One chain's activity up to `tip`, until `GAP_LIMIT` addresses in a row show
 * none; addresses already checked are asked only about blocks above `final`.
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
  let from = 0;
  for (; from <= lastUsed + GAP_LIMIT; from += GAP_LIMIT) {
    const window = derive_transparent(NETWORK, ufvk, scope, from, GAP_LIMIT);
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

export async function syncTransparent(
  accountId: string,
  ufvk: string,
): Promise<{ utxos: OwnUtxo[]; txs: TransparentTx[]; tip: number }> {
  await (ready ??= initZcore());
  const cache = (await loadTransparent(accountId)) ?? emptyCache(accountId);
  const tip = await fetchLatestHeight();

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

  // Every address checked is ours, used or not.
  const mine = new Map(
    SCOPES.flatMap((scope) =>
      derive_transparent(NETWORK, ufvk, scope, 0, chains[scope].checked).map(
        (address, address_index) =>
          [address, { scope, address_index }] as const,
      ),
    ),
  );
  if (moved) utxos = await fetchUtxos([...mine.keys()]);

  const { senders } = cache;
  const sender = async (input: ParsedTx["inputs"][number]) => {
    const key = `${input.txid}:${input.index}`;
    if (!(key in senders)) {
      const address = await senderOf(input).catch(() => undefined);
      if (address) senders[key] = address;
    }
    return senders[key];
  };

  // Each of our outputs, so the input that later spends it can be priced
  // and placed: an input names only the output it consumes.
  const ours = new Map<string, { value: bigint; address: string }>();
  for (const tx of parsed.values()) {
    for (const out of tx.outputs) {
      if (out.address && mine.has(out.address)) {
        ours.set(`${tx.txid}:${out.index}`, {
          value: BigInt(out.value),
          address: out.address,
        });
      }
    }
  }

  const txs = await Promise.all(
    [...parsed.values()].map(async ({ txid, height, inputs, outputs }) => {
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
        spent: spent.reduce((sum, own) => sum + own.value, 0n),
        // Funds from outside name their sender only in the transaction that
        // paid it, so that one is fetched.
        from: spent[0]?.address ?? (inputs[0] && (await sender(inputs[0]))),
        // Only a payer names an outside recipient; paid to us, it's our address.
        to: spent.length
          ? (paid?.address ?? received[0]?.address)
          : received[0]?.address,
      };
    }),
  );

  await saveTransparent({
    id: accountId,
    tip,
    final: tip - REORG_DEPTH,
    chains,
    txs: [...parsed.values()],
    senders,
    utxos,
  });
  return {
    utxos: utxos.map((utxo) => ({ ...utxo, ...mine.get(utxo.address)! })),
    txs,
    tip,
  };
}
