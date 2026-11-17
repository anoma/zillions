import { useState } from "react";
import QRCode from "react-qr-code";
import { useAccount } from "../../hooks/useAccount";
import { useFreshAddress } from "../../hooks/useAddresses";
import { useTransparentOnly } from "../../hooks/useWallet";
import { SpinnerIcon } from "../../icons/SpinnerIcon";
import { shortenAddress } from "../../lib/utils";
import { CopyToClipboardControl } from "../CopyToClipboardControl";
import { ShieldedTransparentToggle } from "../ShieldedTransparentToggle";
import { qrClassName } from "../ui/utils";

export function AddressCard() {
  const account = useAccount();
  const transparentOnly = useTransparentOnly();
  const [preferTransparent, setPreferTransparent] = useState(false);
  // A transparent-only account (a Trezor's) receives transparently only.
  const isTransparent = transparentOnly || preferTransparent;
  // Mounted per drawer open, so each open shows a fresh shielded address.
  const shielded = useFreshAddress();
  const address = isTransparent ? account.transparent.address : shielded;

  return (
    <section aria-label="Your address" className="space-y-4">
      <h3 className="mb-2 text-center text-xs text-neutral-500">
        Your address
      </h3>
      {!transparentOnly && (
        <ShieldedTransparentToggle
          label="Address type"
          isTransparent={preferTransparent}
          setIsTransparent={setPreferTransparent}
        />
      )}
      <div className="mx-auto w-fit flex flex-col items-center gap-3 rounded-xl border border-line bg-card p-4 pb-3">
        {address ? (
          <QRCode
            key={address}
            size={176}
            value={address}
            bgColor="transparent"
            fgColor="#000000"
            level="M"
            title={`QR code of your ${isTransparent ? "transparent" : "shielded"} address`}
            className={qrClassName}
          />
        ) : (
          <div className="size-44 grid place-items-center">
            <SpinnerIcon className="size-5 text-gold" />
          </div>
        )}
        {address && (
          <CopyToClipboardControl
            value={address}
            className="gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors duration-300 hover:bg-gold/15"
            iconClassName="size-3.5"
          >
            <span className="font-mono text-neutral-700">
              {shortenAddress(address, 8, 6, "…")}
            </span>
          </CopyToClipboardControl>
        )}
      </div>
      {!isTransparent && (
        <p className="px-2 text-center text-xs text-neutral-500">
          A new shielded address is shown each time you open this panel, so
          payers can't link their payments to you. Earlier ones keep working.
        </p>
      )}
    </section>
  );
}
