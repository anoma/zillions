/**
 * Landing step: choose Create or Import. (Ledger intentionally omitted.)
 */
import { ActionButton, Stack } from "@zillions/components";
import { Logo } from "@zillions/components/assets/Logo";
import { useWizard } from "../SetupContext";

export const Start = () => {
  const { dispatch } = useWizard();
  return (
    <div className="flex flex-col flex-1 justify-center">
      <div className="w-[320px] mx-auto mb-18 text-center">
        <Logo className="w-full" />
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
        <ActionButton
          size="lg"
          outlineColor="black"
          backgroundHoverColor="black"
          textHoverColor="primary"
          data-testid="setup-import-keystone-key-button"
          onClick={() => dispatch({ type: "chooseFlow", flow: "keystone" })}
        >
          Import Keystone key
        </ActionButton>
      </Stack>
    </div>
  );
};
