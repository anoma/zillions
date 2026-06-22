import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { AccountContext } from "../context/account";
import { useKeychainAccounts } from "../hooks/useKeychainAccounts";
import { useKeychainDefaultAccount } from "../hooks/useKeychainDefaultAccount";
import {
  isKeychainAvailable,
  keychain,
  KeychainEvent,
} from "../lib/keychain/keychain";
import { keychainUrl } from "../lib/urls";
import { ActionButton } from "./ActionButton";
import { PageError } from "./PageError";
import { PageLoader } from "./PageLoader";
import { SmartLink } from "./SmartLink";

function Content({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-5 items-center justify-center h-svh">
      <div className="text-3xl">{title}</div>
      {children}
    </div>
  );
}

function Account({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const accounts = useKeychainAccounts();
  const defaultAccount = useKeychainDefaultAccount();

  useEffect(() => {
    const onAccountChanged = async () => {
      queryClient.invalidateQueries({ queryKey: ["useKeychainAccounts"] });
      queryClient.invalidateQueries({
        queryKey: ["useKeychainDefaultAccount"],
      });
    };
    window.addEventListener(KeychainEvent.AccountChanged, onAccountChanged);
    return () => {
      window.removeEventListener(
        KeychainEvent.AccountChanged,
        onAccountChanged,
      );
    };
  }, []);

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
      <Content title="Create account">
        Open the keychain and create a new account.
      </Content>
    );
  }

  const keychainAccount = accounts.data?.find(
    (a) => a.parentId === defaultAccount.data?.id,
  );

  if (!keychainAccount) {
    return (
      <Content title="Select account">
        Open the keychain and select one account.
      </Content>
    );
  }

  return (
    <AccountContext.Provider value={keychainAccount}>
      {children}
    </AccountContext.Provider>
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
      } catch (error) {
        setError(String(error));
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
      <Content title="Connect Keychain">
        <ActionButton
          onClick={async () => {
            await keychain().connect();
            setIsConnected(await keychain().isConnected());
          }}
        >
          Connect
        </ActionButton>
      </Content>
    );
  }

  return <>{children}</>;
}

function Download({ children }: { children: ReactNode }) {
  if (!isKeychainAvailable()) {
    return (
      <Content title="Keychain not installed">
        <SmartLink href={keychainUrl}>
          <ActionButton>Download Keychain</ActionButton>
        </SmartLink>
      </Content>
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
