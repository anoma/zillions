/**
 * Device branch, connect step: run the chosen device's Connect view, then
 * either store the device right away (no password to set) or continue to the
 * naming step. The passkey is chosen straight from Start, so closing it
 * returns there (`reset`); hardware wallets go back to the picker. The
 * passkey's Connect view itself offers create-or-import before its
 * ceremony, and an imported passkey whose account already exists is
 * refused here, before naming.
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
        // An imported passkey whose account is already here stops before
        // naming: same seed, same addresses, nothing to add. Hardware
        // wallets keep the keyring's re-activate-on-reconnect behavior.
        if (deviceKind === "passkey-prf") {
          const address = keys.transparentAddress ?? keys.shieldedAddress;
          const stored = await client.queryAccounts();
          if (stored.some((a) => !a.parentId && a.address === address)) {
            throw new Error(
              "This passkey's account is already in your Keychain"
            );
          }
        }
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
      onClose={() =>
        dispatch(
          deviceKind === "passkey-prf"
            ? { type: "reset" }
            : { type: "goToStep", step: "device.choose" }
        )
      }
    />
  );
};
