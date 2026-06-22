import { useAccount } from "../hooks/useAccount";
import { ExitIcon } from "../icons/ExitIcon";
import { keychain } from "../lib/keychain/keychain";
import { shortenAddress } from "../lib/utils";
import { CopyToClipboardControl } from "./CopyToClipboardControl";
import { Tooltip } from "./Tooltip";

export function AccountProfile() {
  const account = useAccount();

  return (
    <div className="flex items-center text-sm font-medium px-2 mr-6">
      {/* Account name and address */}
      <div className="relative group/tooltip">
        <div className="flex items-center gap-2 p-2">
          <span className="mr-1">{account.keychain.alias}</span>
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

      {/* Disconnect */}
      <button
        className="p-2 -mr-2 hover:text-gold transition-all cursor-pointer"
        onClick={() => keychain().disconnect()}
      >
        <ExitIcon className="w-5 h-5" />
      </button>
    </div>
  );
}
