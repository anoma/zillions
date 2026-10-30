/**
 * Landing step: choose Create, Import or Connect a hardware wallet. The
 * devices listed are those this browser can reach; picking one starts its
 * Connect view in the `device.connect` step.
 */
import { ActionButton, Stack } from "@zillions/components";
import { ZEmblem } from "@zillions/components/assets/ZEmblem";

import { wallets } from "../../hardware";
import { useWizard } from "../SetupContext";

export const Start = () => {
  const { dispatch } = useWizard();

  return (
    <div className="flex flex-col flex-1 justify-center">
      <div className="w-[320px] mx-auto mb-18 text-center">
        <ZEmblem className="w-full" />
      </div>
      <Stack as="div" direction="vertical" gap={2}>
        <ActionButton
          size="lg"
          backgroundHoverColor="black"
          textHoverColor="primary"
          data-testid="setup-create-keys-button"
          onClick={() => dispatch({ type: "chooseFlow", flow: "create" })}
        >
          Create new keys
        </ActionButton>
        <ActionButton
          size="lg"
          outlineColor="black"
          backgroundHoverColor="black"
          textHoverColor="primary"
          data-testid="setup-import-keys-button"
          onClick={() => dispatch({ type: "chooseFlow", flow: "import" })}
        >
          Import existing keys
        </ActionButton>
        {Object.values(wallets)
          .filter((wallet) => wallet.isSupported())
          .map((wallet) => (
            <ActionButton
              key={wallet.kind}
              size="lg"
              outlineColor="black"
              backgroundHoverColor="black"
              textHoverColor="primary"
              data-testid={`setup-connect-${wallet.kind}-button`}
              onClick={() =>
                dispatch({ type: "chooseDevice", device: wallet.kind })
              }
            >
              Connect to {wallet.name}
            </ActionButton>
          ))}
      </Stack>
    </div>
  );
};
