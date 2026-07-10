import { createFileRoute } from "@tanstack/react-router";
import { useState, type ComponentProps } from "react";
import { ActionButton } from "../components/ui/ActionButton";
import { ZecValue } from "../components/ZecValue";
import { useAccount } from "../hooks/useAccount";
import { useFee } from "../hooks/useFee";
import { useGetBalance } from "../hooks/useGetBalance";
import { useTransfer } from "../hooks/useTransfer";
import { SpinnerIcon } from "../icons/SpinnerIcon";
import { invariant } from "../lib/invariant";
import { zecToZatoshi } from "../lib/utils";
import { TransferSuccess } from "./TransferSuccess";

export const Route = createFileRoute("/unshield")({
  component: UnshieldRoute,
});

function UnshieldRoute() {
  const account = useAccount();
  const balance = useGetBalance();

  const [amountString, setAmountString] = useState("");
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
    account.shielded.address,
    account.transparent.address,
    amount,
  );

  const availableBalance = balance.data
    ? balance.data.orchardBalance + balance.data.saplingBalance
    : 0n;

  const onSubmit = async () => {
    try {
      setIsPending(true);
      setValidationMessage("");

      invariant(amountString, "Set an amount");
      invariant(amount > 0, "Set an amount");
      invariant(amount <= availableBalance, "Insufficient balance");

      const from = account.shielded.address;
      const to = account.transparent.address;

      const { txid, fee } = await transfer.mutateAsync({ from, to, amount });
      setReceipt({
        txid,
        tx_type: "Unshielded",
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

  if (receipt) {
    return <TransferSuccess tx={receipt} />;
  }

  return (
    <div className="p-10">
      <h1 className="text-center text-lg font-bold">Unshield</h1>
      <form
        className="w-full max-w-125 mx-auto mt-10 flex flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <div>
          <div className="text-xs font-medium mb-1">From</div>
          <div className="h-11 w-full p-0.5 rounded-full border border-gray-300">
            <div className="h-full w-full flex items-center justify-center rounded-full bg-gold font-medium">
              Shielded
            </div>
          </div>
        </div>

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

        <div className="mt-4">
          <div className="text-xs font-medium mb-1">To</div>
          <div
            title={account.transparent.address}
            className="h-11 w-full flex items-center justify-center rounded-full border border-gray-300 font-medium"
          >
            Transparent
          </div>
        </div>

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
          backgroundColor="black"
          textColor="white"
          disabled={isPending || amount <= 0n}
        >
          {isPending ? "Sending..." : "Send"}
        </ActionButton>

        {validationMessage && (
          <div className="mt-4 text-red-500 text-center">
            {validationMessage}
          </div>
        )}
      </form>
    </div>
  );
}
