/**
 * Device branch, connect step: run the chosen device's Connect view, then
 * either store the device right away (no password to set) or continue to the
 * naming step. The passkey is chosen straight from Start, so closing it
 * returns there (`reset`); hardware wallets go back to the picker. The
 * passkey's Connect view itself offers create-or-import before its
 * ceremony, and an imported passkey whose account already exists is
 * refused here, before naming.
 */
import { useEffect, useState } from "react";

import { wallets } from "../../../hardware";
import { freeAlias } from "../../model/alias";
import { useWizard } from "../../SetupContext";
import { saveDevice } from "./saveDevice";

export const DeviceConnect = () => {
  const { state, dispatch, client } = useWizard();
  const deviceKind = state.deviceKind;
  // The names in use, for a new passkey to take a free one as its name in
  // the password manager; empty until loaded.
  const [takenAliases, setTakenAliases] = useState<string[]>([]);
  useEffect(() => {
    void client
      .queryAccounts()
      .then((all) =>
        setTakenAliases(all.filter((a) => !a.parentId).map((a) => a.alias))
      );
  }, [client]);

  if (!deviceKind) return null;

  const Connect = wallets[deviceKind].views.Connect;

  return (
    <Connect
      takenAliases={takenAliases}
      onKeys={async (connected) => {
        const parents = (await client.queryAccounts()).filter(
          (a) => !a.parentId
        );
        // An imported passkey whose account is already here stops before
        // naming: same seed, same addresses, nothing to add. Hardware
        // wallets keep the keyring's re-activate-on-reconnect behavior.
        if (deviceKind === "passkey-prf") {
          const address =
            connected.transparentAddress ?? connected.shieldedAddress;
          if (parents.some((a) => a.address === address)) {
            throw new Error(
              "This passkey's account is already in your Keychain"
            );
          }
        }
        // Devices report a default name ("Ledger", "Passkey"): number repeats.
        const keys = {
          ...connected,
          alias: freeAlias(
            connected.alias,
            parents.map((a) => a.alias)
          ),
        };
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
