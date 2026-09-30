import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { twMerge } from "tailwind-merge";
import { ActionButton } from "../components/ui/ActionButton";
import { ZecValue } from "../components/ZecValue";
import { useAccount } from "../hooks/useAccount";
import { useUnshieldAddress } from "../hooks/useAddresses";
import { useGetBalance } from "../hooks/useGetBalance";
import { useSend, useSendPlan } from "../hooks/useSend";
import { SpinnerIcon } from "../icons/SpinnerIcon";
import { zatoshiToZec, zecToZatoshi } from "../lib/utils";
import { TransferSuccess } from "./TransferSuccess";

export const Route = createFileRoute("/unshield")({
  component: UnshieldRoute,
});

/**
 * Moves shielded funds to a transparent address of the account that nothing
 * else shows, so they can't be paired with the ones shielded from its others.
 */
function UnshieldRoute() {
  const account = useAccount();
  const balance = useGetBalance();

  const [amountString, setAmountString] = useState("");
  const [isMax, setIsMax] = useState(false);
  const [validationMessage, setValidationMessage] = useState("");

  const to = useUnshieldAddress().data ?? "";
  const typed = (() => {
    try {
      return zecToZatoshi(amountString);
    } catch {
      return 0n;
    }
  })();
  const { plan, maxAmount } = useSendPlan(
    { from: "shielded", to, amount: typed },
    isMax,
  );
  const amount = isMax ? (maxAmount.data ?? 0n) : typed;
  const send = useSend();
  const availableBalance = balance.data?.shieldedBalance ?? 0n;

  const onSubmit = () => {
    setValidationMessage("");
    const problem = !to
      ? "Wait for the wallet to sync"
      : amount <= 0n
        ? "Set an amount"
        : amount > availableBalance
          ? "Insufficient balance"
          : undefined;
    if (problem) {
      setValidationMessage(problem);
      return;
    }
    send.mutate({ from: "shielded", to, amount });
  };

  if (send.data) {
    return (
      <TransferSuccess
        tx={{
          txid: send.data.txid,
          tx_type: "Unshielded",
          value: amount,
          fee: send.data.fee,
          status: "Pending",
          timestamp: send.data.timestamp,
          from_address: account.shielded.address,
          to_address: to,
        }}
      />
    );
  }

  const error = send.error ?? plan.error ?? maxAmount.error;

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

        <div className="mt-4">
          <div className="text-xs font-medium mb-1">To</div>
          <div className="h-11 w-full flex items-center justify-center rounded-full border border-gray-300 font-medium">
            Transparent
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between text-xs font-medium">
          <div>Transaction fee</div>
          <div>
            {plan.data ? (
              <ZecValue zat={BigInt(plan.data.fee)} />
            ) : plan.isLoading || maxAmount.isLoading ? (
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
          disabled={send.isPending || amount <= 0n}
        >
          {send.isPending ? "Unshielding..." : "Unshield"}
        </ActionButton>

        {send.isPending && (
          <div className="mt-2 text-sm text-center font-medium">
            Proving takes up to a minute after you approve in the keychain.
          </div>
        )}

        {(validationMessage || error) && (
          <div className="mt-4 text-red-500 text-center">
            {validationMessage || error?.message}
          </div>
        )}
      </form>
    </div>
  );
}
