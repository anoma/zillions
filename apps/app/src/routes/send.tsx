import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { twMerge } from "tailwind-merge";
import { AmountInput } from "../components/AmountInput";
import { PageShell } from "../components/PageShell";
import { PlannedFee } from "../components/PlannedFee";
import { ShieldedTransparentToggle } from "../components/ShieldedTransparentToggle";
import {
  AvailableWithMax,
  Field,
  FormError,
  SubmitProgress,
  TransferForm,
} from "../components/TransferForm";
import { TransferSuccess } from "../components/TransferSuccess";
import { ActionButton } from "../components/ui/ActionButton";
import { placeholderClassName } from "../components/ui/utils";
import { ZecValue } from "../components/ZecValue";
import { useAddressKind } from "../hooks/useAddresses";
import { useGetBalance } from "../hooks/useGetBalance";
import { planProblem, useSend, useSendPlan } from "../hooks/useSend";
import { zatoshiToZec, zecToZatoshi } from "../lib/utils";

const MEMO_BYTES = 512;

export const Route = createFileRoute("/send")({
  component: SendRoute,
});

function SendRoute() {
  const balance = useGetBalance();

  const [isTransparentFrom, setIsTransparentFrom] = useState(false);
  const [amountString, setAmountString] = useState("");
  const [isMax, setIsMax] = useState(false);
  const [to, setTo] = useState("");
  const [showMemo, setShowMemo] = useState(false);
  const [memoText, setMemoText] = useState("");
  const [validationMessage, setValidationMessage] = useState("");

  const from = isTransparentFrom ? "transparent" : "shielded";
  const typed = (() => {
    try {
      return zecToZatoshi(amountString);
    } catch {
      return 0n;
    }
  })();
  const toKind = useAddressKind(to);
  const isTransparentTo = toKind === "transparent";
  const isShieldedTo = toKind === "shielded";

  const memoBytes = new TextEncoder().encode(memoText).length;
  const memoProblem = !memoText
    ? undefined
    : isTransparentTo
      ? "Transparent addresses can't receive messages"
      : memoBytes > MEMO_BYTES
        ? "Message is too long"
        : undefined;
  // A memo doesn't change the fee, so one the send can't carry is left out of the plan.
  const memo = memoText && !memoProblem ? memoText : undefined;

  const planned = useSendPlan({ from, to, amount: typed, memo }, isMax);
  const { maxAmount, ceiling } = planned;
  // From transparent to a shielded recipient, upstream shields the change too:
  // the shielded side then holds payment and change together, hiding the amount.
  const shieldedChange = isTransparentFrom
    ? (planned.plan.data?.steps ?? [])
        .flatMap((step) => step.change)
        .filter((c) => c.pool !== "transparent")
        .reduce((sum, c) => sum + BigInt(c.value), 0n)
    : 0n;
  const amount = isMax ? (maxAmount.data ?? 0n) : typed;
  const send = useSend();

  const availableBalance = !balance.data
    ? 0n
    : isTransparentFrom
      ? balance.data.unshieldedBalance
      : balance.data.shieldedBalance;

  const onSubmit = () => {
    setValidationMessage("");
    const problem = !to
      ? "Set a recipient"
      : toKind === null
        ? "Not a valid Zcash address"
        : amount <= 0n
          ? "Set an amount"
          : amount > availableBalance
            ? "Insufficient balance"
            : (memoProblem ?? (ceiling ? planProblem(planned) : undefined));
    if (problem) {
      setValidationMessage(problem);
      return;
    }
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

  const error = send.error?.message ?? planProblem(planned);

  const amountInput = isMax
    ? maxAmount.data
      ? zatoshiToZec(maxAmount.data)
      : ""
    : amountString;

  return (
    <PageShell title="Send">
      <TransferForm onSubmit={onSubmit}>
        <Field label="From">
          <ShieldedTransparentToggle
            isTransparent={isTransparentFrom}
            setIsTransparent={(value) => {
              setIsTransparentFrom(value);
              setValidationMessage("");
            }}
          />
        </Field>

        <AvailableWithMax
          available={availableBalance}
          isMax={isMax}
          maxTitle={to ? undefined : "Enter a recipient to fill the maximum"}
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
          <input
            name="to"
            type="text"
            placeholder="Enter Zcash address..."
            className={twMerge(
              "h-11 w-full px-4 font-medium rounded-lg border border-gray-300 outline-none",
              placeholderClassName,
              isTransparentTo && "border-black",
              isShieldedTo && "border-gold",
            )}
            value={to}
            onFocus={() => setValidationMessage("")}
            onChange={(e) => {
              setTo(e.target.value.trim());
              setValidationMessage("");
            }}
          />
        </Field>

        {!showMemo
          ? !isTransparentTo && (
              <button
                type="button"
                className="mt-2 self-start text-xs font-medium hover:underline"
                onClick={() => setShowMemo(true)}
              >
                + Add a message
              </button>
            )
          : (!isTransparentTo || memoText) && (
              <div className="mt-4">
                <div className="mb-1 flex justify-between text-xs font-medium">
                  <label htmlFor="memo">Message</label>
                  <button
                    type="button"
                    className="hover:underline"
                    onClick={() => {
                      setShowMemo(false);
                      setMemoText("");
                      setValidationMessage("");
                    }}
                  >
                    Remove
                  </button>
                </div>
                <textarea
                  id="memo"
                  name="memo"
                  rows={3}
                  autoFocus
                  placeholder="Only the recipient can read this"
                  className={twMerge(
                    "w-full px-4 py-3 font-medium rounded-lg border border-gray-300 outline-none resize-none",
                    placeholderClassName,
                    memoProblem && "border-red-500",
                  )}
                  value={memoText}
                  onFocus={() => setValidationMessage("")}
                  onChange={(e) => {
                    setMemoText(e.target.value);
                    setValidationMessage("");
                  }}
                />
                <div className="flex justify-between gap-2 text-xs">
                  <span className="text-red-500">{memoProblem}</span>
                  <span
                    className={twMerge(
                      "tabular-nums",
                      memoBytes > MEMO_BYTES && "text-red-500",
                    )}
                  >
                    {memoBytes}/{MEMO_BYTES}
                  </span>
                </div>
              </div>
            )}

        <PlannedFee {...planned} />

        <ActionButton
          size="lg"
          className="mt-4 w-full"
          backgroundColor={
            isTransparentFrom || isTransparentTo ? "black" : undefined
          }
          textColor={isTransparentFrom || isTransparentTo ? "white" : undefined}
          disabled={send.isPending}
        >
          {send.isPending ? "Sending..." : "Send"}
        </ActionButton>

        <div className="mt-2 text-sm text-center font-medium">
          {isTransparentFrom && isTransparentTo
            ? "This transfer is transparent"
            : isTransparentFrom || isTransparentTo
              ? "This transfer is partly shielded"
              : "This transfer is shielded"}
        </div>

        {shieldedChange > 0n && (
          <div className="mt-1 text-xs text-center">
            <ZecValue zat={shieldedChange} /> also moves from your transparent
            to your shielded balance, so the amount you send stays private.
          </div>
        )}

        {send.isPending && <SubmitProgress stages={send.stages} />}

        {(validationMessage || error) && (
          <FormError>{validationMessage || error}</FormError>
        )}
      </TransferForm>
    </PageShell>
  );
}
