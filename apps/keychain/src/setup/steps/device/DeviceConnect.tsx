/**
 * Device branch, connect step: run the chosen device's Connect view, then
 * either store the device right away (no password to set) or continue to the
 * naming step.
 */
import { wallets } from "../../../hardware";
import { useWizard } from "../../SetupContext";
import { saveDevice } from "./saveDevice";

export const DeviceConnect = () => {
  const { state, dispatch, client } = useWizard();
  const deviceKind = state.deviceKind;

  if (!deviceKind) return null;

  const Connect = wallets[deviceKind].views.Connect;

  return (
    <Connect
      onKeys={async (keys) => {
        dispatch({ type: "deviceConnected", device: deviceKind, keys });
        // Without a password to set there's nothing to ask: store it right away.
        if (!state.passwordRequired) {
          await saveDevice(client, dispatch, {
            device: deviceKind,
            keys,
            passwordRequired: false,
          });
        }
      }}
      onClose={() => dispatch({ type: "goToStep", step: "device.choose" })}
    />
  );
};
