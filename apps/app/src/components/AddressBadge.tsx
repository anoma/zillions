import { twMerge } from "tailwind-merge";
import { useAddressKind } from "../hooks/useAddresses";
import { shortenAddress } from "../lib/utils";

export function AddressBadge({
  address,
  className,
}: {
  address?: string;
  className?: string;
}) {
  const kind = useAddressKind(address);
  const hasGoldBadge = !address || kind === "shielded";
  return (
    <div
      title={address}
      className={twMerge(
        "h-5 w-35 flex items-center justify-center text-xs font-medium rounded-full",
        hasGoldBadge ? "bg-gold " : "outline outline-gray-300",
        className,
      )}
    >
      {address ? shortenAddress(address) : "Shielded"}
    </div>
  );
}
