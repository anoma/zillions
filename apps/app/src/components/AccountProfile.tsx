import { useAccount } from "../hooks/useAccount";
import { shortenAddress } from "../lib/utils";
import { CopyToClipboardControl } from "./CopyToClipboardControl";
import { Tooltip } from "./Tooltip";

export function AccountProfile() {
  const account = useAccount();

  return (
    <div className="relative group/tooltip">
      <div className="flex items-center gap-2 px-6">
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
  );
}
