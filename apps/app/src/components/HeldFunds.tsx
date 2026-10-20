import { GoInfo } from "react-icons/go";
import { twMerge } from "tailwind-merge";
import { useGetBalance } from "../hooks/useGetBalance";
import { zatoshiToZec } from "../lib/utils";
import { Tooltip } from "./Tooltip";

/** An info icon whose tooltip names what pending transactions hold; nothing while they hold none. */
export function HeldFunds({ className }: { className?: string }) {
  const balance = useGetBalance();
  const held = balance.data
    ? balance.data.pendingChange + balance.data.pendingSpendable
    : 0n;
  if (held <= 0n) return null;

  return (
    <Tooltip
      position="bottom"
      className={twMerge("z-10 w-56 p-3 font-normal text-left", className)}
      content={`${zatoshiToZec(held)} ZEC from pending transactions isn't spendable yet. It will be once they confirm.`}
    >
      <GoInfo
        aria-hidden="true"
        className="size-3.5 text-black/35 transition-colors hover:text-black/60"
      />
    </Tooltip>
  );
}
