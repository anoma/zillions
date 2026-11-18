// Claiming a payment link: docs/design/payment-links.md, "Claim".
import { bytesToBase64 } from "@zillions/keychain-types";
import initZcore, { link_info } from "@zillions/zcore";
import { keychain } from "../keychain/keychain";
import { CLAIM_FEE } from "../paymentLink";
import {
  CHUNK_SIZE,
  fetchSpent,
  fetchTreeSizes,
  lastChunk,
} from "./chain/indexer";
import { fetchLatestHeight } from "./chain/lightwalletd";
import { broadcastTransaction, type ProveStage } from "./chain/submit";
import { NETWORK } from "./config";
import { fetchTrees, wireTrees } from "./send";
import { chunkChannel } from "./shielded/crawl";
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
  const lookups = chunkChannel();
  try {
    const from = Math.floor(treeSize / CHUNK_SIZE);
    for (let chunk = from; chunk <= lastChunk(ironwood); chunk++) {
      const { hits } = await lookups.run({
        key: { ufvk },
        chunk,
        pool: "ironwood",
      });
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
 * Claims `note` into a fresh address of the shielded account with id
 * `account`: the keychain builds it, signed with the link key, and proves
 * it; this page broadcasts it. No Keychain approval: the link signs for itself.
 */
export async function claimLink({
  account,
  key,
  note,
  onStage,
}: {
  account: string;
  key: Uint8Array;
  note: DecryptedNote;
  onStage: (stage: ProveStage) => void;
}) {
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
  const proved = await keychain().claimLink(
    {
      account,
      key: bytesToBase64(key),
      note: note.note,
      position: note.position,
      trees: wireTrees(trees),
      tip,
    },
    onStage,
  );
  return broadcastTransaction(proved, onStage);
}
