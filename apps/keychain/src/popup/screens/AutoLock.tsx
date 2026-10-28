/** Auto-lock: how long the computer may sit idle before the Keychain locks. */
import { useEffect, useMemo, useState } from "react";

import { createBackgroundClient } from "../../ipc/client";
import { AUTO_LOCK_CHOICES, autoLockLabel } from "../autoLock";
import { Choice } from "../ui/Choice";
import { Notice } from "../ui/Notice";
import { ScreenHeader } from "../ui/ScreenHeader";

export const AutoLock = () => {
  const client = useMemo(() => createBackgroundClient(), []);
  const [minutes, setMinutes] = useState<number>();

  useEffect(() => {
    client.autoLockMinutes().then(setMinutes).catch(console.error);
  }, [client]);

  const choose = (value: number): void => {
    setMinutes(value);
    client.setAutoLockMinutes(value).catch((e) => {
      console.error(e);
      void client.autoLockMinutes().then(setMinutes);
    });
  };

  return (
    <>
      <ScreenHeader back title="Auto-lock" />
      <Notice tone="neutral" className="mt-3.5 mb-2">
        The Keychain locks after your computer has been idle this long, and
        when your screen locks. Closing the browser always locks it.
      </Notice>
      <div role="radiogroup" aria-label="Auto-lock">
        {AUTO_LOCK_CHOICES.map((value) => (
          <Choice
            key={value}
            label={autoLockLabel(value)}
            selected={minutes === value}
            onSelect={() => choose(value)}
          />
        ))}
      </div>
    </>
  );
};
