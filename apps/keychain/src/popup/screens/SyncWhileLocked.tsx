/** Sync while locked: whether connected sites go on syncing once the Keychain locks. */
import { useEffect, useMemo, useState } from "react";

import { createBackgroundClient } from "../../ipc/client";
import { Choice } from "../ui/Choice";
import { Notice } from "../ui/Notice";
import { ScreenHeader } from "../ui/ScreenHeader";

export const syncWhileLockedLabel = (on: boolean): string =>
  on ? "Keep syncing" : "Stop syncing";

export const SyncWhileLocked = () => {
  const client = useMemo(() => createBackgroundClient(), []);
  const [on, setOn] = useState<boolean>();

  useEffect(() => {
    client.syncWhileLocked().then(setOn).catch(console.error);
  }, [client]);

  const choose = (value: boolean): void => {
    setOn(value);
    client.setSyncWhileLocked(value).catch((e) => {
      console.error(e);
      void client.syncWhileLocked().then(setOn);
    });
  };

  return (
    <>
      <ScreenHeader back title="Sync while locked" />
      <Notice tone="neutral" className="mt-3.5 mb-2">
        While the Keychain is locked, sites you connected can still bring your
        balance and history up to date. Sending and opening your wallet always
        need you to unlock. Stopped, syncing goes on once you unlock.
      </Notice>
      <div role="radiogroup" aria-label="Sync while locked">
        {[true, false].map((value) => (
          <Choice
            key={String(value)}
            label={syncWhileLockedLabel(value)}
            selected={on === value}
            onSelect={() => choose(value)}
          />
        ))}
      </div>
    </>
  );
};
