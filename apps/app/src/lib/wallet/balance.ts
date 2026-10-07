import { held } from "./pending";
import type { WalletData } from "./send";
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

export function balances(
  notes: Note[],
  utxos: OwnUtxo[],
  pending: PendingTx[],
) {
  const free = spendable(notes, utxos, pending);
  return {
    shieldedBalance: total(free.notes),
    /** The part of `shieldedBalance` still in Orchard, closed since NU6.3. */
    orchardBalance: total(free.notes.filter((n) => n.pool === "orchard")),
    pendingChange: pending.reduce((sum, p) => sum + BigInt(p.change), 0n),
    // TODO
    pendingSpendable: 0n,
    unshieldedBalance: total(free.utxos),
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
