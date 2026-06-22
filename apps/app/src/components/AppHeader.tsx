import { twMerge } from "tailwind-merge";
import { useAccount } from "../hooks/useAccount";
import { useKeychainAccounts } from "../hooks/useKeychainAccounts";
import { ArrowsLeftRight } from "../icons/ArrowsLeftRight";
import { ExitIcon } from "../icons/ExitIcon";
import { keychain } from "../lib/keychain/keychain";
import { shortenAddress } from "../lib/utils";
import { CopyToClipboardControl } from "./CopyToClipboardControl";
import { Tooltip } from "./Tooltip";

function AccountProfile() {
  const account = useAccount();
  return (
    <div className="relative group/tooltip">
      <div className="flex items-center gap-2 p-2">
        <span className="text-sm">{account.keychain.alias}</span>
      </div>
      <Tooltip position="left" className="z-20">
        <CopyToClipboardControl
          value={account.keychain.address}
          className="py-2 font-mono"
        >
          {shortenAddress(account.keychain.address)}
        </CopyToClipboardControl>
      </Tooltip>
    </div>
  );
}

function SwitchAccountButton() {
  const account = useAccount();
  const accounts = useKeychainAccounts();

  return (
    <div className="relative group/tooltip">
      <button className="p-2 hover:text-gold transition-all cursor-pointer">
        <ArrowsLeftRight className="w-4 h-4" />
      </button>
      <Tooltip position="bottom" className="z-20">
        <div className="my-2 w-20">
          {accounts.data
            ?.filter((a) => !a.parentId)
            .map((a) => {
              const isSelected = a.alias === account.keychain.alias;
              return (
                <button
                  key={a.id}
                  className={twMerge(
                    "p-2 -mx-2 flex items-center gap-1.5 text-left hover:font-semibold transition-all cursor-pointer",
                    isSelected && "font-semibold pointer-events-none",
                  )}
                  onClick={() =>
                    keychain().updateDefaultAccount(account.keychain.address)
                  }
                >
                  <div
                    className={twMerge(
                      "w-3 h-3 rounded-full",
                      isSelected ? "bg-gold" : "border border-gray-500",
                    )}
                  />
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
      className="-mr-2 p-2 hover:text-gold transition-all cursor-pointer"
      onClick={() => keychain().disconnect()}
    >
      <ExitIcon className="w-4 h-4" />
    </button>
  );
}

export function AppHeader() {
  return (
    <header className="h-full flex items-center justify-end border-b border-gray-300 bg-surface px-6">
      <AccountProfile />
      <SwitchAccountButton />
      <DisconnectButton />
    </header>
  );
}
