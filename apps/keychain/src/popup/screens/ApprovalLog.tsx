/**
 * Approval log: what the user approved or rejected in approval windows, per
 * site, newest first. Kept by the background, encrypted in the vault.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { GoHistory } from "react-icons/go";

import { shortenAddress } from "@zillions/utils";

import { formatZec } from "../../approvals/utils/format";
import { createBackgroundClient } from "../../ipc/client";
import type { ApprovalLogEntry } from "../../ipc/contract";
import { siteHost, SiteIcon } from "../ui/Avatar";
import { Notice } from "../ui/Notice";
import { Row } from "../ui/Row";
import { ScreenHeader } from "../ui/ScreenHeader";
import { Tag } from "../ui/Tag";

const KIND_LABEL: Record<ApprovalLogEntry["kind"], string> = {
  connect: "Connect",
  disconnect: "Disconnect",
  sign: "Sign transaction",
  "default-account": "Change active account",
  "open-link": "Show payment link",
};

const OUTCOME: Record<
  ApprovalLogEntry["outcome"],
  { label: string; tone: "soft" | "danger" | "neutral" }
> = {
  approved: { label: "Approved", tone: "soft" },
  rejected: { label: "Rejected", tone: "neutral" },
  closed: { label: "Closed", tone: "neutral" },
  failed: { label: "Failed", tone: "danger" },
};

const relativeTime = (at: number, now: number): string => {
  const minutes = Math.round((now - at) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

const entryTitle = (entry: ApprovalLogEntry): string =>
  entry.kind === "sign" && entry.amount
    ? `Send ${formatZec(entry.amount)}`
    : KIND_LABEL[entry.kind];

export const ApprovalLog = () => {
  const client = useMemo(() => createBackgroundClient(), []);
  const [entries, setEntries] = useState<ApprovalLogEntry[]>();
  const [error, setError] = useState<string>();
  const now = Date.now();

  const load = useCallback(() => {
    client
      .approvalLog()
      .then((list) => {
        setEntries(list);
        setError(undefined);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [client]);
  useEffect(load, [load]);

  const clear = async (): Promise<void> => {
    await client.clearApprovalLog();
    load();
  };

  return (
    <>
      <ScreenHeader
        back
        title="Approval log"
        right={
          entries && entries.length > 0 && (
            <button
              type="button"
              className="text-xs font-semibold text-muted cursor-pointer hover:text-black"
              onClick={() => void clear()}
            >
              Clear
            </button>
          )
        }
      />
      {error && (
        <Notice tone="danger" title="Couldn't load the log" className="mt-3.5">
          {error}
        </Notice>
      )}
      {!error && entries?.length === 0 && (
        <section className="flex flex-col items-center gap-2 px-6 pt-20 text-center">
          <span className="size-12 mb-1 grid place-items-center rounded-pill bg-card text-muted">
            <GoHistory className="size-5" />
          </span>
          <p className="m-0 text-sm font-semibold">No approvals yet</p>
          <p className="m-0 text-xs leading-relaxed text-muted">
            Requests you approve or reject in the Keychain show here. The log
            stays on this device.
          </p>
        </section>
      )}
      <div className="pb-4">
        {entries?.map((entry) => (
          <Row
            key={entry.id}
            lead={<SiteIcon origin={entry.origin} />}
            title={entryTitle(entry)}
            subtitle={[
              siteHost(entry.origin),
              entry.to && `to ${shortenAddress(entry.to, 6, 4, "…")}`,
              relativeTime(entry.at, now),
            ]
              .filter(Boolean)
              .join(" · ")}
            trail={<Tag tone={OUTCOME[entry.outcome].tone}>{OUTCOME[entry.outcome].label}</Tag>}
          />
        ))}
      </div>
    </>
  );
};
