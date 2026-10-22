import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { GoCheck } from "react-icons/go";
import { twMerge } from "tailwind-merge";
import { hasViewingKeys, type Account } from "../context/account";
import {
  getKeychainAccounts,
  useGetKeychainAccounts,
} from "../hooks/useGetKeychainAccounts";
import {
  getKeychainDefaultAccount,
  useGetKeychainDefaultAccount,
} from "../hooks/useGetKeychainDefaultAccount";
import { ExternalLinkIcon } from "../icons/ExternalLinkIcon";
import {
  isKeychainAvailable,
  isKeychainVersionSupported,
  keychain,
  KeychainEvent,
  MIN_KEYCHAIN_VERSION,
} from "../lib/keychain/keychain";
import { extensionUrl } from "../lib/urls";
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

  if (!hasViewingKeys(shieldedAccount)) {
    // After a switch the two queries refetch separately, and an account list
    // from before the switch carries no keys for the new account.
    if (accounts.isFetching || defaultAccount.isFetching) {
      return <PageLoader />;
    }
    return (
      <PageError>
        The keychain did not share this account's viewing key
      </PageError>
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
      <Setup
        installed
        onConnect={async () => {
          await keychain().connect();
          setIsConnected(await keychain().isConnected());
        }}
      />
    );
  }

  return <>{children}</>;
}

function Download({ children }: { children: ReactNode }) {
  if (!isKeychainAvailable()) {
    return <Setup installed={false} />;
  }

  if (!isKeychainVersionSupported()) {
    return (
      <FinalStatePage title="Keychain outdated">
        <div>
          Version {MIN_KEYCHAIN_VERSION} or newer is required.
          <br />
          Install the latest Keychain to continue.
        </div>
        <GetExtensionButton>Get the latest Keychain</GetExtensionButton>
      </FinalStatePage>
    );
  }

  return <>{children}</>;
}

function GetExtensionButton({ children }: { children: ReactNode }) {
  return (
    <ActionButton
      href={extensionUrl}
      target="_blank"
      rel="noreferrer"
      size="sm"
      icon={<ExternalLinkIcon className="size-4" />}
      iconPosition="right"
      className="pr-11"
    >
      {children}
    </ActionButton>
  );
}

function SetupStep({
  number,
  title,
  status,
  children,
}: {
  number: number;
  title: string;
  status: "done" | "current" | "upcoming";
  children: ReactNode;
}) {
  return (
    <li
      aria-current={status === "current" ? "step" : undefined}
      className="flex gap-5 py-7 border-b border-line-strong"
    >
      <span
        className={twMerge(
          "size-8 shrink-0 flex items-center justify-center rounded-full border text-sm font-medium",
          status === "done" && "border-gold bg-gold",
          status === "current" && "border-black",
          status === "upcoming" && "border-line-strong text-gray-400",
        )}
      >
        {status === "done" ? <GoCheck className="size-4" /> : number}
      </span>
      <div
        className={twMerge(
          "flex-1 pt-1",
          status === "upcoming" && "text-gray-400",
        )}
      >
        <div className="font-medium">{title}</div>
        <div
          className={twMerge(
            "mt-1 text-sm",
            status !== "upcoming" && "text-gray-600",
          )}
        >
          {children}
        </div>
      </div>
    </li>
  );
}

function Setup({
  installed,
  onConnect,
}: {
  installed: boolean;
  onConnect?: () => Promise<void>;
}) {
  return (
    <div className="absolute inset-0 overflow-auto flex px-6 py-12">
      <div className="m-auto w-full max-w-md animate-fade-in">
        <h1 className="text-3xl">Connect Keychain</h1>
        <p className="mt-3 text-gray-600">
          Zillions signs with the Zillions Keychain, a browser extension that
          holds your keys. They never leave it.
        </p>
        <ol className="mt-10 border-t border-line-strong">
          <SetupStep
            number={1}
            title="Install the extension"
            status={installed ? "done" : "current"}
          >
            {installed ? (
              "Zillions Keychain is installed."
            ) : (
              <>
                Add Zillions Keychain to your browser, then reload this page.
                <div className="mt-5">
                  <GetExtensionButton>Get the extension</GetExtensionButton>
                </div>
              </>
            )}
          </SetupStep>
          <SetupStep
            number={2}
            title="Connect"
            status={installed ? "current" : "upcoming"}
          >
            Approve the connection in the Keychain window.
            {onConnect && (
              <div className="mt-5">
                <ActionButton size="sm" onClick={onConnect}>
                  Connect
                </ActionButton>
              </div>
            )}
          </SetupStep>
        </ol>
      </div>
    </div>
  );
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
