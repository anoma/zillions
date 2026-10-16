import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { PageShell } from "../components/PageShell";
import { FeeRow, PlannedFee } from "../components/PlannedFee";
import { MemoField } from "../components/send/MemoField";
import { PaymentLinkFields } from "../components/send/PaymentLinkFields";
import { PaymentLinkToggle } from "../components/send/PaymentLinkToggle";
import { PrivacyNotice } from "../components/send/PrivacyNotice";
import { RecipientField } from "../components/send/RecipientField";
import { ShieldedTransparentToggle } from "../components/ShieldedTransparentToggle";
import {
  AmountField,
  AvailableWithMax,
  Breakdown,
  FormCard,
  type Problem,
  SubmitBlock,
  TransferForm,
} from "../components/TransferForm";
import { TransferSuccess } from "../components/TransferSuccess";
import { useAddressKind, useFreshAddress } from "../hooks/useAddresses";
import { useAmountField } from "../hooks/useAmountField";
import { useGetBalance } from "../hooks/useGetBalance";
import {
  planProblem,
  shieldedChangeOf,
  useSend,
  useSendPlan,
} from "../hooks/useSend";
import { memoProblem } from "../lib/memo";
import { CLAIM_FEE, descriptionProblem } from "../lib/paymentLink";
import { zatoshiToZec } from "../lib/utils";

export const Route = createFileRoute("/send")({
  component: SendRoute,
});

function SendRoute() {
  const balance = useGetBalance();
  const [transparentFrom, setTransparentFrom] = useState(false);
  const amountField = useAmountField();
  const [isPaymentLink, setIsPaymentLink] = useState(false);
  const [to, setTo] = useState("");
  const [memoOpen, setMemoOpen] = useState(false);
  const [memoText, setMemoText] = useState("");
  const [description, setDescription] = useState("");
  const [problem, setProblem] = useState<Problem<"amount" | "to">>();
  const amountRef = useRef<HTMLInputElement>(null);
  const toRef = useRef<HTMLInputElement>(null);

  const from = transparentFrom ? "transparent" : "shielded";
  const toKind = useAddressKind(to);
  const transparentTo = !isPaymentLink && toKind === "transparent";
  // The fee depends on the recipient. A payment link has none, and until an
  // address is entered our own stands in, so Max and the fee still work.
  const standInTo = useFreshAddress() ?? "";

  const memoError = isPaymentLink
    ? undefined
    : memoProblem(memoText, transparentTo);
  // A memo doesn't change the fee, so one the send can't carry is left out of the plan.
  const memo = memoText && !memoError && !isPaymentLink ? memoText : undefined;
  const descriptionError = isPaymentLink
    ? descriptionProblem(description)
    : undefined;

  const { typed, isMax } = amountField;
  const planned = useSendPlan(
    {
      from,
      to: isPaymentLink ? standInTo : to || (isMax ? standInTo : ""),
      // A link is funded with its amount plus the claim fee.
      amount: isPaymentLink && typed > 0n ? typed + CLAIM_FEE : typed,
      memo,
    },
    isMax,
  );
  const { maxAmount, ceiling } = planned;
  const extra = isPaymentLink ? CLAIM_FEE : 0n;
  const max = maxAmount.data ?? 0n;
  const amount = isMax ? (max > extra ? max - extra : 0n) : typed;
  const send = useSend();

  const available = !balance.data
    ? 0n
    : transparentFrom
      ? balance.data.unshieldedBalance
      : balance.data.shieldedBalance;
  const overBalance = Boolean(balance.data) && amount + extra > available;

  const onSubmit = () => {
    const found: Problem<"amount" | "to"> | undefined =
      amount <= 0n
        ? { field: "amount", message: "Set an amount" }
        : overBalance
          ? { field: "amount", message: "Insufficient balance" }
          : isPaymentLink
            ? descriptionError
              ? undefined
              : { field: "form", message: "Payment links aren't available yet" }
            : !to
              ? { field: "to", message: "Set a recipient" }
              : toKind === null
                ? { field: "to", message: "Not a valid Zcash address" }
                : undefined;
    // Memo, description and fee ceiling problems already show by their fields.
    if (found || memoError || descriptionError || ceiling) {
      setProblem(found);
      if (found?.field === "amount") amountRef.current?.focus();
      if (found?.field === "to") toRef.current?.focus();
      return;
    }
    setProblem(undefined);
    send.mutate({
      from,
      to,
      amount,
      memo,
      shown: {
        tx_type: "Sent",
        value: -amount,
        from: { pool: from },
        to: { address: to },
        memo,
      },
    });
  };

  if (send.data) {
    return <TransferSuccess tx={{ ...send.data, status: "Pending" }} />;
  }

  const clear = () => setProblem(undefined);
  const amountError =
    problem?.field === "amount"
      ? problem.message
      : overBalance
        ? "Insufficient balance"
        : ceiling
          ? planProblem(planned)
          : undefined;
  const toError = problem?.field === "to" ? problem.message : undefined;
  const formError =
    send.error?.message ??
    (problem?.field === "form" ? problem.message : undefined) ??
    (ceiling || overBalance ? undefined : planProblem(planned));
  const planFee = planned.plan.data?.fee;
  const total =
    amount > 0n && planFee !== undefined
      ? amount + extra + BigInt(planFee)
      : undefined;
  const transparent = transparentFrom || transparentTo;

  return (
    <PageShell title="Send">
      <TransferForm onSubmit={onSubmit}>
        <FormCard heading="Pay from">
          <ShieldedTransparentToggle
            label="Pay from"
            isTransparent={transparentFrom}
            setIsTransparent={(value) => {
              setTransparentFrom(value);
              clear();
            }}
          />
        </FormCard>

        <FormCard
          heading="Amount"
          aside={
            <div id="send-available">
              <AvailableWithMax
                available={available}
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
            id="send-amount"
            ref={amountRef}
            value={amountField.shown(amount)}
            describedBy="send-available"
            error={amountError}
            onChange={(value) => {
              amountField.type(value);
              clear();
            }}
          />
        </FormCard>

        <FormCard
          headingId="send-to"
          heading={
            isPaymentLink ? "To" : <label htmlFor="send-to-address">To</label>
          }
          aside={
            <PaymentLinkToggle
              active={isPaymentLink}
              onChange={(value) => {
                setIsPaymentLink(value);
                amountField.setIsMax(false);
                clear();
              }}
            />
          }
          className="gap-5"
        >
          {isPaymentLink ? (
            <PaymentLinkFields
              description={description}
              onChange={(value) => {
                setDescription(value);
                clear();
              }}
            />
          ) : (
            <>
              <RecipientField
                ref={toRef}
                value={to}
                kind={toKind}
                error={toError}
                onChange={(value) => {
                  setTo(value);
                  clear();
                }}
              />
              <MemoField
                open={memoOpen}
                onOpenChange={setMemoOpen}
                memo={memoText}
                onChange={(value) => {
                  setMemoText(value);
                  clear();
                }}
                toTransparent={transparentTo}
              />
            </>
          )}
        </FormCard>

        <Breakdown total={total}>
          <FeeRow
            label={isPaymentLink ? "Link amount" : "Amount"}
            fee={amount > 0n ? amount : undefined}
            pending={isMax && maxAmount.isLoading}
          />
          <PlannedFee {...planned} />
          {isPaymentLink && (
            <FeeRow label="Claim fee" fee={CLAIM_FEE} pending={false} />
          )}
        </Breakdown>

        <SubmitBlock
          label={
            isPaymentLink
              ? "Create payment link"
              : amount > 0n
                ? `Send ${zatoshiToZec(amount)} ZEC`
                : "Send"
          }
          pending={send.isPending}
          pendingLabel={isPaymentLink ? "Creating link..." : "Sending..."}
          color={transparent ? "black" : "gold-button"}
          stages={send.stages}
          error={formError}
        >
          <PrivacyNotice
            transparentFrom={transparentFrom}
            transparentTo={transparentTo}
            shieldedChange={
              transparentFrom ? shieldedChangeOf(planned.plan.data) : 0n
            }
          />
        </SubmitBlock>
      </TransferForm>
    </PageShell>
  );
}
