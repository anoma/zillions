/**
 * VaultContext: vault lock state for the popup, over the typed BackgroundClient.
 *
 * Resolves the lock snapshot (`vault/lockState`) once on mount, then exposes
 * `unlock`/`lock` and a password re-check.
 */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";

import type { BackgroundClient } from "../../ipc/client";
import type { ResetPasswordResult } from "../../ipc/contract";

export type LockStatus = "pending" | "locked" | "unlocked";

type VaultContextValue = {
  lockStatus: LockStatus;
  /** `undefined` until the first lock-state resolve completes. */
  passwordInitialized: boolean | undefined;
  unlock: (password: string) => Promise<boolean>;
  lock: () => Promise<void>;
  /** Re-verify the password without changing lock state (sensitive-action gate). */
  checkPassword: (password: string) => Promise<boolean>;
  /** Re-encrypt the vault under a new password (vault stays unlocked). */
  changePassword: (
    oldPassword: string,
    newPassword: string
  ) => Promise<ResetPasswordResult>;
};

const VaultContext = createContext<VaultContextValue | null>(null);

export const useVault = (): VaultContextValue => {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault must be used within <VaultProvider>");
  return ctx;
};

type ProviderProps = PropsWithChildren<{ client: BackgroundClient }>;

export const VaultProvider = ({
  client,
  children,
}: ProviderProps): JSX.Element => {
  const [lockStatus, setLockStatus] = useState<LockStatus>("pending");
  const [passwordInitialized, setPasswordInitialized] = useState<
    boolean | undefined
  >(undefined);

  useEffect(() => {
    let cancelled = false;
    void client
      .lockState()
      .then(({ passwordInitialized, isLocked }) => {
        if (cancelled) return;
        setPasswordInitialized(passwordInitialized);
        setLockStatus(isLocked ? "locked" : "unlocked");
      })
      .catch(() => {
        // Treat a failed snapshot as "locked, no wallet" — the safe default.
        if (cancelled) return;
        setPasswordInitialized(false);
        setLockStatus("locked");
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const unlock = async (password: string): Promise<boolean> => {
    const unlocked = await client.unlock(password);
    if (unlocked) setLockStatus("unlocked");
    return unlocked;
  };

  const lock = async (): Promise<void> => {
    await client.lock();
    setLockStatus("locked");
  };

  const checkPassword = (password: string): Promise<boolean> =>
    client.checkPassword(password);

  const changePassword = (
    oldPassword: string,
    newPassword: string
  ): Promise<ResetPasswordResult> =>
    client.resetPassword(oldPassword, newPassword);

  return (
    <VaultContext.Provider
      value={{
        lockStatus,
        passwordInitialized,
        unlock,
        lock,
        checkPassword,
        changePassword,
      }}
    >
      {children}
    </VaultContext.Provider>
  );
};
