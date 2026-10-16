/**
 * Every transaction shape history can show. The same table renders
 * docs/design/activity-cases.md: run `vitest -u` after changing a case.
 */
import { expect, test } from "vitest";

import { buildActivity, type Payment } from "./activity";
import type { Block } from "./chain/lightwalletd";
import type { TransparentTx } from "./transparent";
import type { Activity, Note, Party, Pool, Sent } from "./types";

type Shown = {
  type: Activity["tx_type"];
  amount: number;
  fee: number;
  from: string;
  to: string;
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
  paid?: Payment[];
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
        shows: {
          type: "Sent",
          amount: -10_000,
          fee: 10_000,
          from: "Shielded",
          to: "u1theirs",
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
        shows: {
          type: "Sent",
          amount: -10_000,
          fee: 10_000,
          from: "Shielded",
          to: "u1theirs",
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
        shows: {
          type: "Sent",
          amount: -15_000,
          fee: 15_000,
          from: "Shielded",
          to: "u1theirs",
        },
        zodl: "sent 30,000 · fee 15,000",
        zingo: "sent 10,000 + sent 5,000 · fee 15,000",
        vizor: "sent 15,000 · fee 15,000",
        zkool: "Sent −30,000 · fee 15,000",
        decide:
          "To names only the first recipient; Zingo lists one row per recipient.",
      },
      {
        id: "i-xi-lost",
        name: "to someone's Ironwood, outgoing recovery failed",
        tx: "Ironwood 100,000 → them Ironwood 10,000 (not recovered) · change Ironwood 80,000 · fee 10,000",
        notes: [spent("ironwood", 100_000), got("ironwood", 80_000)],
        shows: {
          type: "Sent",
          amount: -20_000,
          fee: 0,
          from: "Shielded",
          to: "Shielded",
        },
        zodl: "sent 80,000 · fee 10,000",
        zingo: "not checked",
        vizor: "not checked",
        zkool: "Sent −20,000 · fee 10,000",
        note: "Amount is inputs − change, fee included; fee unknown. The others read the fee from the transaction's value balances. With no outgoing note, Zodl takes it for a transfer to itself and shows what came back.",
      },
      {
        id: "i-xt",
        name: "to someone's transparent address",
        tx: "Ironwood 100,000 → them t1theirs 10,000 · change Ironwood 75,000 · fee 15,000",
        notes: [spent("ironwood", 100_000), got("ironwood", 75_000)],
        paid: [{ value: 10_000, recipient: "t1theirs" }],
        shows: {
          type: "Sent",
          amount: -10_000,
          fee: 15_000,
          from: "Shielded",
          to: "t1theirs",
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
        shows: {
          type: "Sent",
          amount: -10_000,
          fee: 10_000,
          from: "Shielded",
          to: "Shielded",
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
        shows: {
          type: "Unshielded",
          amount: 10_000,
          fee: 15_000,
          from: "Shielded",
          to: "Transparent",
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
        shows: {
          type: "Sent",
          amount: -10_000,
          fee: 20_000,
          from: "Shielded",
          to: "u1theirs",
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
        shows: {
          type: "Sent",
          amount: -10_000,
          fee: 10_000,
          from: "Shielded",
          to: "u1theirs",
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
        shows: {
          type: "Sent",
          amount: -10_000,
          fee: 20_000,
          from: "Shielded",
          to: "u1theirs",
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
        paid: [{ value: 10_000, recipient: "t1theirs" }],
        shows: {
          type: "Sent",
          amount: -10_000,
          fee: 15_000,
          from: "Shielded",
          to: "t1theirs",
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
        shows: {
          type: "Migrated",
          amount: 30_000,
          fee: 20_000,
          from: "Orchard",
          to: "Ironwood",
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
        shows: {
          type: "Migrated",
          amount: 80_000,
          fee: 20_000,
          from: "Orchard",
          to: "Ironwood",
        },
        zodl: "sent 80,000 · fee 20,000",
        zingo: "migration 80,000 · fee 20,000",
        vizor: "migration 80,000 · fee 20,000",
        zkool: "Migration −20,000 · fee 20,000",
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
        shows: {
          type: "Migrated",
          amount: 10_000,
          fee: 20_000,
          from: "Orchard",
          to: "Sapling",
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
        shows: {
          type: "Unshielded",
          amount: 10_000,
          fee: 15_000,
          from: "Shielded",
          to: "Transparent",
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
        shows: {
          type: "Sent",
          amount: -10_000,
          fee: 20_000,
          from: "Shielded",
          to: "u1theirs",
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
        shows: {
          type: "Sent",
          amount: -30_000,
          fee: 0,
          from: "Shielded",
          to: "Shielded",
        },
        today: {
          type: "Migrated",
          amount: 70_000,
          fee: 30_000,
          from: "Sapling",
          to: "Orchard",
        },
        zodl: "sent 70,000 · fee 20,000",
        zingo: "not checked",
        vizor: "not checked",
        zkool: "Sent −30,000 · fee 20,000",
        note: "Change in a pool nothing was spent from reads as funds moved there. zcash_client_sqlite makes the same call (pool_crossing_value 70,000); Zkool doesn't, since it goes by the balance change.",
      },
      {
        id: "s-xs",
        name: "to someone's Sapling",
        tx: "Sapling 100,000 → them Sapling 10,000 · change Sapling 80,000 · fee 10,000",
        notes: [spent("sapling", 100_000), got("sapling", 80_000)],
        sent: [sent("sapling", 10_000)],
        shows: {
          type: "Sent",
          amount: -10_000,
          fee: 10_000,
          from: "Shielded",
          to: "u1theirs",
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
        shows: {
          type: "Migrated",
          amount: 80_000,
          fee: 20_000,
          from: "Sapling",
          to: "Ironwood",
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
        shows: {
          type: "Migrated",
          amount: 10_000,
          fee: 20_000,
          from: "Sapling",
          to: "Orchard",
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
        shows: {
          type: "Unshielded",
          amount: 10_000,
          fee: 15_000,
          from: "Shielded",
          to: "Transparent",
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
        transparent: { spent: 46_000n, from: "t1ours" },
        shows: {
          type: "Sent",
          amount: -16_000,
          fee: 25_000,
          from: "Transparent",
          to: "u1theirs",
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
        transparent: { spent: 41_000n, from: "t1ours" },
        shows: {
          type: "Sent",
          amount: -16_000,
          fee: 25_000,
          from: "Transparent",
          to: "u1theirs",
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
          from: "t1ours",
          to: "t1change",
        },
        shows: {
          type: "Sent",
          amount: -16_000,
          fee: 25_000,
          from: "Transparent",
          to: "u1theirs",
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
          from: "t1ours",
          to: "t1theirs",
        },
        paid: [{ value: 50_000, recipient: "t1theirs" }],
        shows: {
          type: "Sent",
          amount: -50_000,
          fee: 10_000,
          from: "Transparent",
          to: "t1theirs",
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
        transparent: { spent: 60_000n, from: "t1ours", to: "t1theirs" },
        paid: [{ value: 50_000, recipient: "t1theirs" }],
        shows: {
          type: "Sent",
          amount: -50_000,
          fee: 10_000,
          from: "Transparent",
          to: "t1theirs",
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
        transparent: { spent: 100_000n, from: "t1ours" },
        shows: {
          type: "Shielded",
          amount: 85_000,
          fee: 15_000,
          from: "Transparent",
          to: "Shielded",
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
          from: "t1ours",
          to: "t1ours",
        },
        shows: {
          type: "Sent",
          amount: -90_000,
          fee: 10_000,
          from: "Transparent",
          to: "Transparent",
        },
        today: {
          type: "Sent",
          amount: -10_000,
          fee: 0,
          from: "Transparent",
          to: "Transparent",
        },
        zodl: "sent 10,000 · fee 10,000",
        zingo: "send-to-self 90,000 · fee 10,000",
        vizor: "sent 90,000 · fee 10,000 + received 90,000",
        zkool: "T. Self Transfer −10,000 · fee 10,000",
        decide:
          "Shows the fee as the amount, as the shielded self-payment did before #99. Expected follows 2.6's self-payment rule; a payment and change can't be told apart here.",
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
        shows: {
          type: "Received",
          amount: 16_000,
          fee: 0,
          from: "Shielded",
          to: "Shielded",
        },
        zodl: "received 16,000",
        zingo: "received 16,000",
        vizor: "received 16,000",
        zkool: "Receive 16,000",
        decide:
          "The sender's transparent address is public on chain. Show it as From, or keep \"Shielded\"? We don't read it today.",
      },
      {
        id: "xt-t",
        name: "to our transparent address",
        tx: "t1sender 60,000 → us t1ours 50,000 · fee 10,000",
        transparent: { received: 50_000n, from: "t1sender", to: "t1ours" },
        shows: {
          type: "Received",
          amount: 50_000,
          fee: 0,
          from: "t1sender",
          to: "Transparent",
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
    ? party.address
    : party.pool[0].toUpperCase() + party.pool.slice(1);

function show(c: Case): Shown {
  const blocks = new Map([
    [at.height, { txids: new Map([[at.tx_index, "tx"]]) } as Block],
  ]);
  const transparent = c.transparent && {
    txid: "tx",
    height: at.height,
    received: 0n,
    spent: 0n,
    ...c.transparent,
  };
  const a = buildActivity(
    c.notes ?? [],
    c.sent ?? [],
    transparent ? [transparent] : [],
    blocks,
    new Map(c.paid ? [[`${at.height}_${at.tx_index}`, c.paid]] : []),
    ours,
  ).find((entry) => entry.txid === "tx")!;
  return {
    type: a.tx_type,
    amount: Number(a.value),
    fee: Number(a.fee),
    from: label(a.from),
    to: label(a.to),
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
const shows = (s: Shown) => `${s.type} ${zec(s.amount)} · fee ${zec(s.fee)}`;
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
        "Zodl",
        "Zingo",
        "Vizor",
        "Zkool",
      ]),
      row(Array(7).fill("---")),
      ...list.map((c) =>
        row([
          `\`${c.id}\``,
          cell(c, shows),
          cell(c, parties),
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
  lines.push(
    "## Wrong today",
    "",
    ...all.filter((c) => c.today).map((c) => `- \`${c.id}\` ${c.name}`),
    "",
    "## Needs a decision",
    "",
    ...all.filter((c) => c.decide).map((c) => `- \`${c.id}\`: ${c.decide}`),
    "",
  );
  return lines.join("\n");
}

test("docs/design/activity-cases.md is the table above", async () => {
  await expect(markdown()).toMatchFileSnapshot(
    "../../../../../docs/design/activity-cases.md",
  );
});
