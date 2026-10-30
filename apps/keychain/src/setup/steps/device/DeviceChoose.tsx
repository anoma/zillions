/**
 * Device branch, first step: pick which hardware wallet to connect. Only the
 * devices this browser can reach are offered.
 */
import { Stack } from "@zillions/components";
import { PiQrCode, PiUsb } from "react-icons/pi";

import type { DeviceKind } from "../../../ipc/contract";
import { wallets } from "../../../hardware";
import { useWizard } from "../../SetupContext";
import { OptionCard } from "../../ui/OptionCard";

const OPTIONS: Record<DeviceKind, { icon: React.ReactNode; subtitle: string }> =
  {
    ledger: { icon: <PiUsb />, subtitle: "Connect over USB" },
    keystone: { icon: <PiQrCode />, subtitle: "Connect by scanning QR codes" },
  };

export const DeviceChoose = () => {
  const { dispatch } = useWizard();

  return (
    <Stack as="div" direction="vertical" gap={2.5} className="mt-4">
      {Object.values(wallets)
        .filter((wallet) => wallet.isSupported())
        .map((wallet) => (
          <OptionCard
            key={wallet.kind}
            more
            icon={OPTIONS[wallet.kind].icon}
            title={wallet.name}
            subtitle={OPTIONS[wallet.kind].subtitle}
            data-testid={`setup-connect-${wallet.kind}-button`}
            onClick={() =>
              dispatch({ type: "chooseDevice", device: wallet.kind })
            }
          />
        ))}
    </Stack>
  );
};
