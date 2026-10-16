import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import QRCode from "react-qr-code";
import { twMerge } from "tailwind-merge";
import { CopyToClipboardControl } from "../components/CopyToClipboardControl";
import { PageShell } from "../components/PageShell";
import { ShieldedTransparentToggle } from "../components/ShieldedTransparentToggle";
import { cardClassName, sectionLabelClassName } from "../components/ui/utils";
import { useAccount } from "../hooks/useAccount";
import { useFreshAddress } from "../hooks/useAddresses";
import { SpinnerIcon } from "../icons/SpinnerIcon";

export const Route = createFileRoute("/receive")({
  component: ReceiveRoute,
});

function ReceiveRoute() {
  const account = useAccount();
  const [isTransparent, setIsTransparent] = useState(false);
  const shielded = useFreshAddress();

  const address = isTransparent ? account.transparent.address : shielded;

  return (
    <PageShell title="Receive">
      <section
        aria-labelledby="receive-address"
        className={twMerge(cardClassName, "mt-8 gap-5")}
      >
        <div className="flex flex-col gap-3">
          <h2 id="receive-address" className={sectionLabelClassName}>
            Your address
          </h2>
          <ShieldedTransparentToggle
            label="Address type"
            isTransparent={isTransparent}
            setIsTransparent={setIsTransparent}
          />
        </div>

        <div className="mx-auto p-4 rounded-xl border border-line bg-white">
          {address ? (
            <QRCode
              key={address}
              size={208}
              value={address}
              bgColor="transparent"
              fgColor="#000000"
              level="M"
              title={`QR code of your ${isTransparent ? "transparent" : "shielded"} address`}
              className="motion-safe:animate-fade-in"
            />
          ) : (
            <div className="size-52 grid place-items-center">
              <SpinnerIcon className="size-5 text-gold" />
            </div>
          )}
        </div>

        {address && (
          <CopyToClipboardControl
            value={address}
            className="justify-between gap-4 px-4 py-3 rounded-xl border border-line bg-white transition-colors duration-300 hover:border-line-strong"
          >
            <span className="text-sm font-medium wrap-anywhere">{address}</span>
          </CopyToClipboardControl>
        )}

        <p className="-mt-2 text-xs text-gray-600">
          {isTransparent
            ? "Your one transparent address, for exchanges and wallets that can't pay shielded addresses. Payments to it are visible on-chain."
            : "A new address each time you open this page, so payers can't link their payments to you. Earlier ones keep working."}
        </p>
      </section>
    </PageShell>
  );
}
