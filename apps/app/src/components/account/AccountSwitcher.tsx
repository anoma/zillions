import { useState } from "react";
import { GoCheck, GoPerson } from "react-icons/go";
import { twMerge } from "tailwind-merge";
import { useAccount } from "../../hooks/useAccount";
import { useGetBalance } from "../../hooks/useGetBalance";
import { useGetKeychainAccounts } from "../../hooks/useGetKeychainAccounts";
import { ArrowsLeftRight } from "../../icons/ArrowsLeftRight";
import { keychain } from "../../lib/keychain/keychain";
import { shortenAddress } from "../../lib/utils";
import { ZecValue } from "../ZecValue";

export function AccountSwitcher() {
  const account = useAccount();
  const accounts = useGetKeychainAccounts();
  const balance = useGetBalance();
  const [open, setOpen] = useState(false);
  const total =
    balance.data &&
    balance.data.shielded.balance + balance.data.transparent.balance;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="size-10 shrink-0 grid place-items-center rounded-full border border-current">
          <GoPerson className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold tracking-tight leading-tight truncate">
            {account.transparent.alias}
          </h2>
          <div className="h-4 text-xs text-neutral-500">
            {total !== undefined && <ZecValue zat={total} />}
          </div>
        </div>
        <button
          className="shrink-0 flex items-center gap-1.5 py-1 px-3 rounded-full border border-line-strong text-xs font-medium text-neutral-600 transition-colors duration-300 hover:border-transparent hover:bg-gold/15 hover:text-black cursor-pointer"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <ArrowsLeftRight className="size-3.5" />
          Switch
        </button>
      </div>
      {open && (
        <ul className="rounded-xl border border-line bg-card divide-y divide-line overflow-clip motion-safe:animate-fade-in">
          {accounts.data
            ?.filter((a) => !a.parentId)
            .map((a) => {
              const isSelected = a.id === account.transparent.id;
              return (
                <li key={a.id}>
                  <button
                    className={twMerge(
                      "w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors duration-300 hover:bg-black/5 cursor-pointer",
                      isSelected && "pointer-events-none",
                    )}
                    aria-current={isSelected}
                    onClick={() => {
                      keychain().updateDefaultAccount(a.address);
                      setOpen(false);
                    }}
                  >
                    <span className="min-w-0">
                      <span
                        className={twMerge(
                          "block text-sm truncate",
                          isSelected && "font-semibold",
                        )}
                      >
                        {a.alias}
                      </span>
                      <span className="block text-xs text-neutral-500">
                        {shortenAddress(a.address, 8, 6, "…")}
                      </span>
                    </span>
                    {isSelected && (
                      <GoCheck className="size-4 shrink-0 text-gold" />
                    )}
                  </button>
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}
