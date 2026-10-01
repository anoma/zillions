import { queryOptions, useMutation, useQuery } from "@tanstack/react-query";
import { keychain } from "../lib/keychain/keychain";
import { base64ToBytes, bytesToBase64 } from "../lib/keychain/utils";
import type { SendRequest } from "../lib/zcrawler/send";
import { useAccount } from "./useAccount";
import { useDebouncedValue } from "./useDebouncedValue";
import { useWallet } from "./useWallet";

/**
 * The plan for `send` as the form changes: its fee is the one that will be
 * paid. With `max`, the amount is left to the plan: the most the source can
 * pay to this recipient after fees.
 */
export function useSendPlan(
  { from, to, amount, memo }: SendRequest,
  max: boolean,
) {
  const wallet = useWallet();
  const debouncedTo = useDebouncedValue(to);
  const debouncedAmount = useDebouncedValue(amount);
  const debouncedMemo = useDebouncedValue(memo);

  const maxAmount = useQuery(
    queryOptions({
      queryKey: ["maxSend", wallet.id, from, debouncedTo, debouncedMemo],
      queryFn: () =>
        wallet.maxSend({
          from,
          to: debouncedTo,
          amount: 0n,
          memo: debouncedMemo,
        }),
      enabled: max && Boolean(debouncedTo),
      retry: false,
    }),
  );
  const planned = max ? (maxAmount.data ?? 0n) : debouncedAmount;
  const plan = useQuery(
    queryOptions({
      queryKey: [
        "sendPlan",
        wallet.id,
        from,
        debouncedTo,
        planned.toString(),
        debouncedMemo,
      ],
      queryFn: () =>
        wallet.planSend({
          from,
          to: debouncedTo,
          amount: planned,
          memo: debouncedMemo,
        }),
      enabled: Boolean(debouncedTo) && planned > 0n,
      retry: false,
    }),
  );
  return { plan, maxAmount };
}

/**
 * Builds the PCZT, has the keychain sign it, then proves and broadcasts it.
 * `toSelf` marks a payment to one of our own addresses (an unshield), shown
 * as pending with the change until it's mined.
 */
export function useSend() {
  const wallet = useWallet();
  const account = useAccount();

  return useMutation({
    mutationFn: async ({
      toSelf,
      ...send
    }: SendRequest & { toSelf?: boolean }) => {
      const { pczt, plan } = await wallet.sendPczt(send, account.shielded);
      const signed = await keychain().sign({
        signer:
          send.from === "transparent"
            ? account.transparent.address
            : account.shielded.address,
        pczt: bytesToBase64(pczt),
      });
      const change = plan.steps
        .flatMap((step) => step.change)
        .reduce((sum, flow) => sum + BigInt(flow.value), 0n);
      const { txid, expiryHeight } = await wallet.submit(
        base64ToBytes(signed),
        change + (toSelf ? send.amount : 0n),
      );
      return {
        txid,
        expiryHeight,
        fee: BigInt(plan.fee),
        timestamp: Date.now(),
      };
    },
  });
}
