import { queryOptions, useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "../components/PageShell";
import { FeeRow } from "../components/PlannedFee";
import {
  Field,
  FormError,
  PoolPill,
  ProvingNotice,
  TransferForm,
} from "../components/TransferForm";
import { TransferSuccess } from "../components/TransferSuccess";
import { ActionButton } from "../components/ui/ActionButton";
import { ZecValue } from "../components/ZecValue";
import { useAccount } from "../hooks/useAccount";
import { useGetBalance } from "../hooks/useGetBalance";
import { useWallet } from "../hooks/useWallet";
import { keychain } from "../lib/keychain/keychain";
import { base64ToBytes, bytesToBase64 } from "../lib/keychain/utils";
import { fitFontSize, zatoshiToZec } from "../lib/utils";

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

  const shield = useMutation({
    mutationFn: async () => {
      const { pczt, value, fee } = proposal.data!;
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
      );
      return { ...receipt, txid };
    },
  });

  if (shield.data) {
    return <TransferSuccess tx={{ ...shield.data, status: "Pending" }} />;
  }

  const error = shield.error ?? proposal.error;
  const tooLittle = available > 0n && available < SHIELDING_THRESHOLD;

  return (
    <PageShell title="Shield">
      <TransferForm className="@container" onSubmit={() => shield.mutate()}>
        <Field label="From">
          <PoolPill pool="transparent" title={account.transparent.address} />
        </Field>

        <div className="mt-4 text-xs font-medium text-center">
          Shields all transparent funds
        </div>

        <div
          className="mt-2 h-30 w-full flex items-center justify-center text-center leading-none font-medium"
          style={{
            fontSize: fitFontSize(zatoshiToZec(available).length, "6rem"),
          }}
        >
          {zatoshiToZec(available)}
        </div>

        <Field label="To" className="mt-4">
          <PoolPill pool="shielded" />
        </Field>

        <FeeRow fee={proposal.data?.fee} pending={proposal.isLoading} />

        <ActionButton
          size="lg"
          className="mt-4 w-full"
          backgroundColor="black"
          textColor="white"
          disabled={shield.isPending || !proposal.data}
        >
          {shield.isPending ? "Shielding..." : "Shield"}
        </ActionButton>

        {shield.isPending && <ProvingNotice />}

        {tooLittle && (
          <div className="mt-2 text-sm text-center font-medium">
            Shielding needs at least <ZecValue zat={SHIELDING_THRESHOLD} />
          </div>
        )}

        {error && <FormError>{error.message}</FormError>}
      </TransferForm>
    </PageShell>
  );
}
