import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { base64ToBytes, bytesToBase64 } from "@zillions/keychain-types";
import initZcore, { link_info, new_link_key } from "@zillions/zcore";
import { useEffect, useState } from "react";
import { keychain } from "../lib/keychain/keychain";
import {
  CLAIM_FEE,
  type ClaimLink,
  linkMemo,
  linkUrl,
} from "../lib/paymentLink";
import { fetchTreeSizes } from "../lib/wallet/chain/indexer";
import { claimLink, linkStatus } from "../lib/wallet/claim";
import { NETWORK } from "../lib/wallet/config";
import { useAccount } from "./useAccount";
import type { useSend } from "./useSend";
import { useSubmitStage } from "./useSubmitStage";
import { useWallet } from "./useWallet";

type NewLink = { key: Uint8Array; address: string; nk: string };

/**
 * A new payment link's key, made once per mount so toggling or editing the
 * form keeps the same link. Held in memory only; undefined while it's made.
 */
export function useNewLink() {
  const [link, setLink] = useState<NewLink>();

  useEffect(() => {
    let live = true;
    initZcore().then(() => {
      const key = new_link_key();
      const info = link_info(NETWORK, key) as { address: string; nk: string };
      if (live) setLink({ key, ...info });
    });
    return () => {
      live = false;
    };
  }, []);

  return link;
}

/**
 * Funds `link` through `send`: the Keychain seals its key into the memo, so
 * the sender's seed alone can show it again. Resolves with the link to share.
 */
export function useCreateLink(send: ReturnType<typeof useSend>) {
  return useMutation({
    mutationFn: async ({
      link,
      from,
      amount,
      description,
    }: {
      link: NewLink;
      from: "shielded" | "transparent";
      amount: bigint;
      description: string;
    }) => {
      const zc = keychain();
      if (typeof zc.sealLinkKey !== "function") {
        throw new Error("Update the Keychain to create payment links");
      }
      const sealed = base64ToBytes(
        await zc.sealLinkKey(bytesToBase64(link.key)),
      );
      const memoHex = linkMemo(link.nk, sealed, description);
      // Read before funding, so the note lands at or after it.
      const { ironwood } = await fetchTreeSizes();
      const tx = await send.mutateAsync({
        from,
        to: link.address,
        amount: amount + CLAIM_FEE,
        memoHex,
        shown: {
          tx_type: "Sent",
          value: -(amount + CLAIM_FEE),
          from: { pool: from },
          to: { address: link.address },
          memo: description || undefined,
        },
      });
      const url = linkUrl({
        base: `${window.location.origin}${import.meta.env.BASE_URL}`,
        key: link.key,
        amount,
        treeSize: ironwood,
        network: NETWORK,
        description,
      });
      return { tx, url, amount, description };
    },
  });
}

/**
 * The payment link transaction `txid` funded, and `reveal`, which asks the
 * Keychain to open it. The link stays in memory only: gone once the user
 * leaves the page.
 */
export function useShowLink(txid: string, enabled: boolean) {
  const wallet = useWallet();
  const funding = useQuery(
    queryOptions({
      queryKey: ["linkOf", wallet.id, txid],
      queryFn: async () => (await wallet.linkOf(txid)) ?? null,
      enabled,
      staleTime: Infinity,
      retry: false,
    }),
  ).data;

  const reveal = useMutation({
    mutationFn: async () => {
      const link = funding?.link;
      if (!funding || !link) throw new Error("Not a payment link");
      const zc = keychain();
      if (typeof zc.openLinkKey !== "function") {
        throw new Error("Update the Keychain to show payment links again");
      }
      const key = base64ToBytes(await zc.openLinkKey(link));
      await initZcore();
      const { address } = link_info(NETWORK, key) as { address: string };
      // A key that doesn't hold the funded note would be a link to nothing.
      if (address !== funding.recipient) {
        throw new Error("This link doesn't match the payment it came from");
      }
      return linkUrl({
        base: `${window.location.origin}${import.meta.env.BASE_URL}`,
        key,
        amount: BigInt(funding.value) - CLAIM_FEE,
        treeSize: funding.position,
        network: NETWORK,
        description: funding.memo ?? "",
      });
    },
  });

  return { isLink: Boolean(funding?.link), description: funding?.memo, reveal };
}

const linkStatusOf = (link: ClaimLink) =>
  queryOptions({
    queryKey: ["linkStatus", bytesToBase64(link.key), link.treeSize],
    queryFn: () => linkStatus(link.key, link.treeSize),
    // Until it's mined, look again each block or so.
    refetchInterval: (query) =>
      query.state.data?.state === "funding" ? 15_000 : false,
    retry: false,
  });

/** Where `link`'s money stands: on its way, claimable or gone. Works signed out. */
export const useLinkStatus = (link: ClaimLink) => useQuery(linkStatusOf(link));

/** Claims `link` into the connected account; a failed claim looks the link up again. */
export function useClaimLink(link: ClaimLink) {
  const account = useAccount().shielded.id;
  const queryClient = useQueryClient();
  const { stages, track } = useSubmitStage();
  const mutation = useMutation({
    mutationFn: async () => {
      const status = queryClient.getQueryData(linkStatusOf(link).queryKey);
      if (status?.state !== "claimable") throw new Error("Nothing to claim");
      track("building");
      return claimLink({
        account,
        key: link.key,
        note: status.note,
        onStage: track,
      });
    },
    onSettled: (_, error) => {
      track(undefined, error);
      // Someone may have claimed it first.
      if (error) queryClient.invalidateQueries(linkStatusOf(link));
    },
  });
  return { ...mutation, stages };
}
