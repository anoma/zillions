import { twMerge } from "tailwind-merge";
import { useAccount } from "../hooks/useAccount";
import { useGetKeychainAccounts } from "../hooks/useGetKeychainAccounts";
import { ArrowsLeftRight } from "../icons/ArrowsLeftRight";
import { ExitIcon } from "../icons/ExitIcon";
import { keychain } from "../lib/keychain/keychain";
import { shortenAddress } from "../lib/utils";
import { CopyToClipboardControl } from "./CopyToClipboardControl";
import { SyncIndicator } from "./SyncIndicator";
import { Tooltip } from "./Tooltip";

function AccountProfile() {
  const account = useAccount();
  return (
    <div className="relative group/tooltip">
      <div className="h-10 flex items-center gap-2 p-2">
        <span className="text-sm">{account.alias}</span>
      </div>
      <Tooltip position="bottom">
        <CopyToClipboardControl
          value={account.address}
          className="px-4 py-2 font-medium"
        >
          {shortenAddress(account.address)}
        </CopyToClipboardControl>
      </Tooltip>
    </div>
  );
}

function SwitchAccountButton() {
  const account = useAccount();
  const accounts = useGetKeychainAccounts();

  return (
    <div className="relative group/tooltip">
      <button className="h-10 p-2 hover:text-gold transition-all">
        <ArrowsLeftRight className="size-4" />
      </button>
      <Tooltip position="bottom">
        <div className="py-2 max-w-30 overflow-clip">
          {accounts.data
            ?.filter((a) => !a.parentId)
            .map((a) => {
              const isSelected = a.alias === account.alias;
              return (
                <button
                  key={a.id}
                  className={twMerge(
                    "px-4 py-2 flex items-center gap-2 text-left hover:font-semibold transition-all cursor-pointer",
                    isSelected && "font-semibold pointer-events-none",
                  )}
                  onClick={() => keychain().updateDefaultAccount(a.address)}
                >
                  {a.alias}
                </button>
              );
            })}
        </div>
      </Tooltip>
    </div>
  );
}

function DisconnectButton() {
  return (
    <button
      className="h-10 -mr-2 p-2 hover:text-gold transition-all cursor-pointer"
      onClick={() => keychain().disconnect()}
    >
      <ExitIcon className="size-4" />
    </button>
  );
}

export function AppHeader() {
  return (
    <header className="h-full flex items-center justify-end border-b border-gray-300 bg-surface px-6">
      <SyncIndicator />
      <AccountProfile />
      <SwitchAccountButton />
      <DisconnectButton />
    </header>
  );
}
