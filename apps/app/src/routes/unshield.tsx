import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AmountInput } from "../components/AmountInput";
import { PageShell } from "../components/PageShell";
import { PlannedFee } from "../components/PlannedFee";
import {
  AvailableWithMax,
  Field,
  FormError,
  PoolPill,
  SubmitProgress,
  TransferForm,
} from "../components/TransferForm";
import { TransferSuccess } from "../components/TransferSuccess";
import { ActionButton } from "../components/ui/ActionButton";
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

  const onSubmit = () => {
    setValidationMessage("");
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
      setValidationMessage(problem);
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

  const error = send.error?.message ?? planProblem(planned);

  const amountInput = isMax
    ? maxAmount.data
      ? zatoshiToZec(maxAmount.data)
      : ""
    : amountString;

  return (
    <PageShell title="Unshield">
      <TransferForm onSubmit={onSubmit}>
        <Field label="From">
          <PoolPill pool="shielded" />
        </Field>

        <AvailableWithMax
          available={availableBalance}
          isMax={isMax}
          onToggleMax={() => {
            setIsMax(!isMax);
            setValidationMessage("");
          }}
        />

        <AmountInput
          className="mt-2"
          value={amountInput}
          onFocus={() => setValidationMessage("")}
          onChange={(e) => {
            setIsMax(false);
            setAmountString(e.target.value);
            setValidationMessage("");
          }}
        />

        <Field label="To" className="mt-4">
          <PoolPill pool="transparent" />
        </Field>

        <PlannedFee {...planned} />

        <ActionButton
          size="lg"
          className="mt-4 w-full"
          backgroundColor="black"
          textColor="white"
          disabled={send.isPending || amount <= 0n}
        >
          {send.isPending ? "Unshielding..." : "Unshield"}
        </ActionButton>

        {send.isPending && <SubmitProgress stages={send.stages} />}

        {(validationMessage || error) && (
          <FormError>{validationMessage || error}</FormError>
        )}
      </TransferForm>
    </PageShell>
  );
}
