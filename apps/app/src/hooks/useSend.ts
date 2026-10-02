import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { keychain } from "../lib/keychain/keychain";
import { base64ToBytes, bytesToBase64 } from "../lib/keychain/utils";
import { zatoshiToZec } from "../lib/utils";
import type { SendRequest } from "../lib/zcrawler/send";
import { useAccount } from "./useAccount";
import { internalAddress } from "./useAddresses";
import { useDebouncedValue } from "./useDebouncedValue";
import { useWallet } from "./useWallet";

/**
 * The plan for `send` as the form changes: its fee is the one that will be
 * paid. With `max`, the amount is left to the plan: the most the source can
 * pay to this recipient after fees. `ceiling` is set when the typed amount
 * and its fee are more than the source holds: the most it can send instead,
 * and that plan's fee once known.
 */
export function useSendPlan(
  { from, to, amount, memo }: SendRequest,
  max: boolean,
) {
  const wallet = useWallet();
  const debouncedTo = useDebouncedValue(to);
  const debouncedAmount = useDebouncedValue(amount);
  const debouncedMemo = useDebouncedValue(memo);

  const planOf = (amount: bigint, enabled: boolean) =>
    queryOptions({
      queryKey: [
        "sendPlan",
        wallet.id,
        from,
        debouncedTo,
        amount.toString(),
        debouncedMemo,
      ],
      queryFn: () =>
        wallet.planSend({ from, to: debouncedTo, amount, memo: debouncedMemo }),
      enabled: enabled && Boolean(debouncedTo) && amount > 0n,
      retry: false,
    });

  const typed = useQuery(planOf(debouncedAmount, !max));
  // A typed amount that fails may be more than the source can cover.
  const short = !max && typed.isError;
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
      enabled: (max || short) && Boolean(debouncedTo),
      retry: false,
    }),
  );
  const atMax = useQuery(planOf(maxAmount.data ?? 0n, max || short));
  const ceiling =
    short && maxAmount.data !== undefined && debouncedAmount > maxAmount.data
      ? { amount: maxAmount.data, fee: atMax.data?.fee }
      : undefined;
  return { plan: max ? atMax : typed, maxAmount, ceiling };
}

/** Why a send form's plan fails, for the user: an amount the source can't cover, or the error itself. */
export function planProblem({
  plan,
  maxAmount,
  ceiling,
}: ReturnType<typeof useSendPlan>) {
  if (ceiling) {
    return ceiling.amount > 0n
      ? `Not enough to also pay the fee: you can send up to ${zatoshiToZec(ceiling.amount)} ZEC`
      : "Not enough to pay the fee";
  }
  return (plan.error ?? maxAmount.error)?.message;
}

/**
 * Builds the PCZT, has the keychain sign it, then proves and broadcasts it.
 * `toSelf` marks a payment to one of our own addresses (an unshield), shown
 * as pending with the change until it's mined. Transparent change holds the
 * internal address it went to, so the next one goes elsewhere.
 */
export function useSend() {
  const wallet = useWallet();
  const account = useAccount();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      toSelf,
      ...send
    }: SendRequest & { toSelf?: boolean }) => {
      const { pczt, plan, changeTo } = await wallet.sendPczt(
        send,
        account.shielded,
      );
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
      if (changeTo !== undefined) {
        await wallet.internalAddressUsed(changeTo, expiryHeight);
        await queryClient.invalidateQueries(internalAddress(wallet));
      }
      return {
        txid,
        expiryHeight,
        fee: BigInt(plan.fee),
        timestamp: Math.floor(Date.now() / 1000),
      };
    },
  });
}
