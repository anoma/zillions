import { twMerge } from "tailwind-merge";
import { isShieldedAddress, shortenAddress } from "../lib/utils";

export function AddressBadge({ address }: { address?: string }) {
  const hasGoldBadge = !address || isShieldedAddress(address);
  return (
    <div
      title={address}
      className={twMerge(hasGoldBadge && "bg-gold rounded-full w-fit px-4")}
    >
      {address ? shortenAddress(address) : "Shielded"}
    </div>
  );
}
