import { queryOptions, useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";
import { AmountDisplay } from "../components/AmountInput";
import { PageShell } from "../components/PageShell";
import { FeeRow } from "../components/PlannedFee";
import {
  Breakdown,
  Caption,
  FormCard,
  PoolRoute,
  SubmitBlock,
  TransferForm,
} from "../components/TransferForm";
import { TransferSuccess } from "../components/TransferSuccess";
import { useAccount } from "../hooks/useAccount";
import { useGetBalance } from "../hooks/useGetBalance";
import { useSubmitStage } from "../hooks/useSubmitStage";
import { useWallet } from "../hooks/useWallet";
import { keychain } from "../lib/keychain/keychain";
import { base64ToBytes, bytesToBase64 } from "../lib/keychain/utils";
import { zatoshiToZec } from "../lib/utils";
import { warmProver } from "../lib/wallet/chain/submit";

/** Least a shielding may move: zcore's rule, as the fee would eat the rest. */
const SHIELDING_THRESHOLD = 100_000n;

export const Route = createFileRoute("/shield")({
  component: ShieldRoute,
});

function ShieldRoute() {
  const account = useAccount();
  const wallet = useWallet();
  const balance = useGetBalance();
  const available = balance.data?.unshieldedBalance ?? 0n;
  const { seedFingerprint, hdIndex } = account.shielded;

  // The proposal is the PCZT that gets signed: its fee is the one paid.
  const proposal = useQuery(
    queryOptions({
      queryKey: [
        "shield",
        wallet.id,
        seedFingerprint,
        hdIndex,
        available.toString(),
      ],
      queryFn: () => wallet.proposeShield({ seedFingerprint, hdIndex }),
      enabled: available >= SHIELDING_THRESHOLD,
      retry: false,
    }),
  );

  const [validationMessage, setValidationMessage] = useState("");
  const { stages, track } = useSubmitStage();
  useEffect(warmProver, []);
  const shield = useMutation({
    mutationFn: async () => {
      const { pczt, value, fee } = proposal.data!;
      track("approval");
      const signed = await keychain().sign({
        signer: account.transparent.address,
        pczt: bytesToBase64(pczt),
      });
      const receipt = {
        tx_type: "Shielded" as const,
        value,
        fee,
        timestamp: Math.floor(Date.now() / 1000),
        from: { pool: "transparent" as const },
        to: { pool: "shielded" as const },
      };
      // Everything shielded comes back to us, in Ironwood.
      const { txid } = await wallet.submit(
        base64ToBytes(signed),
        value,
        receipt,
        track,
      );
      return { ...receipt, txid };
    },
    onSettled: (_, error) => track(undefined, error),
  });

  if (shield.data) {
    return <TransferSuccess tx={{ ...shield.data, status: "Pending" }} />;
  }

  const tooLittle = available > 0n && available < SHIELDING_THRESHOLD;
  const tooLittleMessage = `Shielding needs at least ${zatoshiToZec(SHIELDING_THRESHOLD)} ZEC`;

  const onSubmit = () => {
    const problem =
      available === 0n
        ? "No transparent funds to shield"
        : tooLittle
          ? tooLittleMessage
          : !proposal.data && !proposal.error
            ? "Preparing the transaction, try again in a moment"
            : "";
    setValidationMessage(problem);
    if (!problem && proposal.data) shield.mutate();
  };

  const error = shield.error ?? proposal.error;
  // The threshold already shows by the amount.
  const formError =
    validationMessage === tooLittleMessage
      ? undefined
      : validationMessage || error?.message;

  return (
    <PageShell title="Shield">
      <TransferForm onSubmit={onSubmit}>
        <FormCard heading="Amount">
          <AmountDisplay zat={available} />
          <p
            role={tooLittle ? "alert" : undefined}
            className={twMerge(
              "-mt-1 text-sm text-center font-medium",
              tooLittle ? "text-red-700" : "text-gray-600",
            )}
          >
            {tooLittle ? tooLittleMessage : "All your transparent funds"}
          </p>
          <Caption>Moving</Caption>
          <PoolRoute
            from="transparent"
            to="shielded"
            fromTitle={account.transparent.address}
          />
        </FormCard>

        <Breakdown label="You'll have shielded" total={proposal.data?.value}>
          <FeeRow
            label="Transparent funds"
            fee={available > 0n ? available : undefined}
            pending={false}
          />
          <FeeRow fee={proposal.data?.fee} pending={proposal.isLoading} />
        </Breakdown>

        <SubmitBlock
          label={
            proposal.data ? `Shield ${zatoshiToZec(available)} ZEC` : "Shield"
          }
          pending={shield.isPending}
          pendingLabel="Shielding..."
          color="black"
          stages={stages}
          error={formError}
        />
      </TransferForm>
    </PageShell>
  );
}
