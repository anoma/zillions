import { useEffect, useState, type ReactNode } from "react";
import { keychain, KeychainEvent } from "../lib/keychain";
import { keychainUrl } from "../lib/urls";
import { ActionButton } from "./ActionButton";
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

function Connect({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    (async () => {
      setIsConnected(await keychain().isConnected());
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    const onRevoke = () => {
      setIsConnected(false);
    };
    window.addEventListener(KeychainEvent.ConnectionRevoked, onRevoke);
    return () => {
      window.removeEventListener(KeychainEvent.ConnectionRevoked, onRevoke);
    };
  }, []);

  if (loading) {
    return <PageLoader />;
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
  if (!window.zc) {
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
      <Connect>{children}</Connect>
    </Download>
  );
}
