// Claiming a payment link: docs/design/payment-links.md, "Claim".
import initZcore, {
  claim_pczt,
  fresh_address,
  link_info,
} from "@zillions/zcore";
import { CLAIM_FEE } from "../paymentLink";
import {
  CHUNK_SIZE,
  fetchSpent,
  fetchTreeSizes,
  lastChunk,
} from "./chain/indexer";
import { fetchLatestHeight } from "./chain/lightwalletd";
import { type ProveStage, submitTransaction } from "./chain/submit";
import { NETWORK } from "./config";
import { fetchTrees } from "./send";
import { workerChannel } from "./shielded/crawl";
import type { DecryptedNote } from "./types";

export type LinkStatus =
  /** The funding isn't mined yet. */
  | { state: "funding" }
  | { state: "claimable"; note: DecryptedNote }
  /** Claimed or cancelled: the claimer can't tell which. */
  | { state: "claimed" };

const hexBytes = (hex: string) =>
  Uint8Array.from(hex.match(/../g) ?? [], (b) => parseInt(b, 16));

/**
 * Where the link's note stands: trial-decrypted with the link's own viewing
 * key from chunk ⌊treeSize / CHUNK_SIZE⌋, where it lands, up to the tip.
 */
export async function linkStatus(
  key: Uint8Array,
  treeSize: number,
): Promise<LinkStatus> {
  await initZcore();
  const { ufvk } = link_info(NETWORK, key) as { ufvk: string };
  const { ironwood } = await fetchTreeSizes();
  const lookups = workerChannel();
  try {
    const from = Math.floor(treeSize / CHUNK_SIZE);
    for (let chunk = from; chunk <= lastChunk(ironwood); chunk++) {
      const { hits } = await lookups.run({ ufvk, chunk, pool: "ironwood" });
      const [note] = hits;
      if (!note) continue;
      // ponytail: names the link's nullifier to the indexer; read whole
      // `/nullifiers` chunks instead once the app decodes them.
      const [spent] = await fetchSpent("ironwood", hexBytes(note.nf_mine));
      return spent ? { state: "claimed" } : { state: "claimable", note };
    }
    return { state: "funding" };
  } finally {
    lookups.terminate();
  }
}

/**
 * Claims `note` into a fresh address of the account `ufvk` names: built and
 * signed with the link key, then proven and broadcast. No Keychain approval:
 * the link signs for itself.
 */
export async function claimLink({
  key,
  note,
  ufvk,
  onStage,
}: {
  key: Uint8Array;
  note: DecryptedNote;
  ufvk: string;
  onStage: (stage: ProveStage) => void;
}) {
  await initZcore();
  const fee = Number(CLAIM_FEE);
  const pool = "ironwood" as const;
  const [trees, tip] = await Promise.all([
    fetchTrees({
      fee,
      steps: [
        {
          inputs: [{ pool, value: note.value }],
          notes: [{ pool, position: note.position }],
          payments: [{ pool, value: note.value - fee }],
          change: [],
          fee,
        },
      ],
    }),
    fetchLatestHeight(),
  ]);
  const signed = claim_pczt(
    NETWORK,
    key,
    note.note,
    BigInt(note.position),
    trees,
    fresh_address(NETWORK, ufvk),
    ufvk,
    tip,
  );
  return submitTransaction(signed, onStage);
}
