import type { Block } from "./chain/lightwalletd";
import type { ParsedTx, TransparentTx } from "./transparent";
import type {
  Activity,
  Counterparty,
  Note,
  Party,
  Pool,
  Sent,
  TxLocator,
} from "./types";

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
  /** What it paid to shielded addresses that recovery didn't name. */
  lost: bigint;
};

/** A transparent output a transaction of ours paid to someone else, or to no address. */
export type Payment = {
  value: number;
  /** Absent for a script that pays no single address. */
  recipient?: string;
};

/** One transaction, from either side or both, and in full once fetched. */
type Entry = {
  height: number;
  shielded?: TxGroup;
  transparent?: TransparentTx;
  /** What a transaction with no shielded side paid to others. */
  paid?: Payment[];
  tx?: ParsedTx;
};

/** Whether it spent funds of ours, so we paid its fee: an output recovered with our viewing key is one we made. */
const funded = ({ shielded, transparent }: Entry) =>
  !!shielded?.spent.length || !!shielded?.sent.length || !!transparent?.spent;

/**
 * What a transaction we paid for paid in fees, exactly: what left the
 * shielded pools and our coins, less its transparent outputs. Unknown until
 * it's fetched, or when it spent a coin not ours.
 */
function exactFee(entry: Entry, ours: Set<string>) {
  const { tx, transparent } = entry;
  if (!tx || !funded(entry)) return undefined;
  if (!tx.inputs.every((i) => i.address && ours.has(i.address))) return;
  const fee =
    (transparent?.spent ?? 0n) + BigInt(tx.value_balance) - sum(tx.outputs);
  return fee >= 0n ? fee : undefined;
}

const max0 = (n: bigint) => (n > 0n ? n : 0n);

const sum = (of: { value: number }[]) =>
  of.reduce((total, { value }) => total + BigInt(value), 0n);

const SHIELDED: Party = { pool: "shielded" };
const TRANSPARENT: Party = { pool: "transparent" };

/** The first of `all`, holding the rest; undefined when there are none. */
const listed = ([first, ...more]: Counterparty[]): Party | undefined =>
  first && (more.length ? { ...first, more } : first);

/** Whom `out` paid, each address once with what it got in all. */
function payees(out: Payment[]) {
  const paid = new Map<string, bigint>();
  for (const { recipient, value } of out) {
    if (recipient) {
      paid.set(recipient, (paid.get(recipient) ?? 0n) + BigInt(value));
    }
  }
  return listed([...paid].map(([address, value]) => ({ address, value })));
}

/** The addresses not ours whose coins funded `tx`, read off its inputs. */
const senders = (tx: ParsedTx | undefined, ours: Set<string>) =>
  listed(
    [
      ...new Set(
        tx?.inputs.flatMap(({ address }) =>
          address && !ours.has(address) ? [address] : [],
        ),
      ),
    ].map((address) => ({ address })),
  );

/** A shielded group's net effect, and what it shows as on its own. */
function shieldedSide({ received, spent, sent, paid, lost }: TxGroup) {
  // With no output known, the inputs net of change stand in, fee included.
  const out = [...sent, ...paid, ...(lost ? [{ value: Number(lost) }] : [])];
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
  // Only a migration's preparation still makes Orchard notes since NU6.3.
  const prepared =
    spent.length > 0 &&
    !out.length &&
    received.length > 1 &&
    [...spent, ...received].every((n) => n.pool === "orchard") &&
    received.every((n) => n.scope === "internal");
  if (prepared) {
    return {
      migrated: false,
      prepared: true,
      from: { pool: "orchard" } as Party,
      value: sum(received),
      fee: max0(sum(spent) - sum(received)),
      pool: "orchard" as const,
      memo,
      to: { pool: "orchard" } as Party,
    };
  }
  return {
    migrated: false,
    self: self.length > 0,
    from: SHIELDED,
    value: outgoing ? -outflow : sum(received),
    // With every output accounted for, what our inputs held beyond them is
    // the fee; every shielded input is ours, since only we can spend them.
    // Below zero means an input was never found, so the fee is unknown.
    fee: known ? max0(sum(spent) - sum(received) - sum(out)) : 0n,
    pool: pools.size === 1 ? [...pools][0] : ("mixed" as const),
    memo,
    // Received, the recipient is our own address.
    to: payees(out) ?? (paid.length ? TRANSPARENT : SHIELDED),
  };
}

function receipt(
  txid: string,
  entry: Entry,
  ours: Set<string>,
  time?: number,
): Activity {
  const activity = derived(txid, entry, ours, time);
  const fee = exactFee(entry, ours);
  // Transparent coins not ours name their sender, whatever else paid.
  const from = !funded(entry) && senders(entry.tx, ours);
  return {
    ...activity,
    ...(fee !== undefined && { fee }),
    ...(from && { from }),
  };
}

/** What history shows from our notes and coins alone. */
function derived(
  txid: string,
  { height, shielded, transparent, paid = [], tx }: Entry,
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
      tx_type: s!.migrated
        ? "Migrated"
        : "prepared" in s!
          ? "Prepared"
          : s!.value < 0n
            ? "Sent"
            : "Received",
      value: s!.value,
      fee: s!.fee,
      ...("self" in s! && s!.self && { self: true as const }),
    };
  }

  const t = transparent.received - transparent.spent;
  const from = transparent.shielded ? SHIELDED : TRANSPARENT;
  if (!s || !side) {
    // Paying no one else, what reached a receiving address paid ourselves.
    const self = !!tx && transparent.spent > 0n && !paid.length;
    if (self && transparent.receiving > 0n) {
      return {
        ...base,
        tx_type: "Sent",
        value: -transparent.receiving,
        fee: max0(-t),
        memo: undefined,
        pool: "transparent",
        from,
        to: TRANSPARENT,
        self: true,
      };
    }
    // Our coins pay what went to others and the fee; what came back is change.
    const value = paid.length ? -sum(paid) : t;
    return {
      ...base,
      tx_type: value >= 0n ? "Received" : "Sent",
      value,
      fee: paid.length ? max0(-t - sum(paid)) : 0n,
      memo: undefined,
      pool: "transparent",
      from,
      to: payees(paid) ?? party(transparent.to),
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
      from: TRANSPARENT,
      to: SHIELDED,
    };
  }
  // A payment recovered on the shielded side was also paid for by the
  // transparent coins spent: it's the whole amount, and what our inputs held
  // beyond it and our change is the fee.
  const recovered =
    shielded!.sent.length + shielded!.paid.length > 0 || shielded!.lost > 0n;
  const net = sum(shielded!.received) - sum(shielded!.spent);
  const value = recovered ? s.value : s.value + t;
  return {
    ...base,
    ...side,
    from: transparent.spent > 0n ? TRANSPARENT : side.from,
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
 * or Unshielded, with its fee. `txs` holds the transactions fetched in full,
 * by txid: what ours paid to others' transparent addresses, and their fees.
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
  txs = new Map<string, ParsedTx>(),
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
        paid: [],
        lost: 0n,
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
    const entry = entries.get(tx.txid) ?? { height: tx.height };
    entries.set(tx.txid, { ...entry, transparent: tx });
  }
  for (const [txid, entry] of entries) {
    entry.tx = txs.get(txid);
    if (!entry.tx || !funded(entry)) continue;
    const paid = entry.tx.outputs.flatMap(({ value, address }) =>
      address && ours.has(address) ? [] : [{ value, recipient: address }],
    );
    if (!entry.shielded) {
      entry.paid = paid;
      continue;
    }
    entry.shielded.paid = paid;
    // Every shielded output is ours, recovered, or someone's we can't name.
    const { spent, received, sent } = entry.shielded;
    const outputs = sum(spent) - BigInt(entry.tx.value_balance);
    entry.shielded.lost = max0(outputs - sum(received) - sum(sent));
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

/**
 * The txids history reads in full, once their blocks name them: those that
 * spent our funds, for the exact fee and whom they paid, and those that
 * spent transparent coins, for the sender. Reading one by its txid tells the
 * server it's ours, so a shielded payment received is never read.
 */
export function txidsToRead(
  notes: Note[],
  sent: Sent[],
  transparent: TransparentTx[],
  blocks: Map<number, Block>,
) {
  const txid = ({ height, tx_index }: TxLocator) =>
    blocks.get(height)?.txids.get(tx_index);
  const coinsIn = ({ height, tx_index }: TxLocator) =>
    !!blocks.get(height)?.transparentInputs.includes(tx_index);
  const ids = [
    ...notes.flatMap((n) => (n.spend.status === "spent" ? [n.spend.at] : [])),
    ...sent,
    ...notes.filter(coinsIn),
  ].map(txid);
  for (const t of transparent) if (t.spent || !t.shielded) ids.push(t.txid);
  return new Set(ids.filter((id) => id !== undefined));
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

/** What anyone can read of a transaction, without its owner's keys. */
export type PublicActivity = Pick<
  Activity,
  "txid" | "block_height" | "timestamp" | "from" | "to"
> & {
  /** Absent when transparent coins paid in: their values aren't in the transaction. */
  fee?: bigint;
};

/** `tx` as anyone sees it, mined at `height` (0 while it isn't). */
export function publicActivity(
  tx: ParsedTx,
  height: number,
  time?: number,
): PublicActivity {
  const recipients = tx.outputs.map(({ value, address }) => ({
    value,
    recipient: address,
  }));
  return {
    txid: tx.txid,
    block_height: height,
    timestamp: time,
    from: senders(tx, new Set()) ?? (tx.inputs.length ? TRANSPARENT : SHIELDED),
    to: payees(recipients) ?? (tx.outputs.length ? TRANSPARENT : SHIELDED),
    fee: tx.inputs.length
      ? undefined
      : BigInt(tx.value_balance) - sum(tx.outputs),
  };
}
