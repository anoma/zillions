import { twMerge } from "tailwind-merge";
import { useAddressKind } from "../hooks/useAddresses";
import type { Party } from "../lib/sdk/types";
import { shortenAddress } from "../lib/utils";

export function AddressBadge({
  party,
  className,
}: {
  party: Party;
  className?: string;
}) {
  const address = "address" in party ? party.address : undefined;
  const kind = useAddressKind(address);
  const pool = "pool" in party ? party.pool : kind;
  return (
    <div
      title={address}
      className={twMerge(
        "h-5 w-35 flex items-center justify-center text-xs font-medium rounded-full",
        pool === "shielded" ? "bg-gold " : "outline outline-gray-300",
        className,
      )}
    >
      {address
        ? shortenAddress(address)
        : pool === "shielded"
          ? "Shielded"
          : "Transparent"}
    </div>
  );
}
