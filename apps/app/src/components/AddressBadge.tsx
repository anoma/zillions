import { twMerge } from "tailwind-merge";
import { useAddressKind } from "../hooks/useAddresses";
import { shortenAddress } from "../lib/utils";
import type { Party } from "../lib/wallet/types";
import { CopyToClipboardControl } from "./CopyToClipboardControl";

export function AddressBadge({
  party,
  copyable,
  pill,
  className,
}: {
  party: Party;
  copyable?: boolean;
  /** Filled like the Shielded/Transparent toggle, instead of a dot and label. */
  pill?: boolean;
  className?: string;
}) {
  const address = "address" in party ? party.address : undefined;
  const more = "more" in party && party.more ? ` +${party.more.length}` : "";
  const kind = useAddressKind(address);
  const pool = "pool" in party ? party.pool : kind;
  // The same dots as the balance card's pool legend.
  const dot = !pill && (
    <span
      aria-hidden="true"
      className={twMerge(
        "size-2 shrink-0 rounded-full",
        pool === "transparent" ? "bg-black/10" : "bg-gold",
      )}
    />
  );
  const classes = twMerge(
    "flex items-center gap-2 text-sm font-medium whitespace-nowrap",
    pill &&
      twMerge(
        "h-12 justify-center rounded-full text-base",
        pool === "transparent" ? "border border-line bg-card" : "bg-gold",
      ),
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
        {more}
      </div>
    );
  }
  return (
    <CopyToClipboardControl
      value={address}
      className={twMerge(
        "group",
        // Hover devices hide the copy icon until hover; a blank as wide as it
        // keeps the address centered in the pill.
        pill &&
          "gap-1 [@media(hover:hover)]:before:size-4 [@media(hover:hover)]:before:shrink-0",
        classes,
      )}
      iconClassName="size-4 [@media(hover:hover)]:opacity-0 group-hover:opacity-100"
    >
      {dot}
      <span title={address} className="whitespace-nowrap">
        {shortenAddress(address)}
        {more}
      </span>
    </CopyToClipboardControl>
  );
}
