import { twMerge } from "tailwind-merge";
import { useAddressKind } from "../hooks/useAddresses";
import { shortenAddress } from "../lib/utils";
import type { Party } from "../lib/wallet/types";
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
  // The same dots as the balance card's pool legend.
  const dot = (
    <span
      aria-hidden="true"
      className={twMerge(
        "size-2 shrink-0 rounded-full",
        pool === "transparent"
          ? "border border-black/40 bg-black/10"
          : "bg-gold",
      )}
    />
  );
  const classes = twMerge(
    "flex items-center gap-2 text-sm font-medium whitespace-nowrap",
    className,
  );
  if (!address) {
    return (
      <div className={classes}>
        {dot}
        {pool && pool[0].toUpperCase() + pool.slice(1)}
      </div>
    );
  }
  if (!copyable) {
    return (
      <div title={address} className={classes}>
        {dot}
        {shortenAddress(address)}
      </div>
    );
  }
  return (
    <CopyToClipboardControl
      value={address}
      className={twMerge("group", classes)}
      iconClassName="size-4 [@media(hover:hover)]:opacity-0 group-hover:opacity-100"
    >
      {dot}
      <span title={address}>{shortenAddress(address)}</span>
    </CopyToClipboardControl>
  );
}
