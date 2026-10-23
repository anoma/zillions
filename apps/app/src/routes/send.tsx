import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { FormPage } from "../components/FormPage";
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
import { isOverBalance, planRecipient } from "../lib/amount";
import { memoProblem } from "../lib/memo";
import { CLAIM_FEE, DESCRIPTION_BYTES } from "../lib/paymentLink";
import { zatoshiToZec } from "../lib/utils";

export const Route = createFileRoute("/send")({
  component: SendRoute,
});

type SendProblem = Problem<"amount" | "to">;
type Planned = ReturnType<typeof useSendPlan>;

function SendRoute() {
  const balance = useGetBalance();
  const [transparentFrom, setTransparentFrom] = useState(false);
  const amountField = useAmountField();
  const [isPaymentLink, setIsPaymentLink] = useState(false);
  const [to, setTo] = useState("");
  const [memoOpen, setMemoOpen] = useState(false);
  // With a payment link, the message is the link's description.
  const [memoText, setMemoText] = useState("");
  const [problem, setProblem] = useState<SendProblem>();
  const amountRef = useRef<HTMLInputElement>(null);
  const toRef = useRef<HTMLInputElement>(null);

  const from = transparentFrom ? "transparent" : "shielded";
  const toKind = useAddressKind(to);
  const transparentTo = !isPaymentLink && toKind === "transparent";
  // The fee depends on the recipient. A payment link has none, and until an
  // address is entered our own stands in, so Max and the fee still work.
  const standInTo = useFreshAddress() ?? "";

  const memoBytes = isPaymentLink ? DESCRIPTION_BYTES : undefined;
  const memoError = memoProblem(memoText, transparentTo, memoBytes);
  // A memo doesn't change the fee, so one the send can't carry is left out of the plan.
  const memo = memoText && !memoError && !isPaymentLink ? memoText : undefined;

  const { typed, isMax } = amountField;
  // A link is funded with its amount plus the claim fee.
  const extra = isPaymentLink ? CLAIM_FEE : 0n;
  const planned = useSendPlan(
    {
      from,
      to: planRecipient({
        to,
        valid: Boolean(toKind),
        isMax,
        isPaymentLink,
        standIn: standInTo,
      }),
      amount: typed > 0n ? typed + extra : typed,
      memo,
    },
    isMax,
    extra,
  );
  const { maxAmount, ceiling } = planned;
  const amount = isMax ? withoutExtra(maxAmount.data ?? 0n, extra) : typed;
  const send = useSend();

  const available = balance.data?.[from].available ?? 0n;
  const overBalance = Boolean(balance.data) && isOverBalance(amount, available);

  const onSubmit = () => {
    const found = submitProblem({
      amount,
      missing: amountField.missing,
      ceiling,
      overBalance,
      isPaymentLink,
      memoError,
      to,
      toKind,
    });
    // Memo and fee ceiling problems already show by their fields.
    if (found || memoError || ceiling) {
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
  const amountError = amountErrorOf(problem, overBalance, planned);
  const toError = problem?.field === "to" ? problem.message : undefined;
  const formError = formErrorOf(problem, overBalance, planned, send.error);
  const planFee = planned.plan.data?.fee;
  const total =
    amount > 0n && planFee !== undefined
      ? amount + extra + BigInt(planFee)
      : undefined;
  const transparent = transparentFrom || transparentTo;

  return (
    <FormPage title="Send" onSubmit={onSubmit}>
      <FormCard heading="Pay from" htmlFor="send-from">
        <ShieldedTransparentToggle
          id="send-from"
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
        htmlFor="send-amount"
        aside={
          <div id="send-available">
            <AvailableWithMax
              available={available}
              waiting={balance.data?.[from].waiting ?? 0n}
              pool={from}
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
          value={amountField.shown(
            maxAmount.data === undefined ? undefined : amount,
          )}
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
        heading="To"
        htmlFor={isPaymentLink ? undefined : "send-to-address"}
        aside={
          <PaymentLinkToggle
            active={isPaymentLink}
            onChange={(value) => {
              setIsPaymentLink(value);
              clear();
            }}
          />
        }
      >
        {isPaymentLink ? (
          <PaymentLinkFields />
        ) : (
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
        )}
        <MemoField
          open={memoOpen}
          onOpenChange={setMemoOpen}
          memo={memoText}
          onChange={(value) => {
            setMemoText(value);
            clear();
          }}
          toTransparent={transparentTo}
          maxBytes={memoBytes}
          placeholder={
            isPaymentLink ? "Whoever claims the link sees this" : undefined
          }
        />
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
        label={submitLabel(isPaymentLink, amount)}
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
    </FormPage>
  );
}

/** What's left of `max` once `extra` is set aside. */
function withoutExtra(max: bigint, extra: bigint) {
  return max > extra ? max - extra : 0n;
}

/** The problem blocking a send, unless only the memo or fee ceiling block it: those show by their fields. */
function submitProblem({
  amount,
  missing,
  ceiling,
  overBalance,
  isPaymentLink,
  memoError,
  to,
  toKind,
}: {
  amount: bigint;
  missing: string;
  ceiling: Planned["ceiling"];
  overBalance: boolean;
  isPaymentLink: boolean;
  memoError: string | undefined;
  to: string;
  toKind: ReturnType<typeof useAddressKind>;
}): SendProblem | undefined {
  if (amount <= 0n && !ceiling) return { field: "amount", message: missing };
  if (overBalance) return { field: "amount", message: "Insufficient balance" };
  if (isPaymentLink) {
    if (memoError) return undefined;
    return { field: "form", message: "Payment links aren't available yet" };
  }
  if (!to) return { field: "to", message: "Set a recipient" };
  if (toKind === null) {
    return { field: "to", message: "Not a valid Zcash address" };
  }
  return undefined;
}

function amountErrorOf(
  problem: SendProblem | undefined,
  overBalance: boolean,
  planned: Planned,
) {
  if (problem?.field === "amount") return problem.message;
  if (overBalance) return "Insufficient balance";
  if (planned.ceiling) return planProblem(planned);
  return undefined;
}

/** A plan error the amount field doesn't already show. */
function formErrorOf(
  problem: SendProblem | undefined,
  overBalance: boolean,
  planned: Planned,
  sendError: Error | null,
) {
  if (sendError) return sendError.message;
  if (problem?.field === "form") return problem.message;
  if (planned.ceiling || overBalance) return undefined;
  return planProblem(planned);
}

function submitLabel(isPaymentLink: boolean, amount: bigint) {
  if (isPaymentLink) return "Create payment link";
  if (amount > 0n) return `Send ${zatoshiToZec(amount)} ZEC`;
  return "Send";
}
