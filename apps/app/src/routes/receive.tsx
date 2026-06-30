import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import QRCode from "react-qr-code";
import { CopyToClipboardControl } from "../components/CopyToClipboardControl";
import { ShieldedTransparentToggle } from "../components/ShieldedTransparentToggle";
import { useAccount } from "../hooks/useAccount";

export const Route = createFileRoute("/receive")({
  component: ReceiveRoute,
});

function ReceiveRoute() {
  const account = useAccount();
  const [isTransparent, setIsTransparent] = useState(false);

  const address = isTransparent
    ? account.transparent.address
    : account.shielded.address;

  return (
    <div className="p-10 w-full max-w-120 mx-auto">
      <h1 className="text-center text-lg font-bold">Receive</h1>
      <div className="mt-10">
        <ShieldedTransparentToggle
          isTransparent={isTransparent}
          setIsTransparent={setIsTransparent}
        />
      </div>
      <div className="flex justify-center mt-6">
        <QRCode
          size={320}
          value={address}
          bgColor="transparent"
          fgColor="#000000"
          level="M"
        />
      </div>
      <div className="mt-6">
        <CopyToClipboardControl
          value={address}
          className="mx-auto w-fit px-4 py-2 border border-gray-300 rounded-2xl text-sm font-medium wrap-anywhere"
        >
          <div>{address}</div>
        </CopyToClipboardControl>
      </div>
    </div>
  );
}
