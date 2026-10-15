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
  name: string;
  /** The transaction itself, which the wallet may see only part of. */
  inputs: string;
  outputs: string;
  /** What the wallet sees of it. */
  notes?: Note[];
  sent?: Sent[];
  transparent?: Partial<TransparentTx>;
  paid?: Payment[];
  shows: Shown;
  /** What history shows instead, while it's wrong. */
  today?: Shown;
  /** zcash_client_sqlite's v_transactions row, and zingolib's value transfers. */
  sqlite: string;
  zingo: string;
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
    "Shielded sends",
    [
      {
        name: "Orchard → someone's Orchard, with change (sender)",
        inputs: "Orchard 100,000",
        outputs: "them Orchard 10,000 · change Orchard 80,000 · fee 10,000",
        notes: [spent("orchard", 100_000), got("orchard", 80_000)],
        sent: [sent("orchard", 10_000)],
        shows: {
          type: "Sent",
          amount: -10_000,
          fee: 10_000,
          from: "Shielded",
          to: "u1theirs",
        },
        sqlite: "Δ −20,000 · fee 10,000",
        zingo: "sent 10,000 to u1theirs",
      },
      {
        name: "Orchard → someone's Orchard (receiver)",
        inputs: "their Orchard 100,000",
        outputs: "us Orchard 10,000 · their change · fee 10,000",
        notes: [got("orchard", 10_000, "external")],
        shows: {
          type: "Received",
          amount: 10_000,
          fee: 0,
          from: "Shielded",
          to: "Shielded",
        },
        sqlite: "Δ +10,000 · fee 10,000",
        zingo: "received 10,000",
        note: "Upstream reads the fee from the transaction's value balances; we show none on a receive.",
      },
      {
        name: "Orchard → someone's Orchard, no change (sender)",
        inputs: "Orchard 20,000",
        outputs: "them Orchard 10,000 · fee 10,000",
        notes: [spent("orchard", 20_000)],
        sent: [sent("orchard", 10_000)],
        shows: {
          type: "Sent",
          amount: -10_000,
          fee: 10_000,
          from: "Shielded",
          to: "u1theirs",
        },
        sqlite: "Δ −20,000 · fee 10,000",
        zingo: "sent 10,000 to u1theirs",
      },
      {
        name: "Sapling → someone's Sapling, with change (sender)",
        inputs: "Sapling 100,000",
        outputs: "them Sapling 10,000 · change Sapling 80,000 · fee 10,000",
        notes: [spent("sapling", 100_000), got("sapling", 80_000)],
        sent: [sent("sapling", 10_000)],
        shows: {
          type: "Sent",
          amount: -10_000,
          fee: 10_000,
          from: "Shielded",
          to: "u1theirs",
        },
        sqlite: "Δ −20,000 · fee 10,000",
        zingo: "sent 10,000 to u1theirs",
      },
      {
        name: "Ironwood → someone's Ironwood, with change (sender)",
        inputs: "Ironwood 100,000",
        outputs: "them Ironwood 10,000 · change Ironwood 80,000 · fee 10,000",
        notes: [spent("ironwood", 100_000), got("ironwood", 80_000)],
        sent: [sent("ironwood", 10_000)],
        shows: {
          type: "Sent",
          amount: -10_000,
          fee: 10_000,
          from: "Shielded",
          to: "u1theirs",
        },
        sqlite: "Δ −20,000 · fee 10,000",
        zingo: "sent 10,000 to u1theirs",
      },
      {
        name: "Orchard → someone's Sapling, change in Orchard (sender)",
        inputs: "Orchard 100,000",
        outputs: "them Sapling 10,000 · change Orchard 70,000 · fee 20,000",
        notes: [spent("orchard", 100_000), got("orchard", 70_000)],
        sent: [sent("sapling", 10_000)],
        shows: {
          type: "Sent",
          amount: -10_000,
          fee: 20_000,
          from: "Shielded",
          to: "u1theirs",
        },
        sqlite: "Δ −30,000 · fee 20,000",
        zingo: "sent 10,000 to u1theirs",
      },
      {
        name: "Orchard → someone's Sapling (receiver)",
        inputs: "their Orchard 100,000",
        outputs: "us Sapling 10,000 · their change · fee 20,000",
        notes: [got("sapling", 10_000, "external")],
        shows: {
          type: "Received",
          amount: 10_000,
          fee: 0,
          from: "Shielded",
          to: "Shielded",
        },
        sqlite: "Δ +10,000 · fee 20,000",
        zingo: "received 10,000",
      },
      {
        name: "Sapling → someone's Orchard, change in Orchard (sender)",
        inputs: "Sapling 100,000",
        outputs: "them Orchard 10,000 · change Orchard 70,000 · fee 20,000",
        notes: [spent("sapling", 100_000), got("orchard", 70_000)],
        sent: [sent("orchard", 10_000)],
        shows: {
          type: "Sent",
          amount: -10_000,
          fee: 20_000,
          from: "Shielded",
          to: "u1theirs",
        },
        sqlite: "Δ −30,000 · fee 20,000",
        zingo: "sent 10,000 to u1theirs",
        note: "Change goes to the pool paid into, as upstream's change strategy does.",
      },
      {
        name: "Orchard → two people (sender)",
        inputs: "Orchard 100,000",
        outputs:
          "them Orchard 10,000 · another Orchard 5,000 · change Orchard 70,000 · fee 15,000",
        notes: [spent("orchard", 100_000), got("orchard", 70_000)],
        sent: [sent("orchard", 10_000), sent("orchard", 5_000, "u1another")],
        shows: {
          type: "Sent",
          amount: -15_000,
          fee: 15_000,
          from: "Shielded",
          to: "u1theirs",
        },
        sqlite: "Δ −30,000 · fee 15,000",
        zingo: "two rows: sent 10,000 to u1theirs, sent 5,000 to u1another",
        decide:
          "To names only the first recipient; Zingo lists one row per recipient.",
      },
      {
        name: "Orchard → someone, recovery failed (sender)",
        inputs: "Orchard 100,000",
        outputs:
          "them Orchard 10,000 (not recovered) · change Orchard 80,000 · fee 10,000",
        notes: [spent("orchard", 100_000), got("orchard", 80_000)],
        shows: {
          type: "Sent",
          amount: -20_000,
          fee: 0,
          from: "Shielded",
          to: "Shielded",
        },
        sqlite: "Δ −20,000 · fee 10,000",
        zingo: "not checked",
        note: "Amount is inputs − change, fee included; fee unknown. Upstream still knows the fee from the value balances.",
      },
      {
        name: "Sapling → someone's Orchard, change in Orchard, recovery failed (sender)",
        inputs: "Sapling 100,000",
        outputs:
          "them Orchard 10,000 (not recovered) · change Orchard 70,000 · fee 20,000",
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
        sqlite: "Δ −30,000 · fee 20,000 · crossing 70,000",
        zingo: "not checked",
        note: "Change in a pool nothing was spent from reads as funds moved there. Upstream makes the same call.",
      },
    ],
  ],
  [
    "Paying our own shielded addresses",
    [
      {
        name: "Orchard → own Orchard address (self-payment)",
        inputs: "Orchard 100,000",
        outputs: "own Orchard 10,000 · change Orchard 80,000 · fee 10,000",
        notes: [
          spent("orchard", 100_000),
          got("orchard", 80_000),
          got("orchard", 10_000, "external"),
        ],
        shows: {
          type: "Sent",
          amount: -10_000,
          fee: 10_000,
          from: "Shielded",
          to: "Shielded",
        },
        sqlite: "Δ −10,000 · fee 10,000",
        zingo: "send-to-self 90,000",
        note: "product.md 2.6: amount is what it paid, the fee apart. Upstream's Δ is the fee alone; Zingo counts the change too.",
      },
      {
        name: "Orchard → own Sapling address",
        inputs: "Orchard 100,000",
        outputs: "own Sapling 10,000 · change Orchard 70,000 · fee 20,000",
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
        sqlite: "Δ −20,000 · fee 20,000 · crossing 10,000",
        zingo: "send-to-self 80,000",
      },
      {
        name: "Orchard → Ironwood, all of it (Move to Ironwood)",
        inputs: "Orchard 100,000",
        outputs: "own Ironwood 80,000 · fee 20,000",
        notes: [spent("orchard", 100_000), got("ironwood", 80_000)],
        shows: {
          type: "Migrated",
          amount: 80_000,
          fee: 20_000,
          from: "Orchard",
          to: "Ironwood",
        },
        sqlite: "Δ −20,000 · fee 20,000 · crossing 80,000",
        zingo: "migration 80,000",
      },
      {
        name: "Orchard → Ironwood, part of it (Move to Ironwood)",
        inputs: "Orchard 100,000",
        outputs: "own Ironwood 30,000 · change Orchard 50,000 · fee 20,000",
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
        sqlite: "Δ −20,000 · fee 20,000 · crossing 30,000",
        zingo: "migration 30,000",
      },
    ],
  ],
  [
    "Transparent",
    [
      {
        name: "Orchard → someone's transparent address (sender)",
        inputs: "Orchard 100,000",
        outputs: "them t1theirs 10,000 · change Orchard 75,000 · fee 15,000",
        notes: [spent("orchard", 100_000), got("orchard", 75_000)],
        paid: [{ value: 10_000, recipient: "t1theirs" }],
        shows: {
          type: "Sent",
          amount: -10_000,
          fee: 15_000,
          from: "Shielded",
          to: "t1theirs",
        },
        sqlite: "Δ −25,000 · fee 15,000",
        zingo: "sent 10,000 to t1theirs",
      },
      {
        name: "Orchard → someone's transparent address (receiver)",
        inputs: "their Orchard 100,000",
        outputs: "us t1ours 10,000 · their change · fee 15,000",
        transparent: { received: 10_000n, to: "t1ours" },
        shows: {
          type: "Received",
          amount: 10_000,
          fee: 0,
          from: "Shielded",
          to: "Transparent",
        },
        today: {
          type: "Received",
          amount: 10_000,
          fee: 0,
          from: "Transparent",
          to: "Transparent",
        },
        sqlite: "Δ +10,000 · fee 15,000",
        zingo: "received 10,000",
        note: "No transparent input means no transparent sender: the funds came from a shielded pool.",
      },
      {
        name: "Transparent → someone's Ironwood, no change (sender, mainnet 61f4832b…)",
        inputs: "t1ours 41,000 (3 coins)",
        outputs: "them Ironwood 16,000 · fee 25,000",
        sent: [sent("ironwood", 16_000)],
        transparent: { spent: 41_000n, from: "t1ours" },
        shows: {
          type: "Sent",
          amount: -16_000,
          fee: 25_000,
          from: "Transparent",
          to: "u1theirs",
        },
        sqlite: "Δ −41,000 · fee 25,000",
        zingo: "sent 16,000 to u1theirs",
      },
      {
        name: "Transparent → someone's Ironwood, shielded change (sender)",
        inputs: "t1ours 46,000",
        outputs: "them Ironwood 16,000 · change Ironwood 5,000 · fee 25,000",
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
        sqlite: "Δ −41,000 · fee 25,000",
        zingo: "sent 16,000 to u1theirs",
      },
      {
        name: "Transparent → someone's Ironwood, transparent change (sender)",
        inputs: "t1ours 50,000",
        outputs: "them Ironwood 16,000 · change t1change 9,000 · fee 25,000",
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
        sqlite: "Δ −41,000 · fee 25,000",
        zingo: "sent 16,000 to u1theirs",
      },
      {
        name: "Transparent → someone's Ironwood (receiver)",
        inputs: "t1sender 41,000",
        outputs: "us Ironwood 16,000 · fee 25,000",
        notes: [got("ironwood", 16_000, "external")],
        shows: {
          type: "Received",
          amount: 16_000,
          fee: 0,
          from: "Shielded",
          to: "Shielded",
        },
        sqlite: "Δ +16,000 · fee unknown",
        zingo: "received 16,000",
        decide:
          "The sender's transparent address is public on chain. Show it as From, or keep \"Shielded\"? We don't read it today.",
      },
      {
        name: "Transparent → someone's transparent address, with change (sender)",
        inputs: "t1ours 100,000",
        outputs: "them t1theirs 50,000 · change t1change 40,000 · fee 10,000",
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
        today: {
          type: "Sent",
          amount: -60_000,
          fee: 0,
          from: "Transparent",
          to: "t1theirs",
        },
        sqlite: "Δ −60,000 · fee 10,000",
        zingo: "sent 50,000 to t1theirs",
        note: "What it paid is read from the block, but only a transaction with a shielded side uses it.",
      },
      {
        name: "Transparent → someone's transparent address, no change (sender)",
        inputs: "t1ours 60,000",
        outputs: "them t1theirs 50,000 · fee 10,000",
        transparent: { spent: 60_000n, from: "t1ours", to: "t1theirs" },
        paid: [{ value: 50_000, recipient: "t1theirs" }],
        shows: {
          type: "Sent",
          amount: -50_000,
          fee: 10_000,
          from: "Transparent",
          to: "t1theirs",
        },
        today: {
          type: "Sent",
          amount: -60_000,
          fee: 0,
          from: "Transparent",
          to: "t1theirs",
        },
        sqlite: "Δ −60,000 · fee 10,000",
        zingo: "sent 50,000 to t1theirs",
      },
      {
        name: "Transparent → someone's transparent address (receiver)",
        inputs: "t1sender 60,000",
        outputs: "us t1ours 50,000 · fee 10,000",
        transparent: { received: 50_000n, from: "t1sender", to: "t1ours" },
        shows: {
          type: "Received",
          amount: 50_000,
          fee: 0,
          from: "t1sender",
          to: "Transparent",
        },
        sqlite: "Δ +50,000 · fee unknown",
        zingo: "received 50,000",
      },
      {
        name: "Transparent → own transparent address",
        inputs: "t1ours 100,000",
        outputs: "own t1change 90,000 · fee 10,000",
        transparent: {
          spent: 100_000n,
          received: 90_000n,
          from: "t1ours",
          to: "t1change",
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
        sqlite: "Δ −10,000 · fee 10,000",
        zingo: "send-to-self 90,000",
        decide:
          "Shows the fee as the amount, as the shielded self-payment did before #99. Expected follows 2.6's self-payment rule; a payment and change can't be told apart here.",
      },
    ],
  ],
  [
    "Shield and unshield",
    [
      {
        name: "Shield",
        inputs: "t1ours 100,000",
        outputs: "own Orchard 85,000 · fee 15,000",
        notes: [got("orchard", 85_000)],
        transparent: { spent: 100_000n, from: "t1ours" },
        shows: {
          type: "Shielded",
          amount: 85_000,
          fee: 15_000,
          from: "Transparent",
          to: "Shielded",
        },
        sqlite: "Δ −15,000 · fee 15,000 · is_shielding",
        zingo: "shield 85,000",
      },
      {
        name: "Unshield (to a new address of our own)",
        inputs: "Orchard 100,000",
        outputs: "own t1internal 10,000 · change Orchard 75,000 · fee 15,000",
        notes: [spent("orchard", 100_000), got("orchard", 75_000)],
        transparent: { received: 10_000n, to: "t1internal" },
        shows: {
          type: "Unshielded",
          amount: 10_000,
          fee: 15_000,
          from: "Shielded",
          to: "Transparent",
        },
        sqlite: "Δ −15,000 · fee 15,000",
        zingo: "send-to-self 85,000",
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
    test(`${group}: ${c.name}`, () => {
      expect(show(c)).toEqual(c.today ?? c.shows);
    });
    if (c.today) {
      test.fails(`${group}: ${c.name}, once fixed`, () => {
        expect(show(c)).toEqual(c.shows);
      });
    }
  }
}

const zec = (n: number) => n.toLocaleString("en-US").replace("-", "−");

function markdown() {
  const all = cases.flatMap(([, list]) => list);
  const cell = (s: string) => s.replace(/\|/g, "\\|");
  const shown = (c: Case, key: keyof Shown) => {
    const value = (s: Shown) =>
      typeof s[key] === "number" ? zec(s[key]) : String(s[key]);
    return c.today && c.today[key] !== c.shows[key]
      ? `**${value(c.shows)}** (today ${value(c.today)})`
      : value(c.shows);
  };
  const lines = [
    "# History cases",
    "",
    "<!-- Generated by apps/app/src/lib/wallet/activity.cases.test.ts; edit the cases there and run `vitest -u`. -->",
    "",
    "Every transaction shape history (product.md 2.6) can show: the transaction, then",
    "the type, amount, fee, from and to `buildActivity` gives it. Amounts and fees are",
    "in zatoshis; fees follow ZIP 317 (5,000 per logical action, at least 2).",
    "",
    "- **Bold** cells are what history should show where it shows something else",
    "  today; those cases pin today's output and fail once fixed.",
    "- *sqlite* is zcash_client_sqlite 0.22's `v_transactions`: `account_balance_delta`",
    "  (Δ), `fee_paid`, `is_shielding`, `pool_crossing_value` (crossing).",
    "- *Zingo* is zingolib's value transfers (`perspective.rs`), one row per",
    "  recipient or per pool received into; its fee is always read from the transaction.",
    "",
  ];
  for (const [group, list] of cases) {
    lines.push(
      `## ${group}`,
      "",
      "| Case | Inputs | Outputs | Type | Amount | Fee | From | To | sqlite | Zingo | Notes |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      ...list.map((c) =>
        [
          c.name,
          c.inputs,
          c.outputs,
          shown(c, "type"),
          shown(c, "amount"),
          shown(c, "fee"),
          shown(c, "from"),
          shown(c, "to"),
          c.sqlite,
          c.zingo,
          [c.note, c.decide && `**Decide:** ${c.decide}`]
            .filter(Boolean)
            .join(" "),
        ]
          .map(cell)
          .join(" | ")
          .replace(/^/, "| ")
          .concat(" |"),
      ),
      "",
    );
  }
  lines.push(
    "## Wrong today",
    "",
    ...all.filter((c) => c.today).map((c) => `- ${c.name}`),
    "",
    "## Needs a decision",
    "",
    ...all.filter((c) => c.decide).map((c) => `- ${c.name}: ${c.decide}`),
    "",
  );
  return lines.join("\n");
}

test("docs/design/activity-cases.md is the table above", async () => {
  await expect(markdown()).toMatchFileSnapshot(
    "../../../../../docs/design/activity-cases.md",
  );
});
