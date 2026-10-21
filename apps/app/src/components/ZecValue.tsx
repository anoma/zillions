import { twMerge } from "tailwind-merge";
import { zatoshiToZec } from "../lib/utils";

export function ZecValue({
  zat,
  className,
}: {
  zat: bigint;
  className?: string;
}) {
  return (
    <span className={twMerge("whitespace-nowrap", className)}>
      {zatoshiToZec(zat)}
      <span className="text-[max(0.7rem,0.5em)]"> ZEC</span>
    </span>
  );
}
