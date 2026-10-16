import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { twMerge } from "tailwind-merge";
import { AmountInput } from "../components/AmountInput";
import { PageShell } from "../components/PageShell";
import { FeeRow, PlannedFee, TotalRow } from "../components/PlannedFee";
import { ShieldedTransparentToggle } from "../components/ShieldedTransparentToggle";
import { Toggle } from "../components/Toggle";
import {
  AvailableWithMax,
  FormError,
  SubmitProgress,
  TransferForm,
} from "../components/TransferForm";
import { TransferSuccess } from "../components/TransferSuccess";
import { ActionButton } from "../components/ui/ActionButton";
import {
  cardClassName,
  placeholderClassName,
  sectionLabelClassName,
} from "../components/ui/utils";
import { ZecValue } from "../components/ZecValue";
import { useAddressKind, useFreshAddress } from "../hooks/useAddresses";
import { useGetBalance } from "../hooks/useGetBalance";
import { planProblem, useSend, useSendPlan } from "../hooks/useSend";
import { LinkIcon } from "../icons/LinkIcon";
import { ShieldCheckIcon } from "../icons/ShieldCheckIcon";
import { ShieldSlashIcon } from "../icons/ShieldSlashIcon";
import { zatoshiToZec, zecToZatoshi } from "../lib/utils";

const MEMO_BYTES = 512;
// The link's memo carries a 17-byte header (0xFF, "PAYLINK", version, r₁, r₂)
// before the description; see docs/design/payment-links.md.
const DESCRIPTION_BYTES = MEMO_BYTES - 17;
const CLAIM_FEE = 10_000n;

/** A submit-time problem, shown next to the field it's about. */
type Problem = { field: "amount" | "to" | "form"; message: string };

const focusClassName =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black";
const inputClassName = twMerge(
  "w-full px-4 font-medium rounded-xl border border-line bg-white outline-none",
  "transition-colors duration-300 hover:border-line-strong focus:border-black",
  placeholderClassName,
);

export const Route = createFileRoute("/send")({
  component: SendRoute,
});

function SendRoute() {
  const balance = useGetBalance();

  const [isTransparentFrom, setIsTransparentFrom] = useState(false);
  const [amountString, setAmountString] = useState("");
  const [isMax, setIsMax] = useState(false);
  const [isPaymentLink, setIsPaymentLink] = useState(false);
  const [to, setTo] = useState("");
  const [showMemo, setShowMemo] = useState(false);
  const [memoText, setMemoText] = useState("");
  const [description, setDescription] = useState("");
  const [problem, setProblem] = useState<Problem>();
  const amountRef = useRef<HTMLInputElement>(null);
  const toRef = useRef<HTMLInputElement>(null);

  const from = isTransparentFrom ? "transparent" : "shielded";
  const typed = (() => {
    try {
      return zecToZatoshi(amountString);
    } catch {
      return 0n;
    }
  })();
  const toKind = useAddressKind(to);
  // The fee depends on the recipient. A payment link has none, and until an
  // address is entered our own stands in, so Max and the fee still work.
  const standInTo = useFreshAddress() ?? "";
  const isTransparentTo = !isPaymentLink && toKind === "transparent";
  const isShieldedTo = !isPaymentLink && toKind === "shielded";
  const isInvalidTo = !isPaymentLink && Boolean(to) && toKind === null;

  const memoBytes = new TextEncoder().encode(memoText).length;
  const memoProblem =
    !memoText || isPaymentLink
      ? undefined
      : isTransparentTo
        ? "Transparent addresses can't receive messages"
        : memoBytes > MEMO_BYTES
          ? "Message is too long"
          : undefined;
  // A memo doesn't change the fee, so one the send can't carry is left out of the plan.
  const memo =
    memoText && !memoProblem && !isPaymentLink ? memoText : undefined;

  const descriptionBytes = new TextEncoder().encode(description).length;
  const descriptionProblem =
    descriptionBytes > DESCRIPTION_BYTES
      ? "Description is too long"
      : undefined;

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
  // From transparent to a shielded recipient, upstream shields the change too:
  // the shielded side then holds payment and change together, hiding the amount.
  const shieldedChange = isTransparentFrom
    ? (planned.plan.data?.steps ?? [])
        .flatMap((step) => step.change)
        .filter((c) => c.pool !== "transparent")
        .reduce((sum, c) => sum + BigInt(c.value), 0n)
    : 0n;
  const linkMax =
    maxAmount.data !== undefined && maxAmount.data > CLAIM_FEE
      ? maxAmount.data - CLAIM_FEE
      : 0n;
  const amount = isMax
    ? isPaymentLink
      ? linkMax
      : (maxAmount.data ?? 0n)
    : typed;
  const send = useSend();

  const availableBalance = !balance.data
    ? 0n
    : isTransparentFrom
      ? balance.data.unshieldedBalance
      : balance.data.shieldedBalance;

  const overBalance =
    Boolean(balance.data) &&
    amount + (isPaymentLink ? CLAIM_FEE : 0n) > availableBalance;

  const onSubmit = () => {
    const amountProblem =
      amount <= 0n
        ? "Set an amount"
        : overBalance
          ? "Insufficient balance"
          : undefined;
    const found: Problem | undefined = isPaymentLink
      ? amountProblem
        ? { field: "amount", message: amountProblem }
        : descriptionProblem
          ? undefined
          : { field: "form", message: "Payment links aren't available yet" }
      : amountProblem
        ? { field: "amount", message: amountProblem }
        : !to
          ? { field: "to", message: "Set a recipient" }
          : toKind === null
            ? { field: "to", message: "Not a valid Zcash address" }
            : undefined;
    // Memo, description and fee ceiling problems already show by their fields.
    if (found || memoProblem || descriptionProblem || ceiling) {
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

  const amountError =
    problem?.field === "amount"
      ? problem.message
      : overBalance
        ? "Insufficient balance"
        : ceiling
          ? planProblem(planned)
          : undefined;
  const toError =
    problem?.field === "to" && !isPaymentLink ? problem.message : undefined;
  const formError =
    send.error?.message ??
    (problem?.field === "form" ? problem.message : undefined) ??
    (ceiling || overBalance ? undefined : planProblem(planned));
  const isTransparentTransfer = isTransparentFrom || isTransparentTo;
  const planFee = planned.plan.data?.fee;
  const total =
    amount <= 0n
      ? undefined
      : isPaymentLink
        ? planFee !== undefined
          ? amount + CLAIM_FEE + BigInt(planFee)
          : undefined
        : planFee !== undefined
          ? amount + BigInt(planFee)
          : undefined;

  const amountInput = isMax
    ? amount > 0n
      ? zatoshiToZec(amount)
      : ""
    : amountString;

  return (
    <PageShell title="Send">
      <TransferForm onSubmit={onSubmit} className="mt-6 gap-4">
        <section aria-label="Amount" className={cardClassName}>
          <div className="flex items-center justify-between gap-4">
            <h2 className={sectionLabelClassName}>Pay from</h2>
            <div id="send-available" className="[&>*]:mt-0">
              <AvailableWithMax
                available={availableBalance}
                isMax={isMax}
                onToggleMax={() => {
                  setIsMax(!isMax);
                  setProblem(undefined);
                }}
              />
            </div>
          </div>
          <ShieldedTransparentToggle
            label="Pay from"
            isTransparent={isTransparentFrom}
            setIsTransparent={(value) => {
              setIsTransparentFrom(value);
              setProblem(undefined);
            }}
          />
          <div className="px-6 py-2">
            <AmountInput
              ref={amountRef}
              value={amountInput}
              className={twMerge("h-24", amountError && "text-red-700")}
              maxFontSize="4.5rem"
              aria-invalid={Boolean(amountError)}
              aria-describedby={
                amountError
                  ? "send-amount-error send-available"
                  : "send-available"
              }
              onChange={(e) => {
                setIsMax(false);
                setAmountString(e.target.value);
                setProblem(undefined);
              }}
            />
          </div>
          {amountError && (
            <p
              id="send-amount-error"
              role="alert"
              className="-mt-2 text-sm text-center font-medium text-red-700 motion-safe:animate-fade-in"
            >
              {amountError}
            </p>
          )}
        </section>

        <section
          aria-labelledby="send-to"
          className={twMerge(cardClassName, "gap-5")}
        >
          <div className="flex items-center justify-between gap-4">
            <h2 id="send-to" className={sectionLabelClassName}>
              {isPaymentLink ? (
                "To"
              ) : (
                <label htmlFor="send-to-address">To</label>
              )}
            </h2>
            <div className="group/link -my-1 flex items-center gap-2 py-1 pl-3 pr-1 rounded-full transition-colors duration-300 hover:bg-gold/15">
              <label
                htmlFor="send-payment-link"
                className="flex items-center gap-1.5 text-xs font-medium cursor-pointer select-none"
              >
                <LinkIcon className="size-3.5 transition-transform duration-300 group-hover/link:-rotate-12" />
                Payment link
              </label>
              <Toggle
                id="send-payment-link"
                active={isPaymentLink}
                className={twMerge(
                  "transition-colors duration-300",
                  isPaymentLink
                    ? "bg-gold border-gold"
                    : "group-hover/link:border-line-strong",
                )}
                toggleClassname={twMerge(
                  "duration-300",
                  isPaymentLink
                    ? "bg-black"
                    : "bg-neutral-400 group-hover/link:bg-neutral-600",
                )}
                onChange={(value) => {
                  setIsPaymentLink(value);
                  setIsMax(false);
                  setProblem(undefined);
                }}
              />
            </div>
          </div>

          {isPaymentLink ? (
            <>
              <div
                role="note"
                className="flex items-center gap-3 px-4 py-3 rounded-lg bg-gold/25 motion-safe:animate-fade-in"
              >
                <span className="shrink-0 grid place-items-center size-8 rounded-md bg-gold motion-safe:animate-pop-in">
                  <LinkIcon className="size-4" />
                </span>
                <p className="text-xs font-medium">
                  You'll get a link to share instead of entering an address.
                  Anyone who has the link can claim the money, so share it
                  privately.
                </p>
              </div>
              <div className="motion-safe:animate-fade-in">
                <label
                  htmlFor="send-description"
                  className="block mb-2 text-xs font-medium"
                >
                  Description <span className="text-gray-600">(optional)</span>
                </label>
                <input
                  id="send-description"
                  name="description"
                  type="text"
                  autoComplete="off"
                  placeholder="What it's for"
                  aria-invalid={Boolean(descriptionProblem)}
                  aria-describedby="send-description-hint"
                  className={twMerge(
                    inputClassName,
                    "h-11",
                    descriptionProblem &&
                      "border-red-700 hover:border-red-700 focus:border-red-700",
                  )}
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    setProblem(undefined);
                  }}
                />
                <div
                  id="send-description-hint"
                  className="mt-2 flex justify-between gap-2 text-xs text-gray-600"
                >
                  <span
                    className={twMerge(descriptionProblem && "text-red-700")}
                  >
                    {descriptionProblem ?? "Whoever claims the link sees this"}
                  </span>
                  <span
                    className={twMerge(
                      "tabular-nums",
                      descriptionProblem && "text-red-700",
                    )}
                  >
                    {descriptionBytes}/{DESCRIPTION_BYTES}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="motion-safe:animate-fade-in">
                <input
                  id="send-to-address"
                  name="to"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Enter Zcash address..."
                  ref={toRef}
                  aria-invalid={isInvalidTo || Boolean(toError)}
                  aria-describedby="send-to-kind"
                  className={twMerge(
                    inputClassName,
                    "h-11 text-ellipsis",
                    isTransparentTo &&
                      "border-black hover:border-black focus:border-black",
                    isShieldedTo &&
                      "border-gold hover:border-gold focus:border-gold",
                    (isInvalidTo || toError) &&
                      "border-red-700 hover:border-red-700 focus:border-red-700",
                  )}
                  value={to}
                  onChange={(e) => {
                    setTo(e.target.value.trim());
                    setProblem(undefined);
                  }}
                />
                <div
                  id="send-to-kind"
                  aria-live="polite"
                  className="mt-2.5 empty:mt-0 flex items-center gap-1.5 text-xs font-medium"
                >
                  {toError ? (
                    <span
                      role="alert"
                      className="flex items-center gap-1.5 text-red-700 motion-safe:animate-fade-in"
                    >
                      <span
                        aria-hidden="true"
                        className="size-2 rounded-full bg-red-700"
                      />
                      {toError}
                    </span>
                  ) : (
                    to &&
                    toKind !== undefined && (
                      <span
                        key={toKind}
                        className="flex items-center gap-1.5 motion-safe:animate-fade-in"
                      >
                        <span
                          aria-hidden="true"
                          className={twMerge(
                            "size-2 rounded-full",
                            isShieldedTo && "bg-gold",
                            isTransparentTo && "border border-black",
                            isInvalidTo && "bg-red-700",
                          )}
                        />
                        <span
                          className={twMerge(isInvalidTo && "text-red-700")}
                        >
                          {isShieldedTo
                            ? "Shielded address"
                            : isTransparentTo
                              ? "Transparent address, visible on-chain"
                              : "Not a valid Zcash address"}
                        </span>
                      </span>
                    )
                  )}
                </div>
              </div>

              {!showMemo
                ? !isTransparentTo && (
                    <button
                      type="button"
                      className={twMerge(
                        "self-start py-1 text-sm font-medium rounded-sm cursor-pointer underline decoration-transparent underline-offset-4 transition-colors duration-300 hover:decoration-current",
                        focusClassName,
                      )}
                      onClick={() => setShowMemo(true)}
                    >
                      + Add a message
                    </button>
                  )
                : (!isTransparentTo || memoText) && (
                    <div>
                      <div className="mb-2 flex justify-between text-xs font-medium">
                        <label htmlFor="send-memo">Message</label>
                        <button
                          type="button"
                          aria-label="Remove message"
                          className={twMerge(
                            "rounded-sm cursor-pointer underline decoration-transparent underline-offset-2 transition-colors duration-300 hover:decoration-current",
                            focusClassName,
                          )}
                          onClick={() => {
                            setShowMemo(false);
                            setMemoText("");
                            setProblem(undefined);
                          }}
                        >
                          Remove
                        </button>
                      </div>
                      <textarea
                        id="send-memo"
                        name="memo"
                        rows={3}
                        autoFocus
                        placeholder="Only the recipient can read this"
                        aria-invalid={Boolean(memoProblem)}
                        aria-describedby="send-memo-hint"
                        className={twMerge(
                          inputClassName,
                          "py-3 resize-none",
                          memoProblem &&
                            "border-red-700 hover:border-red-700 focus:border-red-700",
                        )}
                        value={memoText}
                        onChange={(e) => {
                          setMemoText(e.target.value);
                          setProblem(undefined);
                        }}
                      />
                      <div
                        id="send-memo-hint"
                        className="mt-2 flex justify-between gap-2 text-xs text-gray-600"
                      >
                        <span className="text-red-700">{memoProblem}</span>
                        <span
                          className={twMerge(
                            "tabular-nums",
                            memoBytes > MEMO_BYTES && "text-red-700",
                          )}
                        >
                          {memoBytes}/{MEMO_BYTES}
                        </span>
                      </div>
                    </div>
                  )}
            </>
          )}
        </section>

        <section
          aria-labelledby="send-summary"
          className={twMerge(cardClassName, "gap-0 [&>div]:mt-2")}
        >
          <h2
            id="send-summary"
            className={twMerge(sectionLabelClassName, "mb-1")}
          >
            Summary
          </h2>
          <FeeRow
            label={isPaymentLink ? "Link amount" : "Amount"}
            fee={amount > 0n ? amount : undefined}
            pending={isMax && maxAmount.isLoading}
          />
          <PlannedFee {...planned} />
          {isPaymentLink && (
            <FeeRow label="Claim fee" fee={CLAIM_FEE} pending={false} />
          )}
          <TotalRow value={total} />
        </section>

        <div>
          <ActionButton
            size="lg"
            className="w-full"
            backgroundColor={isTransparentTransfer ? "black" : "gold-button"}
            textColor={isTransparentTransfer ? "white" : undefined}
            disabled={send.isPending}
          >
            {send.isPending
              ? "Sending..."
              : isPaymentLink
                ? "Create payment link"
                : "Send"}
          </ActionButton>

          <p className="mt-3 flex items-center justify-center gap-1.5 text-sm font-medium">
            {isTransparentTransfer ? (
              <ShieldSlashIcon aria-hidden="true" className="size-4" />
            ) : (
              <ShieldCheckIcon
                aria-hidden="true"
                className="size-4 text-gold"
              />
            )}
            {isTransparentFrom && isTransparentTo
              ? "This transfer is transparent"
              : isTransparentTransfer
                ? "This transfer is partly shielded"
                : "This transfer is shielded"}
          </p>

          {shieldedChange > 0n && (
            <p className="mt-1 text-xs text-center text-gray-600">
              <ZecValue zat={shieldedChange} /> also moves from your transparent
              to your shielded balance, so the amount you send stays private.
            </p>
          )}

          {send.isPending && <SubmitProgress stages={send.stages} />}

          {formError && <FormError>{formError}</FormError>}
        </div>
      </TransferForm>
    </PageShell>
  );
}
