import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { type Account } from "../context/account";
import {
  getKeychainAccounts,
  useGetKeychainAccounts,
} from "../hooks/useGetKeychainAccounts";
import {
  getKeychainDefaultAccount,
  useGetKeychainDefaultAccount,
} from "../hooks/useGetKeychainDefaultAccount";
import {
  isKeychainAvailable,
  isKeychainVersionSupported,
  keychain,
  KeychainEvent,
  MIN_KEYCHAIN_VERSION,
} from "../lib/keychain/keychain";
import { keychainUrl } from "../lib/urls";
import { AccountProvider } from "./AccountProvider";
import { FinalStatePage } from "./FinalStatePage";
import { PageError } from "./PageError";
import { PageLoader } from "./PageLoader";
import { ActionButton } from "./ui/ActionButton";

function Account({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const accounts = useGetKeychainAccounts();
  const defaultAccount = useGetKeychainDefaultAccount();

  useEffect(() => {
    const onAccountChanged = async () => {
      queryClient.invalidateQueries({
        queryKey: getKeychainAccounts().queryKey,
      });
      queryClient.invalidateQueries({
        queryKey: getKeychainDefaultAccount().queryKey,
      });
    };
    window.addEventListener(KeychainEvent.AccountChanged, onAccountChanged);
    return () => {
      window.removeEventListener(
        KeychainEvent.AccountChanged,
        onAccountChanged,
      );
    };
  }, [queryClient]);

  if (accounts.isPending || defaultAccount.isPending) {
    return <PageLoader />;
  }

  if (accounts.error || defaultAccount.error) {
    return (
      <PageError>{String(accounts.error || defaultAccount.error)}</PageError>
    );
  }

  if (!accounts.data.length) {
    return (
      <FinalStatePage title="Create account">
        Open the keychain and create a new account.
      </FinalStatePage>
    );
  }

  const transparentAccount = defaultAccount.data;
  const shieldedAccount = accounts.data?.find(
    (a) => a.parentId === transparentAccount?.id,
  );

  if (!transparentAccount || !shieldedAccount) {
    return (
      <FinalStatePage title="Select account">
        Open the keychain and select one account.
      </FinalStatePage>
    );
  }

  return (
    <AccountProvider
      transparentAccount={transparentAccount}
      shieldedAccount={shieldedAccount}
    >
      {children}
    </AccountProvider>
  );
}

function Connect({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isConnected, setIsConnected] = useState<boolean | undefined>(
    undefined,
  );

  useEffect(() => {
    (async () => {
      try {
        setIsConnected(await keychain().isConnected());
      } catch (err) {
        console.error(err);
        setError(String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    const onRevoke = () => setIsConnected(false);
    window.addEventListener(KeychainEvent.ConnectionRevoked, onRevoke);
    return () => {
      window.removeEventListener(KeychainEvent.ConnectionRevoked, onRevoke);
    };
  }, []);

  if (loading) {
    return <PageLoader />;
  }

  if (error) {
    return <PageError>{error}</PageError>;
  }

  if (!isConnected) {
    return (
      <FinalStatePage title="Connect Keychain">
        <ActionButton
          onClick={async () => {
            await keychain().connect();
            setIsConnected(await keychain().isConnected());
          }}
        >
          Connect
        </ActionButton>
      </FinalStatePage>
    );
  }

  return <>{children}</>;
}

function Download({ children }: { children: ReactNode }) {
  if (!isKeychainAvailable()) {
    return (
      <FinalStatePage title="Keychain not installed">
        <a download href={keychainUrl}>
          <ActionButton>Download Keychain</ActionButton>
        </a>
      </FinalStatePage>
    );
  }

  if (!isKeychainVersionSupported()) {
    return (
      <FinalStatePage title="Keychain outdated">
        <div>
          Version {MIN_KEYCHAIN_VERSION} or newer is required.
          <br />
          Download the latest keychain and reinstall it.
        </div>
        <a download href={keychainUrl}>
          <ActionButton>Download Keychain</ActionButton>
        </a>
      </FinalStatePage>
    );
  }

  return <>{children}</>;
}

export function KeychainWall({ children }: { children: ReactNode }) {
  return (
    <Download>
      <Connect>
        <Account>{children}</Account>
      </Connect>
    </Download>
  );
}
