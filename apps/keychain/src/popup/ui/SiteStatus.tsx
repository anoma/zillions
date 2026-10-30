import clsx from "clsx";

import type { CurrentSite } from "../currentSite";
import { siteHost } from "./Avatar";

/** One line saying whether the current tab's site sees the wallet. */
export const SiteStatus = ({
  site,
  accountName,
}: {
  site?: CurrentSite;
  accountName?: string;
}) => {
  if (!site) return null;
  const host = siteHost(site.origin);
  return (
    <div className="flex items-center gap-2 rounded-[10px] bg-card px-3 py-2.5 text-[11.5px] font-medium text-muted">
      <span
        className={clsx(
          "size-2 shrink-0 rounded-pill",
          site.connected ? "bg-gold" : "bg-line-strong"
        )}
      />
      <span className="truncate">
        {site.connected ? (
          <>
            Connected to {host}
            {accountName && (
              <>
                {" "}
                as <b className="font-semibold text-black">{accountName}</b>
              </>
            )}
          </>
        ) : (
          <>{host} is not connected</>
        )}
      </span>
    </div>
  );
};
