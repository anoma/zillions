import { createFileRoute } from "@tanstack/react-router";
import { useState, type ComponentProps } from "react";
import { twMerge } from "tailwind-merge";
import { ShieldedTransparentToggle } from "../components/ShieldedTransparentToggle";
import { ActionButton } from "../components/ui/ActionButton";
import { ZecValue } from "../components/ZecValue";
import { useAccount } from "../hooks/useAccount";
import { useFee } from "../hooks/useFee";
import { useGetBalance } from "../hooks/useGetBalance";
import { useTransfer } from "../hooks/useTransfer";
import { SpinnerIcon } from "../icons/SpinnerIcon";
import { invariant } from "../lib/invariant";
import {
  isShieldedAddress,
  isTransparentAddress,
  zecToZatoshi,
} from "../lib/utils";
import { TransferSuccess } from "./TransferSuccess";

export const Route = createFileRoute("/send")({
  component: SendRoute,
});

function SendRoute() {
  const account = useAccount();
  const balance = useGetBalance();

  const [isTransparentFrom, setIsTransparentFrom] = useState(false);
  const [amountString, setAmountString] = useState("");
  const [to, setTo] = useState("");
  const [validationMessage, setValidationMessage] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [receipt, setReceipt] =
    useState<ComponentProps<typeof TransferSuccess>["tx"]>();

  const transfer = useTransfer();

  const amount = (() => {
    try {
      return zecToZatoshi(amountString);
    } catch {
      return 0n;
    }
  })();

  const fee = useFee(
    isTransparentFrom ? account.transparent.address : account.shielded.address,
    to,
    amount,
  );

  const onSubmit = async () => {
    try {
      setIsPending(true);
      setValidationMessage("");

      invariant(amountString, "Set an amount");
      invariant(to, "Set an recipient");

      invariant(amount > 0, "Set an amount");
      invariant(amount <= availableBalance, "Insufficient balance");

      const from = isTransparentFrom
        ? account.transparent.address
        : account.shielded.address;

      const { txid, fee } = await transfer.mutateAsync({ from, to, amount });
      setReceipt({
        txid,
        tx_type: "Sent",
        value: -amount,
        fee,
        status: "Pending",
        timestamp: Date.now(),
        from_address: from,
        to_address: to,
      });
    } catch (error) {
      setValidationMessage(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setIsPending(false);
    }
  };

  const availableBalance = (() => {
    if (!balance.data) {
      return 0n;
    }
    if (isTransparentFrom) {
      return balance.data.unshieldedBalance;
    }
    return balance.data.orchardBalance + balance.data.saplingBalance;
  })();

  const isTransparentTo = isTransparentAddress(to);
  const isShieldedTo = isShieldedAddress(to);

  if (receipt) {
    return <TransferSuccess tx={receipt} />;
  }

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

        <div className="mt-4 text-xs font-medium text-center">
          Available: <ZecValue zat={availableBalance} />
        </div>

        <input
          name="amount"
          type="text"
          placeholder="0"
          autoComplete="off"
          className="mt-2 h-30 w-full text-center text-8xl leading-none font-medium outline-none placeholder:text-black focus:placeholder:text-transparent"
          value={amountString}
          onFocus={() => setValidationMessage("")}
          onChange={(e) => {
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
              setTo(e.target.value);
              setValidationMessage("");
            }}
          />
        </label>

        <div className="mt-4 flex items-center justify-between text-xs font-medium">
          <div>Transaction fee</div>
          <div>
            {fee.data ? (
              <ZecValue zat={fee.data} />
            ) : fee.isLoading ? (
              <SpinnerIcon className="size-3" />
            ) : (
              "-"
            )}
          </div>
        </div>

        <ActionButton
          size="lg"
          className="mt-4 w-full"
          backgroundColor={
            isTransparentFrom || isTransparentTo ? "black" : undefined
          }
          textColor={isTransparentFrom || isTransparentTo ? "white" : undefined}
          disabled={isPending}
        >
          {isPending ? "Sending..." : "Send"}
        </ActionButton>

        <div className="mt-2 text-sm text-center font-medium">
          {isTransparentFrom && isTransparentTo
            ? "This transfer is transparent"
            : isTransparentFrom || isTransparentTo
              ? "This transfer is partly shielded"
              : "This transfer is shielded"}
        </div>

        {validationMessage && (
          <div className="mt-4 text-red-500 text-center">
            {validationMessage}
          </div>
        )}
      </form>
    </div>
  );
}
