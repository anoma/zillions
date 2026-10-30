import clsx from "clsx";

import { accountColor, useAccountColors } from "../prefs";

const SIZES = {
  sm: "size-[26px] text-[11px]",
  md: "size-8 text-xs",
  lg: "size-12 text-[17px]",
} as const;

type AvatarProps = {
  accountId: string;
  alias: string;
  size?: keyof typeof SIZES;
  /** Overrides the stored colour (colour picker preview). */
  color?: string;
};

/** The account's initial on its colour. */
export const Avatar = ({ accountId, alias, size = "md", color }: AvatarProps) => {
  useAccountColors();
  return (
    <span
      aria-hidden
      className={clsx(
        "shrink-0 rounded-pill grid place-items-center font-bold text-[#111]",
        SIZES[size]
      )}
      style={{ backgroundColor: color ?? accountColor(accountId) }}
    >
      {[...alias.trim()][0]?.toUpperCase() ?? "?"}
    </span>
  );
};

/** A site's host without `www.`, or the origin itself when it won't parse. */
export const siteHost = (origin: string): string => {
  try {
    return new URL(origin).host.replace(/^www\./, "");
  } catch {
    return origin;
  }
};

/**
 * A monogram for a site: its first letter. No favicon, which would mean a
 * request to the site from inside the Keychain.
 */
export const SiteIcon = ({
  origin,
  size = "md",
}: {
  origin: string;
  size?: "md" | "lg";
}) => (
  <span
    aria-hidden
    className={clsx(
      "shrink-0 grid place-items-center bg-black text-white font-bold",
      size === "lg" ? "size-16 rounded-[18px] text-[26px]" : "size-8 rounded-[9px] text-[13px]"
    )}
  >
    {siteHost(origin)[0]?.toUpperCase() ?? "?"}
  </span>
);
