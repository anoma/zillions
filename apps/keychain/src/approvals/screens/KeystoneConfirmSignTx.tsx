/**
 * Final sign confirmation: re-verifies the password when the 30-minute auth
 * window expired, then submits the approved sign request (the background
 * decrypts the seed and signs the PCZT) and closes.
 */
import { useCallback, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert, Input, Stack } from "@zillions/components";

import { PageHeader } from "../../popup/ui/PageHeader";
import { ClientContext, type ApprovalDetails } from "../ApprovalsApp";
import { closeCurrentTab } from "../closeCurrentTab";
import { Status } from "../types";
import { ApprovalActions } from "../ui/ApprovalActions";
import { StatusBox } from "../ui/StatusBox";
import { ZcashPCZT, ZcashUnifiedFullViewingKey } from "@keystonehq/bc-ur-registry-zcash";
import { AnimatedQRScanner, Purpose } from '@keystonehq/animated-qr';

type Props = {
  details: ApprovalDetails;
};

export const KeystoneConfirmSignTx = ({ details }: Props) => {
  const { msgId, signer } = details;

  const navigate = useNavigate();
  const client = useContext(ClientContext);
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState<Status>();
  const [statusInfo, setStatusInfo] = useState("");
  const [txData, setTxData] = useState<string>();

  const handleApproveSignTx = useCallback(
    async (e: React.FormEvent): Promise<void> => {
      e.preventDefault();
      // A PCZT covers transparent + shielded in a single signing pass.
      await client?.submitSignedTx(msgId, txData);
      setStatus(Status.Completed);
    }
  );

  useEffect(() => {
    if (status === Status.Completed) {
      void closeCurrentTab();
    }
  }, [status]);

  const handleScan= useCallback(async ({type, cbor}: {type: string, cbor: string}) => {
    const tx = ZcashPCZT.fromCBOR(Buffer.from(cbor, 'hex'));
    console.log("onScanSuccess", tx);
    setTxData(tx.getData().toBase64());
    setStatusInfo(`Successfully scanned confirmation.`);
    setStatus(Status.Pending);
  }, [])

  const handleError= useCallback((error: string) => {
    console.log("onScanError", error)
  }, [])

  return (
    <Stack className="h-full text-black pt-4 pb-6" gap={4}>
      <PageHeader title="Verify" />
      <Stack
        full
        as="form"
        onSubmit={(e: React.FormEvent) => void handleApproveSignTx(e)}
      >
        <StatusBox
          status={status}
          idleText="Scan your Keystone to continue"
          pendingText={statusInfo}
          errorText={error}
        />
        <AnimatedQRScanner
          purpose={Purpose.SYNC}
          urTypes={["zcash-pczt"]}
          handleScan={handleScan}
          handleError={handleError}
          options={{
            width: 340,
            height: 340,
            blur: false
          }}
        />
        <div className="flex-1" />
        <ApprovalActions
          onReject={() => navigate(-1)}
          rejectLabel="Back"
          approveLabel="Authenticate"
          approveDisabled={status !== Status.Pending}
        />
      </Stack>
    </Stack>
  );
};
