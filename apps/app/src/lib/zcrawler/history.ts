import type { TransactionReceipt } from "../sdk/types";
import type { Block } from "./lightwalletd";
import type { TransparentTx } from "./transparent";
import type { Note, Sent, TxLocator } from "./types";

/** A shielded transaction's identity until its block names it. */
export const locatorId = ({ height, tx_index }: TxLocator) =>
  `${height}_${tx_index}`;

/** Everything one transaction did to this wallet's shielded notes. */
type TxGroup = {
  locator: TxLocator;
  received: Note[];
  /** Notes this transaction spent — they were received in an earlier one. */
  spent: Note[];
  sent: Sent[];
  /** What it paid to transparent addresses not ours. */
  paid: Payment[];
};

/** A transparent output a transaction of ours paid to someone else. */
export type Payment = {
  value: number;
  /** Absent for a script that pays no single address. */
  recipient?: string;
};

/** One transaction, from either side or both. */
type Entry = {
  height: number;
  shielded?: TxGroup;
  transparent?: TransparentTx;
};

const max0 = (n: bigint) => (n > 0n ? n : 0n);

const sum = (of: { value: number }[]) =>
  of.reduce((total, { value }) => total + BigInt(value), 0n);

/** A shielded group's net effect, and what it shows as on its own. */
function shieldedSide({ received, spent, sent, paid }: TxGroup) {
  // What we know left the wallet: shielded outputs recovered, transparent
  // ones read from the block. Without either, fall back to what the inputs
  // were worth net of change, fee included.
  const out = [...sent, ...paid];
  const outgoing = out.length > 0 || spent.length > 0;
  const outflow = out.length ? sum(out) : sum(spent) - sum(received);
  const pools = new Set([
    ...[...received, ...spent, ...sent].map((p) => p.pool),
    ...(paid.length ? (["transparent"] as const) : []),
  ]);
  // A transaction can pay us several notes (padding, change, a payment):
  // its memo is whichever one has it.
  const memo = (sent.length ? sent : received).find((p) => p.memo)?.memo;
  return {
    value: outgoing ? -outflow : sum(received),
    // With every output accounted for, what our inputs held beyond them is
    // the fee; every shielded input is ours, since only we can spend them.
    // Below zero means an input was never found, so the fee is unknown.
    fee: out.length ? max0(sum(spent) - sum(received) - sum(out)) : 0n,
    pool: pools.size === 1 ? [...pools][0] : ("mixed" as const),
    memo,
    // Only a send knows its counterparty: on the receiving side the
    // recipient is our own address, and the sender is never revealed.
    to_address: (sent[0] ?? paid[0])?.recipient,
  };
}

function receipt(
  txid: string,
  { height, shielded, transparent }: Entry,
  time?: number,
): TransactionReceipt {
  const base = {
    txid,
    fee: 0n,
    block_height: height,
    confirmations: 0,
    status: "Confirmed" as const,
    timestamp: time,
    from_address: undefined,
  };
  // An entry holds at least one side.
  const s = shielded && shieldedSide(shielded);
  const side = s && { memo: s.memo, pool: s.pool, to_address: s.to_address };
  if (!transparent) {
    return {
      ...base,
      ...side!,
      tx_type: s!.value < 0n ? "Sent" : "Received",
      value: s!.value,
      fee: s!.fee,
    };
  }

  const t = transparent.received - transparent.spent;
  if (!s || !side) {
    return {
      ...base,
      tx_type: t >= 0n ? "Received" : "Sent",
      value: t,
      memo: undefined,
      pool: "transparent",
      from_address: transparent.from,
      to_address: transparent.to,
    };
  }
  // Both sides: whatever the two don't account for between them is the fee.
  const fee = max0(-(s.value + t));
  // Addresses are only ever transparent ones: a shielded side shows as such.
  if (t > 0n && s.value < 0n) {
    return {
      ...base,
      ...side,
      tx_type: "Unshielded",
      value: t,
      fee,
      to_address: transparent.to,
    };
  }
  if (t < 0n && s.value > 0n) {
    return {
      ...base,
      ...side,
      tx_type: "Shielded",
      value: s.value,
      fee,
      from_address: transparent.from,
    };
  }
  const value = s.value + t;
  return {
    ...base,
    ...side,
    from_address: transparent.from,
    to_address: side.to_address ?? transparent.to,
    pool: "mixed",
    tx_type: value < 0n ? "Sent" : "Received",
    value,
  };
}

/**
 * One entry per transaction, newest first, across both sides: a transaction
 * that moved funds between transparent and shielded shows once, as Shielded
 * or Unshielded, with its fee. `paid` holds what our sending transactions
 * paid to others' transparent addresses, by `locatorId`.
 *
 * Shielded transactions are named through `blocks`; one whose block isn't
 * there yet keeps a placeholder id and can't be matched with its
 * transparent side.
 */
export function buildHistory(
  notes: Note[],
  sent: Sent[],
  transparent: TransparentTx[],
  blocks: Map<number, Block>,
  paid = new Map<string, Payment[]>(),
): TransactionReceipt[] {
  const groups = new Map<string, TxGroup>();
  const at = (locator: TxLocator) => {
    const id = locatorId(locator);
    let group = groups.get(id);
    if (!group) {
      group = {
        locator,
        received: [],
        spent: [],
        sent: [],
        paid: paid.get(id) ?? [],
      };
      groups.set(id, group);
    }
    return group;
  };
  for (const note of notes) {
    at(note).received.push(note);
    if (typeof note.spent === "object") at(note.spent).spent.push(note);
  }
  for (const out of sent) at(out).sent.push(out);

  const entries = new Map<string, Entry>();
  for (const group of groups.values()) {
    const { height, tx_index } = group.locator;
    const txid =
      blocks.get(height)?.txids.get(tx_index) ?? locatorId(group.locator);
    entries.set(txid, { height, shielded: group });
  }
  for (const tx of transparent) {
    const entry = entries.get(tx.txid) ?? { height: tx.height };
    entries.set(tx.txid, { ...entry, transparent: tx });
  }

  return [...entries]
    .map(([txid, entry]) =>
      receipt(txid, entry, blocks.get(entry.height)?.time),
    )
    .sort((a, b) => b.block_height - a.block_height);
}

/** Every height history names, so their blocks can be fetched. */
export function historyHeights(
  notes: Note[],
  sent: Sent[],
  transparent: TransparentTx[],
) {
  return new Set([
    ...notes.flatMap((n) =>
      typeof n.spent === "object" ? [n.height, n.spent.height] : [n.height],
    ),
    ...sent.map((s) => s.height),
    ...transparent.map((t) => t.height),
  ]);
}
