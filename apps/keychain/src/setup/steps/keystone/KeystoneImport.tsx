/**
 * Create > step 1: seed-phrase safety warning with a countdown gate.
 */
import {
  ActionButton,
  Input,
  SeedPhraseInstructions,
  Stack,
  GapPatterns,
} from "@zillions/components";
import clsx from "clsx";
import { useEffect, useState } from "react";
import { GoAlertFill } from "react-icons/go";

import { useWizard } from "../../SetupContext";

import { AnimatedQRScanner, Purpose } from '@keystonehq/animated-qr';
import { ZcashAccounts, ZcashUnifiedFullViewingKey } from "@keystonehq/bc-ur-registry-zcash";

const { NODE_ENV } = process.env;
const TIMEOUT = NODE_ENV === "development" ? 50 : 1000;

export const KeystoneImport = () => {
  const { state, dispatch } = useWizard();
  const [zip32Path, setZip32Path] = useState(state.zip32Path);
  const [viewingKey, setViewingKey] = useState(state.viewingKey);
  const [viewingKeyError, setViewingKeyError] = useState("");
  const [alias, setAlias] = useState(state.alias);
  const handleScan= useCallback(({type, cbor}: {type: string, cbor: string}) => {
    const accounts = ZcashAccounts.fromCBOR(Buffer.from(cbor, 'hex'));
    console.log("onScanSuccess", accounts);
    if(accounts.accounts.length > 0) {
      setViewingKey(accounts.accounts[0].ufvk);
      setAlias(accounts.accounts[0].name);
      setZip32Path({ account: accounts.accounts[0].index });
    }
  }, [])

  const handleError= useCallback((error: string) => {
    console.log("onScanError", error)
  }, [])

  const onSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    dispatch({ type: "setAlias", alias });
    dispatch({ type: "setViewingKey", viewingKey });
    dispatch({ type: "setZip32Path", path: zip32Path });
    dispatch({ type: "setSecretKind", kind: "viewing-key" });
    dispatch({ type: "goToStep", step: "keystone.name" });
  }

  return (
    <>
      <Stack as="form" className="mb-8" gap={GapPatterns.FormFields} onSubmit={onSubmit}>
        <AnimatedQRScanner
          purpose={Purpose.SYNC}
          urTypes={["zcash-accounts"]}
          handleScan={handleScan}
          handleError={handleError}
          options={{
            width: 500,
            blur: false
          }}
        />
        <Input
          data-testid="setup-viewing-key-input"
          label="Viewing Key"
          readOnly={true}
          placeholder="e.g uview1..."
          value={viewingKey}
          error={viewingKeyError}
          onChange={(e) => setViewingKey(e.target.value)}
          onBlur={() => setViewingKeyError(viewingKey === "" ? "Required field" : "")}
        />
        <ActionButton
          data-testid="setup-show-phrase-button"
          size="lg"
          backgroundHoverColor="black"
          textHoverColor="primary"
          disabled={!viewingKey}
          type="submit"
        >
          Import Key
        </ActionButton>
      </Stack>
    </>
  );
};
