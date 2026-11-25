import { GoPerson } from "react-icons/go";
import { useAccount } from "../../hooks/useAccount";
import { useGetBalance } from "../../hooks/useGetBalance";
import { ArrowsLeftRight } from "../../icons/ArrowsLeftRight";
import { keychain } from "../../lib/keychain/keychain";
import { ZecValue } from "../ZecValue";

export function AccountSwitcher() {
  const account = useAccount();
  const balance = useGetBalance();
  const total =
    balance.data &&
    balance.data.shielded.balance + balance.data.transparent.balance;

  return (
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
        onClick={() => keychain().switchAccount()}
      >
        <ArrowsLeftRight className="size-3.5" />
        Switch
      </button>
    </div>
  );
}
