/**
 * Transparent balance and history: addresses derived offline from the viewing
 * key, their activity read from lightwalletd. Nothing is persisted; a sync
 * takes seconds, so each one starts over.
 */

import initZcore, {
  derive_transparent,
  parse_transaction,
} from "@zillions/zcore";
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

const SCOPES = ["external", "internal"] as const;

let ready: Promise<unknown> | undefined;

/** `parse_transaction`'s result. Txids are in explorer byte order. */
interface ParsedTx {
  txid: string;
  inputs: { txid: string; index: number }[];
  outputs: { index: number; value: number; address?: string }[];
}

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
 * The used addresses on one chain, walked until `GAP_LIMIT` in a row show no
 * activity, and the transactions touching them.
 */
async function discover(
  ufvk: string,
  scope: (typeof SCOPES)[number],
  tip: number,
) {
  const addresses: string[] = [];
  const txs: RawTransaction[] = [];
  for (
    let from = 0, lastUsed = -1;
    from <= lastUsed + GAP_LIMIT;
    from += GAP_LIMIT
  ) {
    const window = derive_transparent(NETWORK, ufvk, scope, from, GAP_LIMIT);
    const activity = await Promise.all(
      window.map((address) => fetchAddressTransactions(address, 1, tip)),
    );
    activity.forEach((found, i) => {
      if (!found.length) return;
      lastUsed = from + i;
      addresses.push(window[i]);
      txs.push(...found);
    });
  }
  return { addresses, txs };
}

export async function syncTransparent(
  ufvk: string,
): Promise<{ utxos: Utxo[]; txs: TransparentTx[] }> {
  await (ready ??= initZcore());
  const tip = await fetchLatestHeight();
  const chains = await Promise.all(
    SCOPES.map((scope) => discover(ufvk, scope, tip)),
  );
  const addresses = chains.flatMap((chain) => chain.addresses);
  const mine = new Set(addresses);
  const utxos = await fetchUtxos(addresses);

  // A transaction touching two of our addresses arrives once for each.
  const parsed = new Map<string, ParsedTx & { height: number }>();
  for (const raw of chains.flatMap((chain) => chain.txs)) {
    const tx: ParsedTx = parse_transaction(NETWORK, raw.height, raw.data);
    parsed.set(tx.txid, { ...tx, height: raw.height });
  }

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
        from:
          spent[0]?.address ??
          (inputs[0] && (await senderOf(inputs[0]).catch(() => undefined))),
        // Only a payer names an outside recipient; paid to us, it's our address.
        to: spent.length
          ? (paid?.address ?? received[0]?.address)
          : received[0]?.address,
      };
    }),
  );
  return { utxos, txs };
}
