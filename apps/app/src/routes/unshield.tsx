import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { twMerge } from "tailwind-merge";
import { AmountInput } from "../components/AmountInput";
import { PageShell } from "../components/PageShell";
import { FeeRow, PlannedFee, TotalRow } from "../components/PlannedFee";
import {
  AvailableWithMax,
  FormError,
  PoolRoute,
  SubmitProgress,
  TransferForm,
} from "../components/TransferForm";
import { TransferSuccess } from "../components/TransferSuccess";
import { ActionButton } from "../components/ui/ActionButton";
import { cardClassName, sectionLabelClassName } from "../components/ui/utils";
import { internalAddress, useInternalAddress } from "../hooks/useAddresses";
import { useGetBalance } from "../hooks/useGetBalance";
import { planProblem, useSend, useSendPlan } from "../hooks/useSend";
import { useWallet } from "../hooks/useWallet";
import { zatoshiToZec, zecToZatoshi } from "../lib/utils";

export const Route = createFileRoute("/unshield")({
  component: UnshieldRoute,
});

/**
 * Moves shielded funds to a transparent address of the account that nothing
 * else shows, so they can't be paired with the ones shielded from its others.
 */
function UnshieldRoute() {
  const balance = useGetBalance();

  const [amountString, setAmountString] = useState("");
  const [isMax, setIsMax] = useState(false);
  const [validationMessage, setValidationMessage] = useState("");
  const [amountProblem, setAmountProblem] = useState("");
  const amountRef = useRef<HTMLInputElement>(null);

  const wallet = useWallet();
  const queryClient = useQueryClient();
  const next = useInternalAddress().data;
  const to = next?.address ?? "";
  const typed = (() => {
    try {
      return zecToZatoshi(amountString);
    } catch {
      return 0n;
    }
  })();
  const planned = useSendPlan({ from: "shielded", to, amount: typed }, isMax);
  const { maxAmount, ceiling } = planned;
  const amount = isMax ? (maxAmount.data ?? 0n) : typed;
  const send = useSend();
  const availableBalance = balance.data?.shieldedBalance ?? 0n;

  const overBalance = Boolean(balance.data) && amount > availableBalance;

  const onSubmit = () => {
    setValidationMessage("");
    setAmountProblem("");
    if (!next) {
      setValidationMessage(
        "Wait for the wallet to sync, or for earlier unshields to confirm",
      );
      return;
    }
    const problem =
      amount <= 0n
        ? "Set an amount"
        : amount > availableBalance
          ? "Insufficient balance"
          : ceiling
            ? planProblem(planned)
            : undefined;
    if (problem) {
      setAmountProblem(problem);
      amountRef.current?.focus();
      return;
    }
    send.mutate(
      {
        from: "shielded",
        to,
        amount,
        toSelf: true,
        shown: {
          tx_type: "Unshielded",
          value: amount,
          from: { pool: "shielded" },
          // Ours, and never shown: a new internal address each time.
          to: { pool: "transparent" },
        },
      },
      {
        onSuccess: async ({ expiryHeight }) => {
          await wallet.internalAddressUsed(next.index, expiryHeight);
          await queryClient.invalidateQueries(internalAddress(wallet));
        },
      },
    );
  };

  if (send.data) {
    return <TransferSuccess tx={{ ...send.data, status: "Pending" }} />;
  }

  const amountError =
    amountProblem ||
    (overBalance
      ? "Insufficient balance"
      : ceiling
        ? planProblem(planned)
        : undefined);
  const formError =
    validationMessage ||
    send.error?.message ||
    (ceiling || overBalance ? undefined : planProblem(planned));
  const planFee = planned.plan.data?.fee;
  const total =
    amount > 0n && planFee !== undefined ? amount + BigInt(planFee) : undefined;

  const amountInput = isMax
    ? maxAmount.data
      ? zatoshiToZec(maxAmount.data)
      : ""
    : amountString;

  return (
    <PageShell title="Unshield">
      <TransferForm onSubmit={onSubmit} className="mt-6 gap-4">
        <section aria-label="Amount" className={cardClassName}>
          <div className="flex items-center justify-between gap-4">
            <h2 className={sectionLabelClassName}>Move</h2>
            <div id="unshield-available" className="[&>*]:mt-0">
              <AvailableWithMax
                available={availableBalance}
                isMax={isMax}
                onToggleMax={() => {
                  setIsMax(!isMax);
                  setAmountProblem("");
                  setValidationMessage("");
                }}
              />
            </div>
          </div>
          <PoolRoute from="shielded" to="transparent" />
          <div className="px-6 py-2">
            <AmountInput
              ref={amountRef}
              value={amountInput}
              className={twMerge("h-24", amountError && "text-red-700")}
              maxFontSize="4.5rem"
              aria-invalid={Boolean(amountError)}
              aria-describedby={
                amountError
                  ? "unshield-amount-error unshield-available"
                  : "unshield-available"
              }
              onChange={(e) => {
                setIsMax(false);
                setAmountString(e.target.value);
                setAmountProblem("");
                setValidationMessage("");
              }}
            />
          </div>
          {amountError && (
            <p
              id="unshield-amount-error"
              role="alert"
              className="-mt-2 text-sm text-center font-medium text-red-700 motion-safe:animate-fade-in"
            >
              {amountError}
            </p>
          )}
        </section>

        <section
          aria-labelledby="unshield-summary"
          className={twMerge(cardClassName, "gap-0 [&>div]:mt-2")}
        >
          <h2
            id="unshield-summary"
            className={twMerge(sectionLabelClassName, "mb-1")}
          >
            Summary
          </h2>
          <FeeRow
            label="Amount"
            fee={amount > 0n ? amount : undefined}
            pending={isMax && maxAmount.isLoading}
          />
          <PlannedFee {...planned} />
          <TotalRow value={total} />
        </section>

        <div>
          <ActionButton
            size="lg"
            className="w-full"
            backgroundColor="black"
            textColor="white"
            disabled={send.isPending}
          >
            {send.isPending ? "Unshielding..." : "Unshield"}
          </ActionButton>

          <p className="mt-3 text-sm text-center font-medium text-gray-600">
            Goes to a new transparent address of yours, visible on-chain
          </p>

          {send.isPending && <SubmitProgress stages={send.stages} />}

          {formError && <FormError>{formError}</FormError>}
        </div>
      </TransferForm>
    </PageShell>
  );
}
