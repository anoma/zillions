/**
 * Landing step: choose Create, Import, a hardware wallet or a passkey. The
 * hardware choice opens `device.choose`, which lists the devices this
 * browser can reach; the passkey opens its connect screen's
 * create-or-import chooser.
 */
import { Alert, Heading, Stack } from "@zillions/components";
import { ZEmblem } from "@zillions/components/assets/ZEmblem";
import { useEffect, useState } from "react";
import { PiDownloadSimple, PiFingerprint, PiPlus } from "react-icons/pi";

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
  const { dispatch, client } = useWizard();
  const [lost, setLost] = useState(false);
  useEffect(() => {
    client.vaultLost().then(setLost).catch(console.error);
  }, [client]);
  // Ledger and Keystone belong to the picker behind the hardware card;
  // the passkey connects from its own card, skipping the picker.
  const hasHardware = Object.values(wallets).some(
    (wallet) => wallet.kind !== "passkey-prf" && wallet.isSupported()
  );
  const hasPasskey = wallets["passkey-prf"].isSupported();

  return (
    <div className="flex flex-col flex-1 justify-center">
      <div className="w-[320px] mx-auto mb-14 text-center">
        <ZEmblem className="w-full" />
      </div>
      <Heading level="h1" className="mb-8 text-xl text-black text-center">
        Set up your Zcash keys
      </Heading>
      {lost && (
        <Alert type="warning" title="Your wallet was removed" className="mb-6">
          The browser deleted the Keychain&apos;s data, so its accounts are
          gone from here. Your funds are safe on the chain: import your
          recovery phrase, or reconnect your passkey or hardware wallet, to get
          them back.
        </Alert>
      )}
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
        {hasPasskey && (
          <OptionCard
            more
            icon={<PiFingerprint />}
            title="Passkey"
            subtitle="Set up a secure account using a Passkey"
            data-testid="setup-passkey-button"
            onClick={() => dispatch({ type: "chooseFlow", flow: "passkey" })}
          />
        )}
        {hasHardware && (
          <OptionCard
            more
            icon={<HardwareIcon />}
            title="Hardware wallet"
            subtitle="Use a Ledger, Keystone, or Trezor device"
            data-testid="setup-hardware-wallet-button"
            onClick={() => dispatch({ type: "chooseFlow", flow: "device" })}
          />
        )}
      </Stack>
    </div>
  );
};
