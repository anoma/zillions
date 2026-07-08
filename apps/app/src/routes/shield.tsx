import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ActionButton } from "../components/ui/ActionButton";
import { useAccount } from "../hooks/useAccount";
import { useGetBalance } from "../hooks/useGetBalance";
import { useShield } from "../hooks/useShield";
import { useShieldFee } from "../hooks/useShieldFee";
import { invariant } from "../lib/invariant";
import { zatoshiToZec } from "../lib/utils";

export const Route = createFileRoute("/shield")({
  component: ShieldRoute,
});

// The SDK's pczt_shield only sweeps UTXOs above this threshold.
const SHIELDING_THRESHOLD = 100_000n; // 0.001 ZEC

function ShieldRoute() {
  const account = useAccount();
  const balance = useGetBalance();

  const [validationMessage, setValidationMessage] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const shield = useShield();

  const availableBalance = balance.data?.unshieldedBalance ?? 0n;
  const canShield = availableBalance >= SHIELDING_THRESHOLD;
  const fee = useShieldFee(canShield);

  const onSubmit = async () => {
    try {
      setIsPending(true);
      setValidationMessage("");

      invariant(canShield, "Nothing to shield");

      await shield.mutateAsync({ signer: account.transparent.address });
      setIsSuccess(true);
    } catch (error) {
      setValidationMessage(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setIsPending(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="p-10">
        <div>Transaction Success</div>
      </div>
    );
  }

  return (
    <div className="p-10">
      <h1 className="text-center text-lg font-bold">Shield</h1>
      <form
        className="w-full max-w-125 mx-auto mt-10 flex flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <div>
          <div className="text-xs font-medium mb-1">From</div>
          <div
            title={account.transparent.address}
            className="h-11 w-full flex items-center justify-center rounded-full border border-gray-300 font-medium"
          >
            Transparent
          </div>
        </div>

        <div className="mt-4 text-xs font-medium text-center">
          Shields all transparent funds
        </div>

        <div className="mt-2 h-30 w-full flex items-center justify-center text-center text-8xl leading-none font-medium">
          {zatoshiToZec(availableBalance)}
        </div>

        <div className="mt-4">
          <div className="text-xs font-medium mb-1">To</div>
          <div className="h-11 w-full p-0.5 rounded-full border border-gray-300">
            <div className="h-full w-full flex items-center justify-center rounded-full bg-gold font-medium">
              Shielded
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between text-xs font-medium">
          <div>Transaction fee</div>
          <div>
            {fee.data
              ? `${zatoshiToZec(fee.data)} ZEC`
              : fee.isLoading
                ? "..."
                : "-"}
          </div>
        </div>

        <ActionButton
          size="lg"
          className="mt-4 w-full"
          backgroundColor="black"
          textColor="white"
          disabled={isPending || !canShield}
        >
          {isPending ? "Shielding..." : "Shield"}
        </ActionButton>

        {!canShield && (
          <div className="mt-2 text-sm text-center font-medium">
            Only balances above {zatoshiToZec(SHIELDING_THRESHOLD)} ZEC can be
            shielded
          </div>
        )}

        {validationMessage && (
          <div className="mt-4 text-red-500 text-center">
            {validationMessage}
          </div>
        )}
      </form>
    </div>
  );
}
