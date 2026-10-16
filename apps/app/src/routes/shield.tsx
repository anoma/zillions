import { queryOptions, useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";
import { PageShell } from "../components/PageShell";
import { FeeRow, TotalRow } from "../components/PlannedFee";
import {
  FormError,
  PoolRoute,
  SubmitProgress,
  TransferForm,
} from "../components/TransferForm";
import { TransferSuccess } from "../components/TransferSuccess";
import { ActionButton } from "../components/ui/ActionButton";
import { cardClassName, sectionLabelClassName } from "../components/ui/utils";
import { ZecValue } from "../components/ZecValue";
import { useAccount } from "../hooks/useAccount";
import { useGetBalance } from "../hooks/useGetBalance";
import { useSubmitStage } from "../hooks/useSubmitStage";
import { useWallet } from "../hooks/useWallet";
import { keychain } from "../lib/keychain/keychain";
import { base64ToBytes, bytesToBase64 } from "../lib/keychain/utils";
import { fitFontSize, zatoshiToZec } from "../lib/utils";
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

  const [validationMessage, setValidationMessage] = useState<ReactNode>(null);
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

  const error = shield.error ?? proposal.error;
  const tooLittle = available > 0n && available < SHIELDING_THRESHOLD;

  const onSubmit = () => {
    const problem =
      available === 0n ? (
        "No transparent funds to shield"
      ) : tooLittle ? (
        <>
          Shielding needs at least <ZecValue zat={SHIELDING_THRESHOLD} />
        </>
      ) : !proposal.data && !proposal.error ? (
        "Preparing the transaction, try again in a moment"
      ) : null;
    setValidationMessage(problem);
    if (!problem && proposal.data) shield.mutate();
  };

  return (
    <PageShell title="Shield">
      <TransferForm onSubmit={onSubmit} className="mt-6 gap-4">
        <section aria-labelledby="shield-amount" className={cardClassName}>
          <h2 id="shield-amount" className={sectionLabelClassName}>
            Move
          </h2>
          <PoolRoute
            from="transparent"
            to="shielded"
            fromTitle={account.transparent.address}
          />
          <div className="@container px-6 py-2">
            <div
              className="h-24 flex items-center justify-center leading-none font-medium"
              style={{
                fontSize: fitFontSize(zatoshiToZec(available).length, "4.5rem"),
              }}
            >
              {zatoshiToZec(available)}
            </div>
          </div>
          <p
            role={tooLittle ? "alert" : undefined}
            className={twMerge(
              "-mt-2 text-sm text-center font-medium",
              tooLittle ? "text-red-700" : "text-gray-600",
            )}
          >
            {tooLittle ? (
              <>
                Shielding needs at least <ZecValue zat={SHIELDING_THRESHOLD} />
              </>
            ) : (
              "All your transparent funds"
            )}
          </p>
        </section>

        <section
          aria-labelledby="shield-summary"
          className={twMerge(cardClassName, "gap-0 [&>div]:mt-2")}
        >
          <h2
            id="shield-summary"
            className={twMerge(sectionLabelClassName, "mb-1")}
          >
            Summary
          </h2>
          <FeeRow
            label="Transparent funds"
            fee={available > 0n ? available : undefined}
            pending={false}
          />
          <FeeRow fee={proposal.data?.fee} pending={proposal.isLoading} />
          <TotalRow label="You'll have shielded" value={proposal.data?.value} />
        </section>

        <div>
          <ActionButton
            size="lg"
            className="w-full"
            backgroundColor="black"
            textColor="white"
            disabled={shield.isPending}
          >
            {shield.isPending ? "Shielding..." : "Shield"}
          </ActionButton>

          {shield.isPending && <SubmitProgress stages={stages} />}

          {(validationMessage || error) && !tooLittle && (
            <FormError>{validationMessage || error?.message}</FormError>
          )}
        </div>
      </TransferForm>
    </PageShell>
  );
}
