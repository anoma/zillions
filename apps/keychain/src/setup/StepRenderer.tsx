/**
 * Maps the active wizard `step` to its component. This is the only place that
 * knows the step→component mapping; everything else navigates by dispatching
 * `goToStep` / `chooseFlow`. Exhaustive over `Step`.
 */
import { useWizard } from "./SetupContext";
import { Start } from "./steps/Start";
import { CreateConfirm } from "./steps/create/CreateConfirm";
import { CreateSeed } from "./steps/create/CreateSeed";
import { CreateWarning } from "./steps/create/CreateWarning";
import { DeviceConnect } from "./steps/device/DeviceConnect";
import { ImportSecret } from "./steps/import/ImportSecret";
import { Complete } from "./steps/shared/Complete";
import { NameAndPassword } from "./steps/shared/NameAndPassword";

export const StepRenderer = () => {
  const { state } = useWizard();

  switch (state.step) {
    case "start":
      return <Start />;

    // create branch
    case "create.warning":
      return <CreateWarning />;
    case "create.seed":
      return <CreateSeed />;
    case "create.confirm":
      return <CreateConfirm />;
    case "create.name":
      return <NameAndPassword nextStep="create.complete" />;
    case "create.complete":
      return <Complete />;

    // import branch
    case "import.secret":
      return <ImportSecret />;
    case "import.name":
      return <NameAndPassword nextStep="import.complete" />;
    case "import.complete":
      return <Complete />;

    // device branch
    case "device.connect":
      return <DeviceConnect />;
    case "device.name":
      return <NameAndPassword nextStep="device.complete" />;
    case "device.complete":
      return <Complete />;

    default: {
      const _never: never = state.step;
      return _never;
    }
  }
};
