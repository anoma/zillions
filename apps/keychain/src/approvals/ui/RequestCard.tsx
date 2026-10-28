import { Avatar, siteHost, SiteIcon } from "../../popup/ui/Avatar";

type RequestCardProps = {
  origin: string;
  /** What the account is asked for, e.g. "Signing with". */
  accountLabel?: string;
  account?: { id: string; alias: string };
};

/**
 * Who is asking, set apart from what is asked: the site on top, the account
 * it involves below a hairline.
 */
export const RequestCard = ({ origin, accountLabel, account }: RequestCardProps) => (
  <section aria-label="Request" className="rounded-xl border border-line bg-card">
    <div className="flex items-center gap-3 px-3.5 py-3">
      <SiteIcon origin={origin} />
      <div className="min-w-0">
        <p className="m-0 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">
          Request from
        </p>
        <p className="m-0 mt-0.5 text-sm font-semibold truncate" title={origin}>
          {siteHost(origin)}
        </p>
      </div>
    </div>
    {accountLabel && (
      <div className="flex items-center justify-between gap-3 border-t border-line px-3.5 py-2.5 text-[12.5px]">
        <span className="font-medium text-muted">{accountLabel}</span>
        {account ? (
          <span className="flex min-w-0 items-center gap-2 font-semibold">
            <Avatar accountId={account.id} alias={account.alias} size="sm" />
            <span className="truncate">{account.alias}</span>
          </span>
        ) : (
          <span className="font-semibold">Active account</span>
        )}
      </div>
    )}
  </section>
);
