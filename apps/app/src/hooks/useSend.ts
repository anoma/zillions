import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";
import { ceilingOf, ceilingProblem } from "../lib/amount";
import { keychain } from "../lib/keychain/keychain";
import { base64ToBytes, bytesToBase64 } from "../lib/keychain/utils";
import { prefetchSaplingParams, warmProver } from "../lib/wallet/chain/submit";
import {
  prefetchTrees,
  type SendPlan,
  type SendRequest,
} from "../lib/wallet/send";
import type { Note, PendingActivity } from "../lib/wallet/types";
import { useAccount } from "./useAccount";
import { internalAddress } from "./useAddresses";
import { useDebouncedValue } from "./useDebouncedValue";
import { useInvalidateOnSync } from "./useInvalidateOnSync";
import { useSubmitStage } from "./useSubmitStage";
import { useWallet } from "./useWallet";

/**
 * The plan for `send` as the form changes; its fee is the one that will be
 * paid, and with `max` the plan picks the amount. `extra` is funded on top of
 * what the user sends (already in `amount`). `ceiling`, when fees leave the
 * user short, is the most they can send instead and that plan's fee once known.
 */
export function useSendPlan(
  { from, to, amount, memo }: SendRequest,
  max: boolean,
  extra = 0n,
) {
  const wallet = useWallet();
  // Synced notes change what a plan can spend.
  useInvalidateOnSync({ queryKey: ["sendPlan", wallet.id] });
  useInvalidateOnSync({ queryKey: ["maxSend", wallet.id] });
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
  const ceilingAmount = ceilingOf({
    most: maxAmount.data,
    wanted: debouncedAmount,
    short,
    max,
    extra,
  });
  const ceiling =
    ceilingAmount === undefined
      ? undefined
      : { amount: ceilingAmount, fee: atMax.data?.fee };
  const plan = max ? atMax : typed;
  useEffect(() => {
    if (plan.data) prefetchTrees(plan.data);
  }, [plan.data]);
  return { plan, maxAmount, ceiling };
}

/**
 * What a plan from transparent funds shields as change. Upstream shields a
 * transparent send's change when the recipient is shielded: the shielded side
 * then holds payment and change together, hiding the amount.
 */
export function shieldedChangeOf(plan?: SendPlan) {
  return (plan?.steps ?? [])
    .flatMap((step) => step.change)
    .filter((c) => c.pool !== "transparent")
    .reduce((sum, c) => sum + BigInt(c.value), 0n);
}

/** Why a send form's plan fails, for the user: an amount the source can't cover, or the error itself. */
export function planProblem({
  plan,
  maxAmount,
  ceiling,
}: ReturnType<typeof useSendPlan>) {
  if (ceiling) return ceilingProblem(ceiling.amount);
  return (plan.error ?? maxAmount.error)?.message;
}

/**
 * Builds the PCZT, has the keychain sign it, then proves and broadcasts it.
 * `toSelf` marks a payment to one of our own addresses (an unshield), shown
 * as pending with the change until it's mined; `shown` is how history lists
 * it meanwhile. Transparent change holds the internal address it went to, so
 * the next one goes elsewhere. `keep` limits the notes it may spend; with
 * `preparation`, it sends a migration's next preparation for those parts
 * instead of `send`.
 */
export function useSend() {
  const wallet = useWallet();
  const account = useAccount();
  const queryClient = useQueryClient();
  const { stages, track } = useSubmitStage();
  useEffect(warmProver, []);

  const mutation = useMutation({
    mutationFn: async ({
      toSelf,
      shown,
      keep,
      preparation,
      ...send
    }: SendRequest & {
      toSelf?: boolean;
      shown: Omit<PendingActivity, "fee" | "timestamp">;
      keep?: (note: Note) => boolean;
      preparation?: number[];
    }) => {
      track("building");
      const { pczt, plan, changeTo } = preparation
        ? await wallet.preparationPczt(preparation, account.shielded)
        : await wallet.sendPczt(send, account.shielded, keep);
      prefetchSaplingParams(pczt);
      track("approval");
      const signed = await keychain().sign({
        signer:
          send.from === "transparent"
            ? account.transparent.address
            : account.shielded.address,
        pczt: bytesToBase64(pczt),
      });
      const change = { shielded: 0n, transparent: 0n };
      for (const flow of plan.steps.flatMap((step) => step.change)) {
        change[flow.pool === "transparent" ? "transparent" : "shielded"] +=
          BigInt(flow.value);
      }
      if (toSelf) {
        const pool = "pool" in shown.to ? shown.to.pool : undefined;
        change[pool === "transparent" ? "transparent" : "shielded"] +=
          send.amount;
      }
      const receipt = { ...shown, fee: BigInt(plan.fee) };
      const { txid, expiryHeight, timestamp } = await wallet.submit(
        base64ToBytes(signed),
        change,
        receipt,
        track,
      );
      if (changeTo !== undefined) {
        await wallet.internalAddressUsed(changeTo, expiryHeight);
        await queryClient.invalidateQueries(internalAddress(wallet));
      }
      return { ...receipt, timestamp, txid, expiryHeight };
    },
    onSettled: (_, error) => track(undefined, error),
  });
  return { ...mutation, stages };
}
