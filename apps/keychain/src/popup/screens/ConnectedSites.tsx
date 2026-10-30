/**
 * Connected Sites: dapp origins approved to connect, each seeing the active
 * account, with per-site and disconnect-all revocation.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { createBackgroundClient } from "../../ipc/client";
import { useAccounts } from "../context/AccountContext";
import { useCurrentSite } from "../currentSite";
import { siteHost, SiteIcon } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Notice } from "../ui/Notice";
import { Eyebrow, Footer, Row } from "../ui/Row";
import { ScreenHeader } from "../ui/ScreenHeader";
import { SiteStatus } from "../ui/SiteStatus";

export const ConnectedSites = () => {
  const client = useMemo(() => createBackgroundClient(), []);
  const { parentAccounts, activeAccountId } = useAccounts();
  const [connectedSites, setConnectedSites] = useState<string[]>();
  const site = useCurrentSite(client, connectedSites);
  const activeName = parentAccounts.find((a) => a.id === activeAccountId)?.alias;

  const fetchConnectedSites = useCallback(() => {
    client.connectedSites().then(setConnectedSites).catch(console.error);
  }, [client]);
  useEffect(fetchConnectedSites, [fetchConnectedSites]);

  const revoke = async (...sites: string[]): Promise<void> => {
    for (const s of sites) {
      await client.revokeConnection(s);
    }
    fetchConnectedSites();
  };

  return (
    <>
      <ScreenHeader back title="Connected sites" />
      <SiteStatus site={site} accountName={activeName} />
      {connectedSites?.length === 0 && (
        <Notice tone="neutral" className="mt-3.5">
          No sites are connected. A site asks to connect the first time it
          needs your wallet.
        </Notice>
      )}
      {connectedSites && connectedSites.length > 0 && (
        <>
          <Eyebrow>
            {connectedSites.length === 1 ? "1 site" : `${connectedSites.length} sites`}
          </Eyebrow>
          {connectedSites.map((origin) => (
            <Row
              key={origin}
              lead={<SiteIcon origin={origin} />}
              title={<span title={origin}>{siteHost(origin)}</span>}
              subtitle={
                activeName ? (
                  <>
                    Sees <b className="font-semibold text-ink-2">{activeName}</b>
                  </>
                ) : (
                  origin
                )
              }
              trail={
                <Button variant="secondary" size="sm" onClick={() => void revoke(origin)}>
                  Disconnect
                </Button>
              }
            />
          ))}
          <Footer>
            <span />
            <button
              type="button"
              className="text-danger cursor-pointer"
              onClick={() => void revoke(...connectedSites)}
            >
              Disconnect all
            </button>
          </Footer>
        </>
      )}
    </>
  );
};
