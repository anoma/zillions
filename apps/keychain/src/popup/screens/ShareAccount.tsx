/**
 * Asked before "Use" moves the current tab's connected site to an account it
 * was never given: the site would see it from then on.
 */
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { createBackgroundClient } from "../../ipc/client";
import { useAccounts } from "../context/AccountContext";
import { useCurrentSite } from "../currentSite";
import routes from "../routes";
import { Avatar, siteHost, SiteIcon } from "../ui/Avatar";
import { ActionBar, Button } from "../ui/Button";
import { Notice } from "../ui/Notice";
import { Eyebrow, Row } from "../ui/Row";
import { ScreenHeader } from "../ui/ScreenHeader";

export const ShareAccount = () => {
  const navigate = useNavigate();
  const client = useMemo(() => createBackgroundClient(), []);
  const site = useCurrentSite(client);
  const { accountId = "" } = useParams<{ accountId: string }>();
  const { getById, changeActiveAccount } = useAccounts();
  const account = getById(accountId);
  const [busy, setBusy] = useState(false);

  if (!account || !site?.connected) return null;
  const host = siteHost(site.origin);

  return (
    <>
      <ScreenHeader title="Use account" back />
      <Eyebrow>Site</Eyebrow>
      <Row lead={<SiteIcon origin={site.origin} />} title={host} />
      <Eyebrow>Account</Eyebrow>
      <Row
        lead={<Avatar accountId={account.id} alias={account.alias} />}
        title={account.alias}
      />
      <Notice tone="gold" title="Shares this account" className="mt-4">
        {host} will see {account.alias}&apos;s balance and full history, past
        and future, and can ask you to approve payments from it.
        Disconnecting later won&apos;t undo this.
      </Notice>
      {/* Not DecisionBar: its click guard is for windows a site can open, and
          only the user opens this popup, which is too small for the guard. */}
      <ActionBar>
        <Button variant="secondary" disabled={busy} onClick={() => void navigate(-1)}>
          Cancel
        </Button>
        <Button
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void changeActiveAccount(account.id, account.type, site.origin)
              .then(() => navigate(routes.accountList()))
              .finally(() => setBusy(false));
          }}
        >
          Share and use
        </Button>
      </ActionBar>
    </>
  );
};
