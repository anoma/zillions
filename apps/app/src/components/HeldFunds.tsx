import { GoInfo } from "react-icons/go";
import { twMerge } from "tailwind-merge";
import { readyIn, useReadyIn } from "../hooks/useConfirming";
import { zatoshiToZec } from "../lib/utils";
import { Tooltip } from "./Tooltip";

/** An info icon on the `zat` of `pool` still confirming; nothing when there is none. */
export function HeldFunds({
  zat,
  pool,
  className,
}: {
  zat: bigint;
  pool: "shielded" | "transparent";
  className?: string;
}) {
  const ms = useReadyIn();
  if (zat <= 0n) return null;

  return (
    <Tooltip
      position="bottom"
      className={twMerge("z-10 w-56 p-3 font-normal text-left", className)}
      content={`${zatoshiToZec(zat)} ZEC of your ${pool} balance is still confirming. ${readyIn(ms)}`}
    >
      <GoInfo
        aria-hidden="true"
        className="size-3.5 text-black/35 transition-colors hover:text-black/60"
      />
    </Tooltip>
  );
}
