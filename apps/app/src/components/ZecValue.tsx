import { zatoshiToZec } from "../lib/utils";

export function ZecValue({
  zat,
  className,
}: {
  zat: bigint;
  className?: string;
}) {
  return (
    <span className={className}>
      {zatoshiToZec(zat)}
      <span className="text-[max(8px,0.5em)]"> ZEC</span>
    </span>
  );
}
