import { createFileRoute } from "@tanstack/react-router";
import QRCode from "react-qr-code";
import { CopyToClipboardControl } from "../components/CopyToClipboardControl";
import { useAccount } from "../hooks/useAccount";
import { shortenAddress } from "../lib/utils";

export const Route = createFileRoute("/receive")({
  component: ReceiveRoute,
});

function ReceiveRoute() {
  const account = useAccount();

  return (
    <div className="p-10">
      <h1 className="text-center text-lg font-bold">Receive</h1>
      <div className="flex justify-center mt-10">
        <QRCode
          size={280}
          value={account.address}
          bgColor="transparent"
          fgColor="#000000"
          level="M"
        />
      </div>
      <div className="flex justify-center my-10">
        <div className="w-min mx-auto px-4 border border-gray-300 rounded-2xl">
          <CopyToClipboardControl
            value={account.address}
            className="py-2 font-medium"
          >
            {shortenAddress(account.address)}
          </CopyToClipboardControl>
        </div>
      </div>
    </div>
  );
}
