import { held } from "./pending";
import type { Source, Spendable, WalletData } from "./send";
import type { OwnUtxo } from "./transparent";
import type { Note, PendingTx, WalletState } from "./types";

const total = (of: { value: number }[]) =>
  of.reduce((sum, { value }) => sum + BigInt(value), 0n);

/** Notes checked unspent and UTXOs, less what pending transactions spend. */
export function spendable(
  notes: Note[],
  utxos: OwnUtxo[],
  pending: PendingTx[],
) {
  const hold = held(pending);
  return {
    notes: notes.filter(
      (n) => n.spend.status === "unspent" && !hold.notes.has(n.nf_mine),
    ),
    utxos: utxos.filter((u) => !hold.coins.has(`${u.txid}:${u.index}`)),
  };
}

/**
 * Per source: `balance`, everything it holds with what pending transactions
 * return; `available`, what a send can spend now; and `waiting`, what will be
 * once it's confirmed. Dust is in `balance` alone. Without `now` (no tip yet),
 * everything not pending counts as available.
 */
export function balances(
  notes: Note[],
  utxos: OwnUtxo[],
  pending: PendingTx[],
  now?: Spendable,
) {
  const free = spendable(notes, utxos, pending);
  const own = { shielded: total(free.notes), transparent: total(free.utxos) };
  const returning = { shielded: 0n, transparent: 0n };
  for (const p of pending) {
    const transparent = BigInt(p.transparentChange ?? 0);
    returning.transparent += transparent;
    returning.shielded += BigInt(p.change) - transparent;
  }
  const of = (source: Source) => ({
    balance: own[source] + returning[source],
    available: now?.[source].now ?? own[source],
    waiting:
      returning[source] + (now ? now[source].later - now[source].now : 0n),
  });
  return {
    shielded: of("shielded"),
    transparent: of("transparent"),
    /** Orchard notes not held by a pending transaction: Orchard is closed since NU6.3. */
    orchardBalance: total(free.notes.filter((n) => n.pool === "orchard")),
  };
}

/** What zcore plans a send from, at `tip`; a note whose block isn't fetched gets a stand-in txid. */
export function walletData(
  tip: number,
  { notes, utxos }: ReturnType<typeof spendable>,
  blocks: WalletState["blocks"],
): WalletData {
  return {
    tip,
    notes: notes.map((n) => ({
      pool: n.pool,
      scope: n.scope,
      note: n.note,
      output_index: n.output_index,
      position: n.position,
      height: n.height,
      // Only names the note: a block not fetched yet mustn't hold a send up.
      txid:
        blocks.get(n.height)?.txids.get(n.tx_index) ??
        n.position.toString(16).padStart(64, "0"),
    })),
    utxos,
  };
}
