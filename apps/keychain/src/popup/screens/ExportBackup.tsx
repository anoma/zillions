/**
 * Export every account, secrets included, as a file encrypted with the
 * extension password. Restored from the Setup tab's import step.
 */
import { useMemo, useState } from "react";

import { createBackgroundClient } from "../../ipc/client";
import { Button } from "../ui/Button";
import { Notice } from "../ui/Notice";
import { PasswordGate } from "../ui/PasswordGate";
import { ScreenHeader } from "../ui/ScreenHeader";
import { useBack } from "../ui/useBack";

const download = (name: string, contents: string): void => {
  const url = URL.createObjectURL(
    new Blob([contents], { type: "application/json" })
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  // Revoking right away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};

export const ExportBackup = () => {
  const back = useBack();
  const client = useMemo(() => createBackgroundClient(), []);
  const [fileName, setFileName] = useState<string>();

  const onVerified = async (password: string): Promise<void> => {
    const file = await client.exportBackup(password);
    const name = `zillions-backup-${new Date().toISOString().slice(0, 10)}.json`;
    download(name, file);
    setFileName(name);
  };

  return (
    <>
      <ScreenHeader back title="Export backup" />
      {fileName === undefined ? (
        <PasswordGate
          what="the backup"
          submitLabel="Download backup"
          notice={
            <Notice title="Keep it with your password" className="mt-3.5">
              The file holds every account&apos;s recovery phrase, encrypted
              with your current password. You&apos;ll need that password to
              restore it, and anyone with both controls your accounts.
            </Notice>
          }
          onVerified={onVerified}
        />
      ) : (
        <>
          <Notice tone="neutral" title="Backup downloaded" className="mt-3.5">
            Saved as {fileName}. To restore it, choose Add account, then
            Import existing keys.
          </Notice>
          <div className="mt-auto pt-4 pb-5">
            <Button block onClick={back}>
              Done
            </Button>
          </div>
        </>
      )}
    </>
  );
};
