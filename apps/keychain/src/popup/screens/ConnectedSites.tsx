/**
 * Connected Sites settings screen: lists dapp origins approved to connect,
 * with per-site and disconnect-all revocation, over the typed IPC channels.
 */
import clsx from "clsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GoX } from "react-icons/go";

import { ActionButton, Alert, Stack } from "@zillions/components";

import { createBackgroundClient } from "../../ipc/client";
import { PageHeader } from "../ui/PageHeader";

export const ConnectedSites = () => {
  const client = useMemo(() => createBackgroundClient(), []);
  const [connectedSites, setConnectedSites] = useState<string[]>();

  const fetchConnectedSites = useCallback(() => {
    client
      .connectedSites()
      .then((origins) => setConnectedSites(origins))
      .catch(console.error);
  }, [client]);

  useEffect(fetchConnectedSites, [fetchConnectedSites]);

  const handleRevokeConnection = async (...sites: string[]): Promise<void> => {
    for (const site of sites) {
      await client.revokeConnection(site);
    }
    fetchConnectedSites();
  };

  const hasConnectedSites = connectedSites && connectedSites.length > 0;

  return (
    <Stack gap={6}>
      <PageHeader title="Connected Sites" />
      {!hasConnectedSites && (
        <Alert type="info">No connected sites found.</Alert>
      )}

      {hasConnectedSites && (
        <Stack gap={4}>
          <div>
            <div className="w-36 float-right">
              <ActionButton
                size="xs"
                onClick={() => void handleRevokeConnection(...connectedSites)}
              >
                Disconnect All
              </ActionButton>
            </div>
          </div>
          {connectedSites.map((site, i) => (
            <li
              key={`connected-site-${i}`}
              className={clsx(
                "border border-black rounded-md flex justify-between items-center text-black",
                "items-center text-base py-4 px-6"
              )}
            >
              <span className="text-ellipsis overflow-hidden" title={site}>
                {site}
              </span>
              <span
                className="text-black p-2 cursor-pointer hover:text-neutral-hover -mr-2"
                onClick={() => void handleRevokeConnection(site)}
              >
                <GoX />
              </span>
            </li>
          ))}
        </Stack>
      )}
    </Stack>
  );
};
