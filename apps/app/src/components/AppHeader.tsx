import { useState } from "react";
import { twMerge } from "tailwind-merge";
import { useAccount } from "../hooks/useAccount";
import { useFreshAddress } from "../hooks/useAddresses";
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
  // Rotated once the tooltip closes, so it never changes while it's read.
  const [shown, setShown] = useState(0);
  const shielded = useFreshAddress(shown) ?? "";
  return (
    <div
      className="relative group/tooltip"
      onMouseLeave={() => setShown((n) => n + 1)}
    >
      <div className="h-10 flex items-center gap-2 p-2">
        <span className="text-sm">{account.transparent.alias}</span>
      </div>
      <Tooltip position="bottom">
        <div className="p-4 space-y-3 w-55">
          {[
            ["Shielded address", shielded],
            ["Transparent address", account.transparent.address],
          ].map(([label, value]) => (
            <CopyToClipboardControl
              key={value}
              value={value}
              className="justify-between"
            >
              <div>
                <div className="text-xs">{label}:</div>
                <div className="font-semibold">{shortenAddress(value)}</div>
              </div>
            </CopyToClipboardControl>
          ))}
        </div>
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
        <div className="py-2 w-30 overflow-clip">
          {accounts.data
            ?.filter((a) => !a.parentId)
            .map((a) => {
              const isSelected = a.id === account.transparent.id;
              return (
                <button
                  key={a.id}
                  className={twMerge(
                    "px-4 py-1.5 w-full flex items-center gap-2 text-left hover:font-semibold transition-all cursor-pointer",
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
