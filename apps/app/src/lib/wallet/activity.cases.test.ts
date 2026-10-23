/**
 * Every transaction shape history can show. The same table renders
 * docs/design/activity-cases.md: run `vitest -u` after changing a case.
 */
import { expect, test } from "vitest";

import { buildActivity, txidsToRead } from "./activity";
import type { Block } from "./chain/lightwalletd";
import type { ParsedTx, TransparentTx } from "./transparent";
import type { Activity, Note, Party, Pool, Sent } from "./types";

type Shown = {
  type: Activity["tx_type"];
  amount: number;
  fee: number;
  from: string;
  to: string;
  /** A payment to the account itself, which shows no sign. */
  self?: true;
  /** Where history's data for it comes from. */
  source: string;
};

type Case = {
  /** Source-destination, as the doc's key reads them. */
  id: string;
  name: string;
  /** The transaction itself, which the wallet may see only part of. */
  tx: string;
  /** What the wallet sees of it. */
  notes?: Note[];
  sent?: Sent[];
  transparent?: Partial<TransparentTx>;
  /** The transaction as fetched in full, once it is. */
  full?: Partial<ParsedTx>;
  shows: Shown;
  /** What history shows instead, while it's wrong. */
  today?: Shown;
  /** What each wallet's history shows, read from its source. */
  zodl: string;
  zingo: string;
  vizor: string;
  zkool: string;
  note?: string;
  /** A label or scope question for Harrison. */
  decide?: string;
};

const at = { height: 3_519_095, tx_index: 4 };
const ours = new Set(["t1ours", "t1change", "t1internal"]);

let position = 0;
const note = (pool: Pool, value: number, rest: Partial<Note>): Note => {
  position += 1;
  return {
    id: `a_${pool}_${position}`,
    pool,
    scope: "internal",
    value,
    nf_mine: "",
    recipient: "u1ours",
    ...at,
    output_index: 0,
    position,
    note: "",
    spend: { status: "unspent" },
    ...rest,
  };
};
/** A transparent input of the transaction, spending a coin at `address`. */
const input = (address: string) => ({ txid: "prev", index: 0, address });
/** Its transparent outputs, in order. */
const outputs = (...paid: [value: number, address: string][]) =>
  paid.map(([value, address], index) => ({ index, value, address }));
/**
 * The transaction as read in full, paying `fee` from `coins` of transparent
 * inputs and the shielded pools: its value balance is whatever the coins
 * leave of the fee and the transparent outputs.
 */
const read = (
  fee: number,
  coins = 0,
  rest: Partial<ParsedTx> = {},
): Partial<ParsedTx> => ({
  ...rest,
  value_balance:
    fee + (rest.outputs ?? []).reduce((all, o) => all + o.value, 0) - coins,
});

/** A note this transaction paid us; change unless `external`. */
const got = (pool: Pool, value: number, scope: Note["scope"] = "internal") =>
  note(pool, value, { scope });
/** A note received earlier that this transaction spent. */
const spent = (pool: Pool, value: number) =>
  note(pool, value, { height: 3_500_000, spend: { status: "spent", at } });
const sent = (pool: Pool, value: number, recipient = "u1theirs"): Sent => {
  position += 1;
  return {
    id: `a_${pool}_${position}`,
    pool,
    value,
    recipient,
    position,
    ...at,
  };
};

const cases: [group: string, Case[]][] = [
  [
    "From our Ironwood",
    [
      {
        id: "i-xi",
        name: "to someone's Ironwood",
        tx: "Ironwood 100,000 → them Ironwood 10,000 · change Ironwood 80,000 · fee 10,000",
        notes: [spent("ironwood", 100_000), got("ironwood", 80_000)],
        sent: [sent("ironwood", 10_000)],
        full: read(10_000),
        shows: {
          type: "Sent",
          amount: -10_000,
          fee: 10_000,
          from: "Shielded",
          to: "u1theirs",
          source: "Indexer + RPC by txid",
        },
        zodl: "sent 20,000 · fee 10,000",
        zingo: "sent 10,000 · fee 10,000",
        vizor: "sent 10,000 · fee 10,000",
        zkool: "Sent −20,000 · fee 10,000",
      },
      {
        id: "i-xi-nc",
        name: "to someone's Ironwood, no change",
        tx: "Ironwood 20,000 → them Ironwood 10,000 · fee 10,000",
        notes: [spent("ironwood", 20_000)],
        sent: [sent("ironwood", 10_000)],
        full: read(10_000),
        shows: {
          type: "Sent",
          amount: -10_000,
          fee: 10_000,
          from: "Shielded",
          to: "u1theirs",
          source: "Indexer + RPC by txid",
        },
        zodl: "sent 20,000 · fee 10,000",
        zingo: "sent 10,000 · fee 10,000",
        vizor: "sent 10,000 · fee 10,000",
        zkool: "Sent −20,000 · fee 10,000",
      },
      {
        id: "i-xi2",
        name: "to two people's Ironwood",
        tx: "Ironwood 100,000 → them Ironwood 10,000 · another Ironwood 5,000 · change Ironwood 70,000 · fee 15,000",
        notes: [spent("ironwood", 100_000), got("ironwood", 70_000)],
        sent: [sent("ironwood", 10_000), sent("ironwood", 5_000, "u1another")],
        full: read(15_000),
        shows: {
          type: "Sent",
          amount: -15_000,
          fee: 15_000,
          from: "Shielded",
          to: "u1theirs +1",
          source: "Indexer + RPC by txid",
        },
        zodl: "sent 30,000 · fee 15,000",
        zingo: "sent 10,000 + sent 5,000 · fee 15,000",
        vizor: "sent 15,000 · fee 15,000",
        zkool: "Sent −30,000 · fee 15,000",
        note: "To names the first recipient and counts the rest; the detail page lists each with what it was paid.",
      },
      {
        id: "i-xi-lost",
        name: "to someone's Ironwood, outgoing recovery failed",
        tx: "Ironwood 100,000 → them Ironwood 10,000 (not recovered) · change Ironwood 80,000 · fee 10,000",
        notes: [spent("ironwood", 100_000), got("ironwood", 80_000)],
        full: read(10_000),
        shows: {
          type: "Sent",
          amount: -10_000,
          fee: 10_000,
          from: "Shielded",
          to: "Shielded",
          source: "Indexer + RPC by txid",
        },
        zodl: "sent 80,000 · fee 10,000",
        zingo: "not checked",
        vizor: "not checked",
        zkool: "Sent −20,000 · fee 10,000",
        note: "With the transaction by txid, the value balance gives the fee, and what the shielded outputs held beyond our change is the payment recovery missed. With no outgoing note, Zodl takes it for a transfer to itself and shows what came back.",
      },
      {
        id: "i-xt",
        name: "to someone's transparent address",
        tx: "Ironwood 100,000 → them t1theirs 10,000 · change Ironwood 75,000 · fee 15,000",
        notes: [spent("ironwood", 100_000), got("ironwood", 75_000)],
        full: read(15_000, 0, { outputs: outputs([10_000, "t1theirs"]) }),
        shows: {
          type: "Sent",
          amount: -10_000,
          fee: 15_000,
          from: "Shielded",
          to: "t1theirs",
          source: "Indexer + RPC by txid",
        },
        zodl: "sent 25,000 · fee 15,000",
        zingo: "sent 10,000 · fee 15,000",
        vizor: "sent 10,000 · fee 15,000",
        zkool: "Sent −25,000 · fee 15,000",
      },
      {
        id: "i-i",
        name: "to our own Ironwood address (self-payment)",
        tx: "Ironwood 100,000 → own Ironwood 10,000 · change Ironwood 80,000 · fee 10,000",
        notes: [
          spent("ironwood", 100_000),
          got("ironwood", 80_000),
          got("ironwood", 10_000, "external"),
        ],
        full: read(10_000),
        shows: {
          type: "Sent",
          amount: -10_000,
          fee: 10_000,
          from: "Shielded",
          to: "Shielded",
          self: true,
          source: "Indexer + RPC by txid",
        },
        zodl: "sent 90,000 · fee 10,000",
        zingo: "send-to-self 90,000 · fee 10,000",
        vizor: "sent 10,000 · fee 10,000 + received 10,000",
        zkool: "Self Transfer −10,000 · fee 10,000",
        note: "product.md 2.6: amount is what it paid, the fee apart.",
      },
      {
        id: "i-t",
        name: "to a new transparent address of our own (Unshield)",
        tx: "Ironwood 100,000 → own t1internal 10,000 · change Ironwood 75,000 · fee 15,000",
        notes: [spent("ironwood", 100_000), got("ironwood", 75_000)],
        transparent: { received: 10_000n, to: "t1internal" },
        full: read(15_000, 0, { outputs: outputs([10_000, "t1internal"]) }),
        shows: {
          type: "Unshielded",
          amount: 10_000,
          fee: 15_000,
          from: "Shielded",
          to: "Transparent",
          source: "Indexer + RPC by address",
        },
        zodl: "sent 15,000 · fee 15,000",
        zingo: "send-to-self 85,000 · fee 15,000",
        vizor: "no row",
        zkool: "Unshield −15,000 · fee 15,000",
      },
    ],
  ],
  [
    "From our Orchard",
    [
      {
        id: "o-xi",
        name: "to someone's Ironwood",
        tx: "Orchard 100,000 → them Ironwood 10,000 · change Orchard 70,000 · fee 20,000",
        notes: [spent("orchard", 100_000), got("orchard", 70_000)],
        sent: [sent("ironwood", 10_000)],
        full: read(20_000),
        shows: {
          type: "Sent",
          amount: -10_000,
          fee: 20_000,
          from: "Shielded",
          to: "u1theirs",
          source: "Indexer + RPC by txid",
        },
        zodl: "sent 30,000 · fee 20,000",
        zingo: "sent 10,000 · fee 20,000",
        vizor: "sent 10,000 · fee 20,000",
        zkool: "Sent −30,000 · fee 20,000",
      },
      {
        id: "o-xo",
        name: "to someone's Orchard",
        tx: "Orchard 100,000 → them Orchard 10,000 · change Orchard 80,000 · fee 10,000",
        notes: [spent("orchard", 100_000), got("orchard", 80_000)],
        sent: [sent("orchard", 10_000)],
        full: read(10_000),
        shows: {
          type: "Sent",
          amount: -10_000,
          fee: 10_000,
          from: "Shielded",
          to: "u1theirs",
          source: "Indexer + RPC by txid",
        },
        zodl: "sent 20,000 · fee 10,000",
        zingo: "sent 10,000 · fee 10,000",
        vizor: "sent 10,000 · fee 10,000",
        zkool: "Sent −20,000 · fee 10,000",
      },
      {
        id: "o-xs",
        name: "to someone's Sapling",
        tx: "Orchard 100,000 → them Sapling 10,000 · change Orchard 70,000 · fee 20,000",
        notes: [spent("orchard", 100_000), got("orchard", 70_000)],
        sent: [sent("sapling", 10_000)],
        full: read(20_000),
        shows: {
          type: "Sent",
          amount: -10_000,
          fee: 20_000,
          from: "Shielded",
          to: "u1theirs",
          source: "Indexer + RPC by txid",
        },
        zodl: "sent 30,000 · fee 20,000",
        zingo: "sent 10,000 · fee 20,000",
        vizor: "sent 10,000 · fee 20,000",
        zkool: "Sent −30,000 · fee 20,000",
      },
      {
        id: "o-xt",
        name: "to someone's transparent address",
        tx: "Orchard 100,000 → them t1theirs 10,000 · change Orchard 75,000 · fee 15,000",
        notes: [spent("orchard", 100_000), got("orchard", 75_000)],
        full: read(15_000, 0, { outputs: outputs([10_000, "t1theirs"]) }),
        shows: {
          type: "Sent",
          amount: -10_000,
          fee: 15_000,
          from: "Shielded",
          to: "t1theirs",
          source: "Indexer + RPC by txid",
        },
        zodl: "sent 25,000 · fee 15,000",
        zingo: "sent 10,000 · fee 15,000",
        vizor: "sent 10,000 · fee 15,000",
        zkool: "Sent −25,000 · fee 15,000",
      },
      {
        id: "o-i",
        name: "part of it to our own Ironwood (Move to Ironwood)",
        tx: "Orchard 100,000 → own Ironwood 30,000 · change Orchard 50,000 · fee 20,000",
        notes: [
          spent("orchard", 100_000),
          got("orchard", 50_000),
          got("ironwood", 30_000),
        ],
        full: read(20_000),
        shows: {
          type: "Migrated",
          amount: 30_000,
          fee: 20_000,
          from: "Orchard",
          to: "Ironwood",
          source: "Indexer + RPC by txid",
        },
        zodl: "sent 80,000 · fee 20,000",
        zingo: "migration 30,000 · fee 20,000",
        vizor: "migration 30,000 · fee 20,000",
        zkool: "Migration −20,000 · fee 20,000",
        note: "zcash_client_sqlite: pool_crossing_value 30,000. Zodl shows everything that came back, change included.",
      },
      {
        id: "o-i-nc",
        name: "all of it to our own Ironwood (Move to Ironwood)",
        tx: "Orchard 100,000 → own Ironwood 80,000 · fee 20,000",
        notes: [spent("orchard", 100_000), got("ironwood", 80_000)],
        full: read(20_000),
        shows: {
          type: "Migrated",
          amount: 80_000,
          fee: 20_000,
          from: "Orchard",
          to: "Ironwood",
          source: "Indexer + RPC by txid",
        },
        zodl: "sent 80,000 · fee 20,000",
        zingo: "migration 80,000 · fee 20,000",
        vizor: "migration 80,000 · fee 20,000",
        zkool: "Migration −20,000 · fee 20,000",
      },
      {
        id: "o-o",
        name: "split into standard amounts (a migration's preparation)",
        tx: "Orchard 300,000 → own Orchard 120,000 + 100,000 · fee 80,000",
        notes: [
          spent("orchard", 300_000),
          got("orchard", 120_000),
          got("orchard", 100_000),
        ],
        full: read(80_000),
        shows: {
          type: "Prepared",
          amount: 220_000,
          fee: 80_000,
          from: "Orchard",
          to: "Orchard",
          source: "Indexer + RPC by txid",
        },
        zodl: "not checked",
        zingo: "not checked",
        vizor: "not checked",
        zkool: "not checked",
        note: "ZIP 318 pads it to 16 actions, so the fee is 80,000 whatever it splits.",
      },
      {
        id: "o-s",
        name: "to our own Sapling address",
        tx: "Orchard 100,000 → own Sapling 10,000 · change Orchard 70,000 · fee 20,000",
        notes: [
          spent("orchard", 100_000),
          got("orchard", 70_000),
          got("sapling", 10_000, "external"),
        ],
        full: read(20_000),
        shows: {
          type: "Migrated",
          amount: 10_000,
          fee: 20_000,
          from: "Orchard",
          to: "Sapling",
          source: "Indexer + RPC by txid",
        },
        zodl: "sent 80,000 · fee 20,000",
        zingo: "send-to-self 80,000 · fee 20,000",
        vizor: "sent 10,000 · fee 20,000 + received 10,000",
        zkool: "Self Transfer −20,000 · fee 20,000",
        note: "zcash_client_sqlite: pool_crossing_value 10,000.",
      },
      {
        id: "o-t",
        name: "to a new transparent address of our own (Unshield)",
        tx: "Orchard 100,000 → own t1internal 10,000 · change Orchard 75,000 · fee 15,000",
        notes: [spent("orchard", 100_000), got("orchard", 75_000)],
        transparent: { received: 10_000n, to: "t1internal" },
        full: read(15_000, 0, { outputs: outputs([10_000, "t1internal"]) }),
        shows: {
          type: "Unshielded",
          amount: 10_000,
          fee: 15_000,
          from: "Shielded",
          to: "Transparent",
          source: "Indexer + RPC by address",
        },
        zodl: "sent 15,000 · fee 15,000",
        zingo: "send-to-self 85,000 · fee 15,000",
        vizor: "no row",
        zkool: "Unshield −15,000 · fee 15,000",
        note: "Vizor hides outputs to internal addresses as change, which leaves nothing to show.",
      },
    ],
  ],
  [
    "From our Sapling",
    [
      {
        id: "s-xo",
        name: "to someone's Orchard, change in Orchard",
        tx: "Sapling 100,000 → them Orchard 10,000 · change Orchard 70,000 · fee 20,000",
        notes: [spent("sapling", 100_000), got("orchard", 70_000)],
        sent: [sent("orchard", 10_000)],
        full: read(20_000),
        shows: {
          type: "Sent",
          amount: -10_000,
          fee: 20_000,
          from: "Shielded",
          to: "u1theirs",
          source: "Indexer + RPC by txid",
        },
        zodl: "sent 30,000 · fee 20,000",
        zingo: "sent 10,000 · fee 20,000",
        vizor: "sent 10,000 · fee 20,000",
        zkool: "Sent −30,000 · fee 20,000",
        note: "Change goes to the pool paid into, as upstream's change strategy does.",
      },
      {
        id: "s-xo-lost",
        name: "to someone's Orchard, change in Orchard, outgoing recovery failed",
        tx: "Sapling 100,000 → them Orchard 10,000 (not recovered) · change Orchard 70,000 · fee 20,000",
        notes: [spent("sapling", 100_000), got("orchard", 70_000)],
        full: read(20_000),
        shows: {
          type: "Sent",
          amount: -10_000,
          fee: 20_000,
          from: "Shielded",
          to: "Shielded",
          source: "Indexer + RPC by txid",
        },
        zodl: "sent 70,000 · fee 20,000",
        zingo: "not checked",
        vizor: "not checked",
        zkool: "Sent −30,000 · fee 20,000",
        note: "Change in a pool nothing was spent from would read as funds moved there, but the value balance shows 10,000 more left than change and fee. zcash_client_sqlite calls it a pool crossing (pool_crossing_value 70,000); Zkool doesn't, since it goes by the balance change.",
      },
      {
        id: "s-xs",
        name: "to someone's Sapling",
        tx: "Sapling 100,000 → them Sapling 10,000 · change Sapling 80,000 · fee 10,000",
        notes: [spent("sapling", 100_000), got("sapling", 80_000)],
        sent: [sent("sapling", 10_000)],
        full: read(10_000),
        shows: {
          type: "Sent",
          amount: -10_000,
          fee: 10_000,
          from: "Shielded",
          to: "u1theirs",
          source: "Indexer + RPC by txid",
        },
        zodl: "sent 20,000 · fee 10,000",
        zingo: "sent 10,000 · fee 10,000",
        vizor: "sent 10,000 · fee 10,000",
        zkool: "Sent −20,000 · fee 10,000",
      },
      {
        id: "s-i",
        name: "all of it to our own Ironwood (Move to Ironwood)",
        tx: "Sapling 100,000 → own Ironwood 80,000 · fee 20,000",
        notes: [spent("sapling", 100_000), got("ironwood", 80_000)],
        full: read(20_000),
        shows: {
          type: "Migrated",
          amount: 80_000,
          fee: 20_000,
          from: "Sapling",
          to: "Ironwood",
          source: "Indexer + RPC by txid",
        },
        zodl: "sent 80,000 · fee 20,000",
        zingo: "send-to-self 80,000 · fee 20,000",
        vizor: "not checked",
        zkool: "Self Transfer −20,000 · fee 20,000",
        note: "Zingo, Vizor and Zkool name only Orchard → Ironwood a migration.",
      },
      {
        id: "s-o",
        name: "to our own Orchard address",
        tx: "Sapling 100,000 → own Orchard 10,000 · change Sapling 70,000 · fee 20,000",
        notes: [
          spent("sapling", 100_000),
          got("sapling", 70_000),
          got("orchard", 10_000, "external"),
        ],
        full: read(20_000),
        shows: {
          type: "Migrated",
          amount: 10_000,
          fee: 20_000,
          from: "Sapling",
          to: "Orchard",
          source: "Indexer + RPC by txid",
        },
        zodl: "sent 80,000 · fee 20,000",
        zingo: "send-to-self 80,000 · fee 20,000",
        vizor: "sent 10,000 · fee 20,000 + received 10,000",
        zkool: "Self Transfer −20,000 · fee 20,000",
      },
      {
        id: "s-t",
        name: "to a new transparent address of our own (Unshield)",
        tx: "Sapling 100,000 → own t1internal 10,000 · change Sapling 75,000 · fee 15,000",
        notes: [spent("sapling", 100_000), got("sapling", 75_000)],
        transparent: { received: 10_000n, to: "t1internal" },
        full: read(15_000, 0, { outputs: outputs([10_000, "t1internal"]) }),
        shows: {
          type: "Unshielded",
          amount: 10_000,
          fee: 15_000,
          from: "Shielded",
          to: "Transparent",
          source: "Indexer + RPC by address",
        },
        zodl: "sent 15,000 · fee 15,000",
        zingo: "send-to-self 85,000 · fee 15,000",
        vizor: "no row",
        zkool: "Unshield −15,000 · fee 15,000",
      },
    ],
  ],
  [
    "From our transparent coins",
    [
      {
        id: "t-xi",
        name: "to someone's Ironwood, shielded change",
        tx: "t1ours 46,000 → them Ironwood 16,000 · change Ironwood 5,000 · fee 25,000",
        notes: [got("ironwood", 5_000)],
        sent: [sent("ironwood", 16_000)],
        transparent: { spent: 46_000n },
        full: read(25_000, 46_000, { inputs: [input("t1ours")] }),
        shows: {
          type: "Sent",
          amount: -16_000,
          fee: 25_000,
          from: "Transparent",
          to: "u1theirs",
          source: "Indexer + RPC by address",
        },
        zodl: "sent 41,000 · fee 25,000",
        zingo: "sent 16,000 · fee 25,000",
        vizor: "sent 16,000 · fee 25,000",
        zkool: "Sent −41,000 · fee 25,000",
      },
      {
        id: "t-xi-nc",
        name: "to someone's Ironwood, no change (mainnet 61f4832b…)",
        tx: "t1ours 41,000 (3 coins) → them Ironwood 16,000 · fee 25,000",
        sent: [sent("ironwood", 16_000)],
        transparent: { spent: 41_000n },
        full: read(25_000, 41_000, { inputs: Array(3).fill(input("t1ours")) }),
        shows: {
          type: "Sent",
          amount: -16_000,
          fee: 25_000,
          from: "Transparent",
          to: "u1theirs",
          source: "Indexer + RPC by address",
        },
        zodl: "sent 41,000 · fee 25,000",
        zingo: "sent 16,000 · fee 25,000",
        vizor: "sent 16,000 · fee 25,000",
        zkool: "Sent −41,000 · fee 25,000",
      },
      {
        id: "t-xi-tc",
        name: "to someone's Ironwood, transparent change",
        tx: "t1ours 50,000 → them Ironwood 16,000 · change t1change 9,000 · fee 25,000",
        sent: [sent("ironwood", 16_000)],
        transparent: {
          spent: 50_000n,
          received: 9_000n,
          to: "t1change",
        },
        full: read(25_000, 50_000, {
          inputs: [input("t1ours")],
          outputs: outputs([9_000, "t1change"]),
        }),
        shows: {
          type: "Sent",
          amount: -16_000,
          fee: 25_000,
          from: "Transparent",
          to: "u1theirs",
          source: "Indexer + RPC by address",
        },
        zodl: "sent 41,000 · fee 25,000",
        zingo: "sent 16,000 · fee 25,000",
        vizor: "sent 16,000 · fee 25,000",
        zkool: "Sent −41,000 · fee 25,000",
      },
      {
        id: "t-xt",
        name: "to someone's transparent address",
        tx: "t1ours 100,000 → them t1theirs 50,000 · change t1change 40,000 · fee 10,000",
        transparent: {
          spent: 100_000n,
          received: 40_000n,
          to: "t1theirs",
        },
        full: read(10_000, 100_000, {
          inputs: [input("t1ours")],
          outputs: outputs([50_000, "t1theirs"], [40_000, "t1change"]),
        }),
        shows: {
          type: "Sent",
          amount: -50_000,
          fee: 10_000,
          from: "Transparent",
          to: "t1theirs",
          source: "RPC by address",
        },
        zodl: "sent 60,000 · fee 10,000",
        zingo: "sent 50,000 · fee 10,000",
        vizor: "sent 50,000 · fee 10,000",
        zkool: "Sent −60,000 · fee 10,000",
      },
      {
        id: "t-xt-nc",
        name: "to someone's transparent address, no change",
        tx: "t1ours 60,000 → them t1theirs 50,000 · fee 10,000",
        transparent: { spent: 60_000n, to: "t1theirs" },
        full: read(10_000, 60_000, {
          inputs: [input("t1ours")],
          outputs: outputs([50_000, "t1theirs"]),
        }),
        shows: {
          type: "Sent",
          amount: -50_000,
          fee: 10_000,
          from: "Transparent",
          to: "t1theirs",
          source: "RPC by address",
        },
        zodl: "sent 60,000 · fee 10,000",
        zingo: "sent 50,000 · fee 10,000",
        vizor: "sent 50,000 · fee 10,000",
        zkool: "Sent −60,000 · fee 10,000",
      },
      {
        id: "t-i",
        name: "to our own Ironwood (Shield)",
        tx: "t1ours 100,000 → own Ironwood 85,000 · fee 15,000",
        notes: [got("ironwood", 85_000)],
        transparent: { spent: 100_000n },
        full: read(15_000, 100_000, { inputs: [input("t1ours")] }),
        shows: {
          type: "Shielded",
          amount: 85_000,
          fee: 15_000,
          from: "Transparent",
          to: "Shielded",
          source: "Indexer + RPC by address",
        },
        zodl: "shield 100,000 · fee 15,000",
        zingo: "shield 85,000 · fee 15,000",
        vizor: "shielded 85,000 · fee 15,000",
        zkool: "Shield −15,000 · fee 15,000",
        note: "zcash_client_sqlite: is_shielding. Zodl shows what the coins held, fee included.",
      },
      {
        id: "t-t",
        name: "to our own transparent address",
        tx: "t1ours 100,000 → own t1ours 90,000 · fee 10,000",
        transparent: {
          spent: 100_000n,
          received: 90_000n,
          receiving: 90_000n,
          to: "t1ours",
        },
        full: read(10_000, 100_000, {
          inputs: [input("t1ours")],
          outputs: outputs([90_000, "t1ours"]),
        }),
        shows: {
          type: "Sent",
          amount: -90_000,
          fee: 10_000,
          from: "Transparent",
          to: "Transparent",
          self: true,
          source: "RPC by address",
        },
        zodl: "sent 10,000 · fee 10,000",
        zingo: "send-to-self 90,000 · fee 10,000",
        vizor: "sent 90,000 · fee 10,000 + received 90,000",
        zkool: "T. Self Transfer −10,000 · fee 10,000",
        note: "product.md 2.6: what reached a receiving address is the payment, the fee apart; change goes to internal addresses.",
      },
    ],
  ],
  [
    "From someone's shielded funds",
    [
      {
        id: "xi-i",
        name: "to our Ironwood",
        tx: "their Ironwood 100,000 → us Ironwood 10,000 · their change · fee 10,000",
        notes: [got("ironwood", 10_000, "external")],
        shows: {
          type: "Received",
          amount: 10_000,
          fee: 0,
          from: "Shielded",
          to: "Shielded",
          source: "Indexer",
        },
        zodl: "received 10,000",
        zingo: "received 10,000",
        vizor: "received 10,000",
        zkool: "Receive 10,000",
        note: "Receives show no fee: it isn't ours to pay.",
      },
      {
        id: "xi-t",
        name: "to our transparent address",
        tx: "their Ironwood 100,000 → us t1ours 10,000 · their change · fee 15,000",
        transparent: { received: 10_000n, to: "t1ours", shielded: true },
        shows: {
          type: "Received",
          amount: 10_000,
          fee: 0,
          from: "Shielded",
          to: "Transparent",
          source: "RPC by address",
        },
        zodl: "received 10,000",
        zingo: "received 10,000",
        vizor: "received 10,000",
        zkool: "Receive 10,000",
        note: "No transparent input means no transparent sender: the funds came from a shielded pool.",
      },
      {
        id: "xo-s",
        name: "to our Sapling",
        tx: "their Orchard 100,000 → us Sapling 10,000 · their change · fee 20,000",
        notes: [got("sapling", 10_000, "external")],
        shows: {
          type: "Received",
          amount: 10_000,
          fee: 0,
          from: "Shielded",
          to: "Shielded",
          source: "Indexer",
        },
        zodl: "received 10,000",
        zingo: "received 10,000",
        vizor: "received 10,000",
        zkool: "Receive 10,000",
      },
    ],
  ],
  [
    "From someone's transparent coins",
    [
      {
        id: "xt-i",
        name: "to our Ironwood",
        tx: "t1sender 41,000 → us Ironwood 16,000 · fee 25,000",
        notes: [got("ironwood", 16_000, "external")],
        full: read(25_000, 41_000, { inputs: [input("t1sender")] }),
        shows: {
          type: "Received",
          amount: 16_000,
          fee: 0,
          from: "t1sender",
          to: "Shielded",
          source: "Indexer + RPC by txid",
        },
        zodl: "received 16,000",
        zingo: "received 16,000",
        vizor: "received 16,000",
        zkool: "Receive 16,000",
      },
      {
        id: "xt-i3",
        name: "to our Ironwood, from three addresses (mainnet 61f4832b…)",
        tx: "t1XurB… 20,000 + t1Y5bT… 11,000 + t1SLrP… 10,000 → us Ironwood 16,000 · fee 25,000",
        notes: [got("ironwood", 16_000, "external")],
        full: read(25_000, 41_000, {
          inputs: [input("t1XurB"), input("t1Y5bT"), input("t1SLrP")],
        }),
        shows: {
          type: "Received",
          amount: 16_000,
          fee: 0,
          from: "t1XurB +2",
          to: "Shielded",
          source: "Indexer + RPC by txid",
        },
        zodl: "received 16,000",
        zingo: "received 16,000",
        vizor: "received 16,000",
        zkool: "Receive 16,000",
        note: "From names the first sender and counts the rest; the detail page lists them all.",
      },
      {
        id: "xt-t",
        name: "to our transparent address",
        tx: "t1sender 60,000 → us t1ours 50,000 · fee 10,000",
        transparent: { received: 50_000n, receiving: 50_000n, to: "t1ours" },
        full: read(10_000, 60_000, {
          inputs: [input("t1sender")],
          outputs: outputs([50_000, "t1ours"]),
        }),
        shows: {
          type: "Received",
          amount: 50_000,
          fee: 0,
          from: "t1sender",
          to: "Transparent",
          source: "RPC by address",
        },
        zodl: "received 50,000",
        zingo: "received 50,000",
        vizor: "received 50,000",
        zkool: "Receive 50,000",
      },
    ],
  ],
];

const label = (party: Party) =>
  "address" in party
    ? party.address + (party.more ? ` +${party.more.length}` : "")
    : party.pool[0].toUpperCase() + party.pool.slice(1);

/**
 * Where history's data comes from: the indexer for shielded notes, and
 * lightwalletd's RPC for the transparent sync's address history or the
 * transaction asked for by its txid.
 */
function source(c: Case) {
  const txids = txidsToRead(c.notes ?? [], c.sent ?? [], txsOf(c), blocksOf(c));
  const rpc = c.transparent
    ? "RPC by address"
    : txids.has("tx")
      ? "RPC by txid"
      : undefined;
  const indexer = c.notes?.length || c.sent?.length ? "Indexer" : undefined;
  return [indexer, rpc].filter(Boolean).join(" + ");
}

const blocksOf = (c: Case) =>
  new Map<number, Block>([
    [
      at.height,
      {
        txids: new Map([[at.tx_index, "tx"]]),
        transparentInputs: c.full?.inputs?.length ? [at.tx_index] : [],
      } as Block,
    ],
  ]);

const txsOf = (c: Case): TransparentTx[] =>
  c.transparent
    ? [
        {
          txid: "tx",
          height: at.height,
          received: 0n,
          receiving: 0n,
          spent: 0n,
          ...c.transparent,
        },
      ]
    : [];

function show(c: Case): Shown {
  const full: ParsedTx = {
    txid: "tx",
    inputs: [],
    outputs: [],
    value_balance: 0,
    expiry_height: 0,
    ...c.full,
  };
  const a = buildActivity(
    c.notes ?? [],
    c.sent ?? [],
    txsOf(c),
    blocksOf(c),
    new Map(c.full && source(c).includes("RPC") ? [["tx", full]] : []),
    ours,
  ).find((entry) => entry.txid === "tx")!;
  return {
    type: a.tx_type,
    amount: Number(a.value),
    fee: Number(a.fee),
    from: label(a.from),
    to: label(a.to),
    ...(a.self && { self: true as const }),
    source: source(c),
  };
}

for (const [group, list] of cases) {
  for (const c of list) {
    test(`${c.id}: ${group}, ${c.name}`, () => {
      expect(show(c)).toEqual(c.today ?? c.shows);
    });
    if (c.today) {
      test.fails(`${c.id}: ${group}, ${c.name}, once fixed`, () => {
        expect(show(c)).toEqual(c.shows);
      });
    }
  }
}

test("case ids are unique", () => {
  const ids = cases.flatMap(([, list]) => list.map((c) => c.id));
  expect(new Set(ids).size).toBe(ids.length);
});

const zec = (n: number) => n.toLocaleString("en-US").replace("-", "−");
const shows = (s: Shown) =>
  `${s.type} ${zec(s.amount)} · fee ${zec(s.fee)}${s.self ? " · to itself" : ""}`;
const parties = (s: Shown) => `${s.from} → ${s.to}`;
/** Today's value beside the expected one, where they differ. */
const cell = (c: Case, of: (s: Shown) => string) =>
  c.today && of(c.today) !== of(c.shows)
    ? `**${of(c.shows)}** (today ${of(c.today)})`
    : of(c.shows);

function markdown() {
  const all = cases.flatMap(([, list]) => list);
  const row = (cells: string[]) =>
    `| ${cells.map((s) => s.replace(/\|/g, "\\|")).join(" | ")} |`;
  const lines = [
    "# History cases",
    "",
    "<!-- Generated by apps/app/src/lib/wallet/activity.cases.test.ts; edit the cases there and run `vitest -u`. -->",
    "",
    "Every transaction shape history (product.md 2.6) can show, grouped by where",
    "the funds came from, and what `buildActivity` shows for it. Amounts and fees",
    "are in zatoshis; fees follow ZIP 317 (5,000 per logical action, at least 2).",
    "",
    "**IDs** read source-destination: `i` Ironwood, `o` Orchard, `s` Sapling,",
    "`t` transparent; an `x` makes it someone else's (`xi` is someone's Ironwood),",
    "without one it's ours. The plain ID has change; `-nc` has none, `-tc` has",
    "transparent change, `-lost` lost its outgoing recovery, `xi2` pays two people.",
    "A sender's row and its receiver's mirror each other: `i-xt` and `xi-t`.",
    "",
    "**Zillions** is what history shows; **bold** is what it should show where it",
    "shows something else today (those cases pin today's output and fail once",
    "fixed). The other columns are what each wallet's history shows, read from its",
    "source, not run: Zodl Android (`TransactionRepository.kt` over",
    "zcash_client_sqlite's `v_transactions`), Zingo (zingolib `perspective.rs`),",
    "Vizor (`rust/src/wallet/sync/transactions.rs`) and Zkool (`rust/src/memo.rs`).",
    "Their sends are from the wallet that made them.",
    "",
    "**Data source** is where history's data for it comes from. The **indexer**",
    "(zcrawler) holds the shielded notes found for the account. **RPC** is",
    "lightwalletd: **by address**, the transparent sync's history of our",
    "addresses; **by txid**, the whole transaction asked for by its id, for exact",
    "fees, whom it paid and a transparent sender, which tells lightwalletd the",
    "transaction is ours. A shielded payment received is never asked for.",
    "",
  ];
  for (const [group, list] of cases) {
    lines.push(
      `## ${group}`,
      "",
      // GitHub tables take no widths: unbreakable padding keeps the IDs whole.
      row([
        `ID${"&nbsp;".repeat(16)}`,
        "Zillions",
        "From → To",
        "Data source",
        "Zodl",
        "Zingo",
        "Vizor",
        "Zkool",
      ]),
      row(Array(8).fill("---")),
      ...list.map((c) =>
        row([
          `\`${c.id}\``,
          cell(c, shows),
          cell(c, parties),
          c.shows.source,
          c.zodl,
          c.zingo,
          c.vizor,
          c.zkool,
        ]),
      ),
      "",
      ...list.map((c) =>
        [
          `- \`${c.id}\` ${c.name}: ${c.tx}.`,
          c.note,
          c.decide && `**Decide:** ${c.decide}`,
        ]
          .filter(Boolean)
          .join(" "),
      ),
      "",
    );
  }
  const wrong = all.filter((c) => c.today);
  const open = all.filter((c) => c.decide);
  if (wrong.length) {
    lines.push(
      "## Wrong today",
      "",
      ...wrong.map((c) => `- \`${c.id}\` ${c.name}`),
      "",
    );
  }
  if (open.length) {
    lines.push(
      "## Needs a decision",
      "",
      ...open.map((c) => `- \`${c.id}\`: ${c.decide}`),
      "",
    );
  }
  return lines.join("\n");
}

test("docs/design/activity-cases.md is the table above", async () => {
  await expect(markdown()).toMatchFileSnapshot(
    "../../../../../docs/design/activity-cases.md",
  );
});
