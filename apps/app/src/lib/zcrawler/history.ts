import type { TransactionReceipt } from "../sdk/types";
import type { Note, Sent, TxLocator } from "./types";

/** A transaction's identity in history, until real txids are served. */
const locatorId = ({ height, tx_index }: TxLocator) => `${height}_${tx_index}`;

/** Everything one transaction did to this wallet. */
type TxGroup = {
  locator: TxLocator;
  received: Note[];
  /** Notes this transaction spent — they were received in an earlier one. */
  spent: Note[];
  sent: Sent[];
};

const sum = (of: { value: number }[]) =>
  of.reduce((total, { value }) => total + BigInt(value), 0n);

/**
 * One entry per transaction, newest first: everything the wallet received in
 * it, spent in it, and sent from it.
 *
 * `txid` is the locator, not a real hash, so the receipt card's hash and
 * explorer link stay placeholders. Fees need the transparent side of a
 * transaction, and timestamps a block header; neither is fetched.
 */
export function buildHistory(
  notes: Note[],
  sent: Sent[],
): TransactionReceipt[] {
  const txs = new Map<string, TxGroup>();
  const at = (locator: TxLocator) => {
    const id = locatorId(locator);
    let tx = txs.get(id);
    if (!tx) {
      tx = { locator, received: [], spent: [], sent: [] };
      txs.set(id, tx);
    }
    return tx;
  };

  for (const note of notes) {
    at(note).received.push(note);
    if (note.spent) at(note.spent).spent.push(note);
  }
  for (const out of sent) at(out).sent.push(out);

  return [...txs.values()]
    .sort(
      (a, b) =>
        b.locator.height - a.locator.height ||
        b.locator.tx_index - a.locator.tx_index,
    )
    .map(({ locator, received, spent, sent }) => {
      // Spending without a recovered output still means it left the wallet:
      // fall back to what the inputs were worth net of change, fee included.
      const outgoing = sent.length > 0 || spent.length > 0;
      const outflow = sent.length ? sum(sent) : sum(spent) - sum(received);
      const pools = new Set(
        [...received, ...spent, ...sent].map((p) => p.pool),
      );
      const [details] = sent.length ? sent : received;

      return {
        txid: locatorId(locator),
        tx_type: outgoing ? "Sent" : "Received",
        value: outgoing ? -outflow : sum(received),
        fee: 0n,
        block_height: locator.height,
        confirmations: 0,
        status: "Confirmed",
        memo: details?.memo,
        timestamp: undefined,
        pool: pools.size === 1 ? [...pools][0] : "mixed",
        // Only a send knows its counterparty: on the receiving side the
        // recipient is our own address, and the sender is never revealed.
        to_address: sent.length ? details.recipient : undefined,
        from_address: undefined,
      };
    });
}
