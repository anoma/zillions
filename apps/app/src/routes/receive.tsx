import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import QRCode from "react-qr-code";
import { CopyToClipboardControl } from "../components/CopyToClipboardControl";
import { FormPage } from "../components/FormPage";
import { ShieldedTransparentToggle } from "../components/ShieldedTransparentToggle";
import { FormCard } from "../components/TransferForm";
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
    <FormPage title="Receive">
      <FormCard heading="Address type">
        <ShieldedTransparentToggle
          label="Address type"
          isTransparent={isTransparent}
          setIsTransparent={setIsTransparent}
        />
      </FormCard>

      <FormCard heading="Your address" className="gap-5">
        <div className="mx-auto p-4 rounded-xl border border-line bg-card">
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
            className="justify-between gap-4 px-4 py-3 rounded-xl border border-line bg-card transition-colors duration-300 hover:border-line-strong"
          >
            <span className="text-sm font-medium wrap-anywhere">{address}</span>
          </CopyToClipboardControl>
        )}

        <p className="-mt-2 text-xs text-gray-600">
          {isTransparent
            ? "Your one transparent address, for exchanges and wallets that can't pay shielded addresses. Payments to it are visible on-chain."
            : "A new address each time you open this page, so payers can't link their payments to you. Earlier ones keep working."}
        </p>
      </FormCard>
    </FormPage>
  );
}
