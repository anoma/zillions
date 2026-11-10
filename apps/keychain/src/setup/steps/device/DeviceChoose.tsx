/**
 * Device branch, first step: pick which hardware wallet to connect. Only
 * the devices this browser can reach are offered; the passkey connects
 * from its own Start card and never reaches this picker.
 */
import { Stack } from "@zillions/components";
import { PiQrCode, PiUsb } from "react-icons/pi";

import type { DeviceKind } from "../../../ipc/contract";
import { wallets } from "../../../hardware";
import { useWizard } from "../../SetupContext";
import { OptionCard } from "../../ui/OptionCard";

/** Hardware only: "passkey-prf" is a top-level Start choice. */
const OPTIONS: Record<
  Exclude<DeviceKind, "passkey-prf">,
  { icon: React.ReactNode; subtitle: string }
> = {
  keystone: { icon: <PiQrCode />, subtitle: "Connect by scanning QR codes" },
  ledger: { icon: <PiUsb />, subtitle: "Connect over USB" },
};

export const DeviceChoose = () => {
  const { dispatch } = useWizard();

  return (
    <Stack as="div" direction="vertical" gap={2.5} className="mt-4">
      {(Object.keys(OPTIONS) as Exclude<DeviceKind, "passkey-prf">[])
        .filter((kind) => wallets[kind].isSupported())
        .map((kind) => (
          <OptionCard
            key={kind}
            more
            icon={OPTIONS[kind].icon}
            title={wallets[kind].name}
            subtitle={OPTIONS[kind].subtitle}
            data-testid={`setup-connect-${kind}-button`}
            onClick={() =>
              dispatch({ type: "chooseDevice", device: kind })
            }
          />
        ))}
    </Stack>
  );
};
