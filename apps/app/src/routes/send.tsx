import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { twMerge } from "tailwind-merge";
import { PlannedFee } from "../components/PlannedFee";
import { ShieldedTransparentToggle } from "../components/ShieldedTransparentToggle";
import { ActionButton } from "../components/ui/ActionButton";
import { ZecValue } from "../components/ZecValue";
import { useAddressKind } from "../hooks/useAddresses";
import { useGetBalance } from "../hooks/useGetBalance";
import { planProblem, useSend, useSendPlan } from "../hooks/useSend";
import { zatoshiToZec, zecToZatoshi } from "../lib/utils";
import { TransferSuccess } from "./TransferSuccess";

export const Route = createFileRoute("/send")({
  component: SendRoute,
});

function SendRoute() {
  const balance = useGetBalance();

  const [isTransparentFrom, setIsTransparentFrom] = useState(false);
  const [amountString, setAmountString] = useState("");
  const [isMax, setIsMax] = useState(false);
  const [to, setTo] = useState("");
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

  // No memo from the UI; `SendRequest.memo` stays for ones the app sets.
  const planned = useSendPlan({ from, to, amount: typed }, isMax);
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
            : ceiling
              ? planProblem(planned)
              : undefined;
    if (problem) {
      setValidationMessage(problem);
      return;
    }
    send.mutate({
      from,
      to,
      amount,
      shown: {
        tx_type: "Sent",
        value: -amount,
        from: { pool: from },
        to: { address: to },
      },
    });
  };

  if (send.data) {
    return <TransferSuccess tx={{ ...send.data, status: "Pending" }} />;
  }

  const error = send.error?.message ?? planProblem(planned);

  return (
    <div className="p-10">
      <h1 className="text-center text-lg font-bold">Send</h1>
      <form
        className="w-full max-w-125 mx-auto mt-10 flex flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <label>
          <div className="text-xs font-medium mb-1">From</div>
          <ShieldedTransparentToggle
            isTransparent={isTransparentFrom}
            setIsTransparent={(value) => {
              setIsTransparentFrom(value);
              setValidationMessage("");
            }}
          />
        </label>

        <div className="mt-4 flex items-center justify-center gap-2 text-xs font-medium">
          <span>
            Available: <ZecValue zat={availableBalance} />
          </span>
          <button
            type="button"
            className={twMerge(
              "px-2 py-0.5 rounded-full border border-gray-300",
              isMax && "bg-black text-white border-black",
            )}
            title={to ? undefined : "Enter a recipient to fill the maximum"}
            onClick={() => {
              setIsMax(!isMax);
              setValidationMessage("");
            }}
          >
            Max
          </button>
        </div>

        <input
          name="amount"
          type="text"
          placeholder="0"
          autoComplete="off"
          className="mt-2 h-30 w-full text-center text-8xl leading-none font-medium outline-none placeholder:text-black focus:placeholder:text-transparent"
          value={
            isMax
              ? maxAmount.data
                ? zatoshiToZec(maxAmount.data)
                : ""
              : amountString
          }
          onFocus={() => setValidationMessage("")}
          onChange={(e) => {
            setIsMax(false);
            setAmountString(e.target.value);
            setValidationMessage("");
          }}
        />

        <label className="mt-4">
          <div className="text-xs font-medium mb-1">To</div>
          <input
            name="to"
            type="text"
            placeholder="Enter Zcash address..."
            className={twMerge(
              "h-11 w-full px-4 font-medium rounded-lg border border-gray-300 outline-none placeholder:text-black focus:placeholder:text-transparent",
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
        </label>

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

        {send.isPending && (
          <div className="mt-2 text-sm text-center font-medium">
            Proving takes up to a minute after you approve in the keychain.
          </div>
        )}

        {(validationMessage || error) && (
          <div className="mt-4 text-red-500 text-center">
            {validationMessage || error}
          </div>
        )}
      </form>
    </div>
  );
}
