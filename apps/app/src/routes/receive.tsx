import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import QRCode from "react-qr-code";
import { CopyToClipboardControl } from "../components/CopyToClipboardControl";
import { FormPage } from "../components/FormPage";
import { ShieldedTransparentToggle } from "../components/ShieldedTransparentToggle";
import { qrClassName } from "../components/ui/utils";
import { useAccount } from "../hooks/useAccount";
import { useFreshAddress } from "../hooks/useAddresses";
import { useTransparentOnly } from "../hooks/useWallet";
import { SpinnerIcon } from "../icons/SpinnerIcon";
import { shortenAddress } from "../lib/utils";

export const Route = createFileRoute("/receive")({
  component: ReceiveRoute,
});

function ReceiveRoute() {
  const account = useAccount();
  const transparentOnly = useTransparentOnly();
  const [preferTransparent, setPreferTransparent] = useState(false);
  // A transparent-only account (a Trezor's) receives transparently only.
  const isTransparent = transparentOnly || preferTransparent;
  const shielded = useFreshAddress();

  const address = isTransparent ? account.transparent.address : shielded;

  return (
    <FormPage title="Receive">
      {!transparentOnly && (
        <ShieldedTransparentToggle
          label="Address type"
          isTransparent={preferTransparent}
          setIsTransparent={setPreferTransparent}
        />
      )}

      <section aria-label="Your address" className="flex flex-col gap-4">
        <div className="mx-auto w-fit flex flex-col items-center gap-3 rounded-xl border border-line bg-card p-4 pb-3">
          {address ? (
            <QRCode
              key={address}
              size={208}
              value={address}
              bgColor="transparent"
              fgColor="#000000"
              level="M"
              title={`QR code of your ${isTransparent ? "transparent" : "shielded"} address`}
              className={qrClassName}
            />
          ) : (
            <div className="size-52 grid place-items-center">
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

        <p className="px-2 text-center text-xs text-neutral-500">
          {isTransparent
            ? "Your one transparent address, for exchanges and wallets that can't pay shielded addresses. Payments to it are visible on-chain."
            : "A new address is generated each time you open this page, so payers can't link their payments to you. Earlier ones keep working."}
        </p>
      </section>
    </FormPage>
  );
}
