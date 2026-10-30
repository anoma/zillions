/**
 * Landing step: choose Create, Import or a hardware wallet. The hardware
 * choice opens `device.choose`, which lists the devices this browser can reach.
 */
import { Heading, Stack } from "@zillions/components";
import { ZEmblem } from "@zillions/components/assets/ZEmblem";
import { PiDownloadSimple, PiPlus } from "react-icons/pi";

import { wallets } from "../../hardware";
import { useWizard } from "../SetupContext";
import { OptionCard } from "../ui/OptionCard";

/** A scan frame (Keystone's QR) beside slanted bars (a device). */
const HardwareIcon = () => (
  <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
    <path
      d="M1.5 6V1.5H6M10 1.5h4.5V6M1.5 10v4.5H6M6 6v4h4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    <path d="M13 13h4.5l-3 9H10zM19 13h4.5l-3 9H16z" fill="currentColor" />
  </svg>
);

export const Start = () => {
  const { dispatch } = useWizard();
  const hasDevice = Object.values(wallets).some((wallet) =>
    wallet.isSupported()
  );

  return (
    <div className="flex flex-col flex-1 justify-center">
      <div className="w-[320px] mx-auto mb-14 text-center">
        <ZEmblem className="w-full" />
      </div>
      <Heading level="h1" className="mb-8 text-xl text-black text-center">
        Set up your Zcash keys
      </Heading>
      <Stack as="div" direction="vertical" gap={2.5}>
        <OptionCard
          icon={<PiPlus />}
          title="Create new keys"
          subtitle="Set up a new Zcash wallet"
          data-testid="setup-create-keys-button"
          onClick={() => dispatch({ type: "chooseFlow", flow: "create" })}
        />
        <OptionCard
          icon={<PiDownloadSimple />}
          title="Import existing keys"
          subtitle="Restore your wallet from a recovery phrase or key"
          data-testid="setup-import-keys-button"
          onClick={() => dispatch({ type: "chooseFlow", flow: "import" })}
        />
        {hasDevice && (
          <OptionCard
            more
            icon={<HardwareIcon />}
            title="Hardware wallet"
            subtitle="Use a Ledger or Keystone (Cypherpunk)"
            data-testid="setup-hardware-wallet-button"
            onClick={() => dispatch({ type: "chooseFlow", flow: "device" })}
          />
        )}
      </Stack>
    </div>
  );
};
