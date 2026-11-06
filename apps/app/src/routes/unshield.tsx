import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { FormPage } from "../components/FormPage";
import { FeeRow, PlannedFee } from "../components/PlannedFee";
import {
  AmountField,
  BalanceWithMax,
  Breakdown,
  FormCard,
  Notice,
  PoolRoute,
  SubmitBlock,
} from "../components/TransferForm";
import { TransferSuccess } from "../components/TransferSuccess";
import { internalAddress, useInternalAddress } from "../hooks/useAddresses";
import { useAmountField } from "../hooks/useAmountField";
import { useConfirming } from "../hooks/useConfirming";
import { useGetBalance } from "../hooks/useGetBalance";
import { planProblem, useSend, useSendPlan } from "../hooks/useSend";
import { useWallet } from "../hooks/useWallet";
import { isOverBalance } from "../lib/amount";
import { zatoshiToZec } from "../lib/utils";

export const Route = createFileRoute("/unshield")({
  component: UnshieldRoute,
});

/**
 * Moves shielded funds to a transparent address of the account that nothing
 * else shows, so they can't be paired with the ones shielded from its others.
 */
function UnshieldRoute() {
  const balance = useGetBalance();
  const amountField = useAmountField();
  const [amountProblem, setAmountProblem] = useState("");
  const [formProblem, setFormProblem] = useState("");
  const amountRef = useRef<HTMLInputElement>(null);

  const wallet = useWallet();
  const queryClient = useQueryClient();
  const next = useInternalAddress().data;
  const to = next?.address ?? "";
  const { typed, isMax } = amountField;
  const planned = useSendPlan({ from: "shielded", to, amount: typed }, isMax);
  const { maxAmount, ceiling } = planned;
  const { available = 0n, waiting = 0n } = balance.data?.shielded ?? {};
  // Max is the whole balance: what's spendable now, plus what's confirming.
  const most =
    maxAmount.data ?? (maxAmount.isError && waiting ? 0n : undefined);
  const amount = isMax ? (most ?? 0n) + waiting : typed;
  const send = useSend();
  const overBalance =
    Boolean(balance.data) && isOverBalance(amount, available + waiting);
  const confirming =
    waiting > 0n &&
    amount > 0n &&
    !overBalance &&
    (isMax || amount > available || Boolean(ceiling));

  const hold = useConfirming(confirming, overBalance);

  const onSubmit = () => {
    setAmountProblem("");
    setFormProblem("");
    if (!next) {
      setFormProblem(
        "Wait for the wallet to sync, or for earlier unshields to confirm",
      );
      return;
    }
    const problem =
      amount <= 0n && !ceiling
        ? amountField.missing
        : overBalance
          ? "Insufficient balance"
          : ceiling && !confirming
            ? planProblem(planned)
            : undefined;
    if (problem) {
      setAmountProblem(problem);
      amountRef.current?.focus();
      return;
    }
    if (hold.held()) return;
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

  const clear = () => {
    setAmountProblem("");
    setFormProblem("");
    hold.reset();
  };

  if (send.data) {
    return <TransferSuccess tx={{ ...send.data, status: "Pending" }} />;
  }

  const amountError =
    amountProblem ||
    (overBalance
      ? "Insufficient balance"
      : ceiling && !confirming
        ? planProblem(planned)
        : undefined);
  const formError =
    formProblem ||
    send.error?.message ||
    (ceiling || overBalance || confirming ? undefined : planProblem(planned));
  const planFee = planned.plan.data?.fee;
  const total =
    amount > 0n && planFee !== undefined ? amount + BigInt(planFee) : undefined;

  return (
    <FormPage title="Unshield" onSubmit={onSubmit}>
      <FormCard heading="Moving">
        <PoolRoute from="shielded" to="transparent" />
      </FormCard>

      <FormCard
        heading="Amount"
        htmlFor="unshield-amount"
        aside={
          <div id="unshield-available">
            <BalanceWithMax
              balance={balance.data?.shielded.balance ?? 0n}
              waiting={waiting}
              pool="shielded"
              isMax={isMax}
              onToggleMax={() => {
                amountField.toggleMax();
                clear();
              }}
            />
          </div>
        }
      >
        <AmountField
          id="unshield-amount"
          ref={amountRef}
          value={amountField.shown(most === undefined ? undefined : amount)}
          describedBy="unshield-available"
          error={amountError}
          onChange={(value) => {
            amountField.type(value);
            clear();
          }}
        />
      </FormCard>

      <Breakdown total={total}>
        <FeeRow
          label="Amount"
          fee={amount > 0n ? amount : undefined}
          pending={isMax && maxAmount.isLoading}
        />
        <PlannedFee {...planned} />
      </Breakdown>

      <SubmitBlock
        label={
          amount > 0n ? `Unshield ${zatoshiToZec(amount)} ZEC` : "Unshield"
        }
        pending={send.isPending}
        pendingLabel="Unshielding..."
        color="black"
        stages={send.stages}
        error={formError}
        confirming={{ ...hold, waiting, verb: "unshield" }}
      >
        <Notice className="text-gray-600">
          Goes to a new transparent address of yours, visible on-chain
        </Notice>
      </SubmitBlock>
    </FormPage>
  );
}
