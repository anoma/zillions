import { twMerge } from "tailwind-merge";
import { useAddressKind } from "../hooks/useAddresses";
import type { Party } from "../lib/sdk/types";
import { shortenAddress } from "../lib/utils";
import { CopyToClipboardControl } from "./CopyToClipboardControl";

export function AddressBadge({
  party,
  copyable,
  className,
}: {
  party: Party;
  copyable?: boolean;
  className?: string;
}) {
  const address = "address" in party ? party.address : undefined;
  const kind = useAddressKind(address);
  const pool = "pool" in party ? party.pool : kind;
  const classes = twMerge(
    "h-5 w-35 flex items-center justify-center text-xs font-medium rounded-full",
    pool === "shielded" ? "bg-gold " : "outline outline-gray-300",
    className,
  );
  if (!address) {
    return (
      <div className={classes}>
        {pool === "shielded" ? "Shielded" : "Transparent"}
      </div>
    );
  }
  if (!copyable) {
    return (
      <div title={address} className={classes}>
        {shortenAddress(address)}
      </div>
    );
  }
  // Touch screens can't hover, so the icon only hides where hovering works;
  // there a blank as wide as the icon keeps the address centered.
  return (
    <CopyToClipboardControl
      value={address}
      className={twMerge(
        "group gap-1 [@media(hover:hover)]:before:size-4 [@media(hover:hover)]:before:shrink-0",
        classes,
      )}
      iconClassName="size-4 [@media(hover:hover)]:opacity-0 group-hover:opacity-100"
    >
      <span title={address}>{shortenAddress(address)}</span>
    </CopyToClipboardControl>
  );
}
