import { useEffect, useState, type ReactNode } from "react";
import {
  isKeychainAvailable,
  keychain,
  KeychainEvent,
  type KeychainAccount,
} from "../lib/keychain/keychain";
import { keychainUrl } from "../lib/urls";
import { AccountProvider } from "./AccountProvider";
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [keychainAccount, setKeychainAccount] = useState<KeychainAccount>();

  useEffect(() => {
    const onAccountChanged = async () => {
      try {
        const accounts = await keychain().accounts();
        const selected = await keychain().defaultAccount();
        if (selected) {
          const shielded = accounts?.find((a) => a.parentId === selected.id);
          setKeychainAccount(shielded);
        } else {
          setKeychainAccount(undefined);
        }
      } catch (error) {
        setError(String(error));
      } finally {
        setLoading(false);
      }
    };

    window.addEventListener(KeychainEvent.AccountChanged, onAccountChanged);
    onAccountChanged();

    return () => {
      window.removeEventListener(
        KeychainEvent.AccountChanged,
        onAccountChanged,
      );
    };
  }, []);

  if (loading) {
    return <PageLoader />;
  }

  if (error) {
    return <PageError>{error}</PageError>;
  }

  if (!keychainAccount) {
    return (
      <Content title="Create account">
        Open the keychain and create a new account.
      </Content>
    );
  }

  return (
    <AccountProvider keychainAccount={keychainAccount}>
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
