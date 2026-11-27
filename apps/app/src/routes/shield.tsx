import { queryOptions, useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { twMerge } from "tailwind-merge";
import { AmountDisplay } from "../components/AmountInput";
import { FormPage } from "../components/FormPage";
import { HeldFunds } from "../components/HeldFunds";
import { FeeRow } from "../components/PlannedFee";
import { TransactionReceipt } from "../components/TransactionReceipt";
import {
  Breakdown,
  FormCard,
  PoolRoute,
  SubmitBlock,
} from "../components/TransferForm";
import { useAccount } from "../hooks/useAccount";
import { useConfirming } from "../hooks/useConfirming";
import { useGetBalance } from "../hooks/useGetBalance";
import { useSubmitStage } from "../hooks/useSubmitStage";
import { useWallet } from "../hooks/useWallet";
import { keychain } from "../lib/keychain/keychain";
import { zatoshiToZec } from "../lib/utils";

/** Least a shielding may move: zcore's rule, as the fee would eat the rest. */
const SHIELDING_THRESHOLD = 100_000n;

export const Route = createFileRoute("/shield")({
  component: ShieldRoute,
});

function ShieldRoute() {
  const account = useAccount();
  const wallet = useWallet();
  const balance = useGetBalance();
  const {
    balance: total = 0n,
    available = 0n,
    waiting = 0n,
  } = balance.data?.transparent ?? {};

  // The proposal is what the keychain builds and signs: its fee is the one paid.
  const proposal = useQuery(
    queryOptions({
      queryKey: ["shield", wallet.id, available.toString()],
      queryFn: () => wallet.proposeShield(),
      enabled: available >= SHIELDING_THRESHOLD,
      retry: false,
    }),
  );

  const tooLittle = total > 0n && total < SHIELDING_THRESHOLD;
  const tooLittleMessage = `Shielding needs at least ${zatoshiToZec(SHIELDING_THRESHOLD)} ZEC`;
  const confirming = waiting > 0n && !tooLittle;
  const hold = useConfirming(confirming, tooLittle);

  const [validationMessage, setValidationMessage] = useState("");
  const { stages, track } = useSubmitStage();
  const shield = useMutation({
    mutationFn: async () => {
      const { tx, value, fee } = proposal.data!;
      track("approval");
      const proved = await keychain().sendTransaction(
        { ...tx, signer: account.transparent.address },
        track,
      );
      const receipt = {
        tx_type: "Shielded" as const,
        value,
        fee,
        from: { pool: "transparent" as const },
        to: { pool: "shielded" as const },
      };
      // Everything shielded comes back to us, in Ironwood.
      const { txid, timestamp } = await wallet.submit(
        proved,
        { shielded: value, transparent: 0n },
        receipt,
        track,
      );
      return { ...receipt, timestamp, txid };
    },
    onSettled: (_, error) => track(undefined, error),
  });

  if (shield.data) {
    return <TransactionReceipt tx={{ ...shield.data, status: "Pending" }} />;
  }

  const onSubmit = () => {
    const blocked =
      total === 0n
        ? "No transparent funds to shield"
        : tooLittle
          ? tooLittleMessage
          : "";
    setValidationMessage(blocked);
    if (blocked || hold.held()) return;
    const problem =
      !proposal.data && !proposal.error
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
    <FormPage title="Shield" onSubmit={onSubmit}>
      <FormCard heading="Moving">
        <PoolRoute
          from="transparent"
          to="shielded"
          fromTitle={account.transparent.address}
        />
      </FormCard>

      <FormCard heading="Amount">
        <AmountDisplay value={zatoshiToZec(total)} />
        <div
          role={tooLittle ? "alert" : undefined}
          className={twMerge(
            "-mt-1 flex items-center justify-center gap-1.5 text-sm font-medium",
            tooLittle ? "text-red-700" : "text-gray-600",
          )}
        >
          {tooLittle ? tooLittleMessage : "All your transparent funds"}
          <HeldFunds
            zat={balance.data?.transparent.waiting ?? 0n}
            pool="transparent"
          />
        </div>
      </FormCard>

      <Breakdown
        label="You'll have shielded"
        // The proposal holds only what's confirmed.
        total={confirming ? undefined : proposal.data?.value}
      >
        <FeeRow
          label="Transparent funds"
          fee={total > 0n ? total : undefined}
          pending={false}
        />
        <FeeRow fee={proposal.data?.fee} pending={proposal.isLoading} />
      </Breakdown>

      <SubmitBlock
        label={total > 0n ? `Shield ${zatoshiToZec(total)} ZEC` : "Shield"}
        pending={shield.isPending}
        pendingLabel="Shielding..."
        color="black"
        stages={stages}
        error={formError}
        confirming={{ ...hold, waiting, verb: "shield" }}
      />
    </FormPage>
  );
}
