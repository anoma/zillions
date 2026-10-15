import type { Block } from "./chain/lightwalletd";
import type { TransparentTx } from "./transparent";
import type { Activity, Note, Party, Pool, Sent, TxLocator } from "./types";

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
  /** What a transaction with no shielded side paid to others. */
  paid?: Payment[];
};

const max0 = (n: bigint) => (n > 0n ? n : 0n);

const sum = (of: { value: number }[]) =>
  of.reduce((total, { value }) => total + BigInt(value), 0n);

const SHIELDED: Party = { pool: "shielded" };
const TRANSPARENT: Party = { pool: "transparent" };

/** A shielded group's net effect, and what it shows as on its own. */
function shieldedSide({ received, spent, sent, paid }: TxGroup) {
  // What we know left the wallet: shielded outputs recovered, transparent
  // ones read from the block. Without either, fall back to what the inputs
  // were worth net of change, fee included.
  const out = [...sent, ...paid];
  // Recovery skips outputs that are ours, so a payment to our own address
  // is a note at an external one: change goes to internal ones.
  const self =
    spent.length && !out.length
      ? received.filter((n) => n.scope === "external")
      : [];
  const known = out.length > 0 || self.length > 0;
  const outgoing = out.length > 0 || spent.length > 0;
  const outflow = out.length
    ? sum(out)
    : self.length
      ? sum(self)
      : sum(spent) - sum(received);
  const pools = new Set([
    ...[...received, ...spent, ...sent].map((p) => p.pool),
    ...(paid.length ? (["transparent"] as const) : []),
  ]);
  // A transaction can pay us several notes (padding, change, a payment):
  // its memo is whichever one has it.
  const memo = (sent.length ? sent : received).find((p) => p.memo)?.memo;
  const [payee] = out;
  // Paying nobody else, what lands in a pool nothing was spent from moved
  // there: change stays in the pool it came from.
  const from = new Set(spent.map((n) => n.pool));
  const arrived = received.filter((n) => !from.has(n.pool));
  const moved = spent.length && !out.length ? sum(arrived) : 0n;
  if (moved > 0n) {
    const to = new Set(arrived.map((n) => n.pool));
    // Named only when it's one pool each side.
    const one = (pools: Set<Pool>): Party =>
      pools.size === 1 ? { pool: [...pools][0] } : SHIELDED;
    return {
      migrated: true,
      from: one(from),
      value: moved,
      fee: max0(sum(spent) - sum(received)),
      pool: "mixed" as const,
      memo,
      to: one(to),
    };
  }
  return {
    migrated: false,
    from: SHIELDED,
    value: outgoing ? -outflow : sum(received),
    // With every output accounted for, what our inputs held beyond them is
    // the fee; every shielded input is ours, since only we can spend them.
    // Below zero means an input was never found, so the fee is unknown.
    fee: known ? max0(sum(spent) - sum(received) - sum(out)) : 0n,
    pool: pools.size === 1 ? [...pools][0] : ("mixed" as const),
    memo,
    // Only a send knows its counterparty: on the receiving side the
    // recipient is our own address, and the sender is never revealed.
    to: payee?.recipient
      ? { address: payee.recipient }
      : paid.length
        ? TRANSPARENT
        : SHIELDED,
  };
}

function receipt(
  txid: string,
  { height, shielded, transparent, paid = [] }: Entry,
  ours: Set<string>,
  time?: number,
): Activity {
  const base = {
    txid,
    fee: 0n,
    block_height: height,
    confirmations: 0,
    status: "Confirmed" as const,
    timestamp: time,
    from: SHIELDED,
  };
  // Our own transparent addresses show as the pool: unshields each get a new
  // internal one, which nothing else shows.
  const party = (address: string | undefined): Party =>
    address && !ours.has(address) ? { address } : TRANSPARENT;
  // An entry holds at least one side.
  const s = shielded && shieldedSide(shielded);
  const side = s && { memo: s.memo, pool: s.pool, from: s.from, to: s.to };
  if (!transparent) {
    return {
      ...base,
      ...side!,
      tx_type: s!.migrated ? "Migrated" : s!.value < 0n ? "Sent" : "Received",
      value: s!.value,
      fee: s!.fee,
    };
  }

  const t = transparent.received - transparent.spent;
  if (!s || !side) {
    // Our coins pay what went to others and the fee; what came back is change.
    const value = paid.length ? -sum(paid) : t;
    return {
      ...base,
      tx_type: value >= 0n ? "Received" : "Sent",
      value,
      fee: paid.length ? max0(-t - sum(paid)) : 0n,
      memo: undefined,
      pool: "transparent",
      from: transparent.shielded ? SHIELDED : party(transparent.from),
      to: party(transparent.to),
    };
  }
  // Both sides: whatever the two don't account for between them is the fee.
  const fee = max0(-(s.value + t));
  if (t > 0n && s.value < 0n) {
    return {
      ...base,
      ...side,
      tx_type: "Unshielded",
      value: t,
      fee,
      to: party(transparent.to),
    };
  }
  if (t < 0n && s.value > 0n) {
    return {
      ...base,
      ...side,
      tx_type: "Shielded",
      value: s.value,
      fee,
      from: party(transparent.from),
      to: SHIELDED,
    };
  }
  // A payment recovered on the shielded side was also paid for by the
  // transparent coins spent: it's the whole amount, and what our inputs held
  // beyond it and our change is the fee.
  const recovered = shielded!.sent.length + shielded!.paid.length > 0;
  const net = sum(shielded!.received) - sum(shielded!.spent);
  const value = recovered ? s.value : s.value + t;
  return {
    ...base,
    ...side,
    from: party(transparent.from),
    to: "address" in side.to ? side.to : party(transparent.to),
    pool: "mixed",
    tx_type: value < 0n ? "Sent" : "Received",
    value,
    fee: recovered ? max0(s.value - t - net) : 0n,
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
export function buildActivity(
  notes: Note[],
  sent: Sent[],
  transparent: TransparentTx[],
  blocks: Map<number, Block>,
  paid = new Map<string, Payment[]>(),
  ours = new Set<string>(),
): Activity[] {
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
    if (note.spend.status === "spent") {
      at(note.spend.at).spent.push(note);
    }
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
    const index = txIndex(blocks, tx.height, tx.txid);
    const entry = entries.get(tx.txid) ?? {
      height: tx.height,
      paid:
        index === undefined
          ? undefined
          : paid.get(locatorId({ height: tx.height, tx_index: index })),
    };
    entries.set(tx.txid, { ...entry, transparent: tx });
  }

  return [...entries]
    .map(([txid, entry]) =>
      receipt(txid, entry, ours, blocks.get(entry.height)?.time),
    )
    .sort((a, b) => b.block_height - a.block_height);
}

const txIndex = (blocks: Map<number, Block>, height: number, txid: string) =>
  [...(blocks.get(height)?.txids ?? [])].find(([, id]) => id === txid)?.[0];

/** Every height history names, so their blocks can be fetched. */
export function activityHeights(
  notes: Note[],
  sent: Sent[],
  transparent: TransparentTx[],
) {
  return new Set([
    ...notes.flatMap((n) =>
      n.spend.status === "spent" ? [n.height, n.spend.at.height] : [n.height],
    ),
    ...sent.map((s) => s.height),
    ...transparent.map((t) => t.height),
  ]);
}

/** Our transactions that spent notes or coins of ours, by `height:tx_index`. */
export function sendingTxs(
  notes: Note[],
  transparent: TransparentTx[],
  blocks: Map<number, Block>,
) {
  const txs = new Map<string, TxLocator>();
  for (const { spend } of notes) {
    if (spend.status === "spent") {
      txs.set(`${spend.at.height}:${spend.at.tx_index}`, spend.at);
    }
  }
  for (const { txid, height, spent } of transparent) {
    if (!spent) continue;
    const tx_index = txIndex(blocks, height, txid);
    if (tx_index !== undefined) {
      txs.set(`${height}:${tx_index}`, { height, tx_index });
    }
  }
  return txs;
}

/**
 * What `txs` paid to transparent addresses not in `ours`, by `locatorId`,
 * from their blocks; `addressOf` reads an output script's address.
 */
export function payments(
  txs: Iterable<TxLocator>,
  blocks: Map<number, Block>,
  ours: Set<string>,
  addressOf: (script: Uint8Array) => string | undefined,
) {
  const paid = new Map<string, Payment[]>();
  for (const locator of txs) {
    const vout = blocks.get(locator.height)?.vout.get(locator.tx_index);
    const theirs = (vout ?? []).flatMap(({ value, script }) => {
      const recipient = addressOf(script);
      return recipient && ours.has(recipient) ? [] : [{ value, recipient }];
    });
    if (theirs.length) paid.set(locatorId(locator), theirs);
  }
  return paid;
}
