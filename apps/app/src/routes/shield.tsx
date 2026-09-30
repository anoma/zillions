import { queryOptions, useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ActionButton } from "../components/ui/ActionButton";
import { ZecValue } from "../components/ZecValue";
import { useAccount } from "../hooks/useAccount";
import { useGetBalance } from "../hooks/useGetBalance";
import { useWallet } from "../hooks/useWallet";
import { SpinnerIcon } from "../icons/SpinnerIcon";
import { keychain } from "../lib/keychain/keychain";
import { base64ToBytes, bytesToBase64 } from "../lib/keychain/utils";
import { zatoshiToZec } from "../lib/utils";
import { submitTransaction } from "../lib/zcrawler/submit";
import { TransferSuccess } from "./TransferSuccess";

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
      enabled: available > 0n,
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
      const txid = await submitTransaction(base64ToBytes(signed));
      return { txid, value, fee, timestamp: Date.now() };
    },
  });

  if (shield.data) {
    return (
      <TransferSuccess
        tx={{
          ...shield.data,
          tx_type: "Shielded",
          status: "Pending",
          from_address: account.transparent.address,
          to_address: account.shielded.address,
        }}
      />
    );
  }

  const error = shield.error ?? proposal.error;

  return (
    <div className="p-10">
      <h1 className="text-center text-lg font-bold">Shield</h1>
      <form
        className="w-full max-w-125 mx-auto mt-10 flex flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          shield.mutate();
        }}
      >
        <div>
          <div className="text-xs font-medium mb-1">From</div>
          <div
            title={account.transparent.address}
            className="h-11 w-full flex items-center justify-center rounded-full border border-gray-300 font-medium"
          >
            Transparent
          </div>
        </div>

        <div className="mt-4 text-xs font-medium text-center">
          Shields all transparent funds
        </div>

        <div className="mt-2 h-30 w-full flex items-center justify-center text-center text-8xl leading-none font-medium">
          {zatoshiToZec(available)}
        </div>

        <div className="mt-4">
          <div className="text-xs font-medium mb-1">To</div>
          <div className="h-11 w-full p-0.5 rounded-full border border-gray-300">
            <div className="h-full w-full flex items-center justify-center rounded-full bg-gold font-medium">
              Shielded
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between text-xs font-medium">
          <div>Transaction fee</div>
          <div>
            {proposal.data ? (
              <ZecValue zat={proposal.data.fee} />
            ) : proposal.isLoading ? (
              <SpinnerIcon className="size-3" />
            ) : (
              "-"
            )}
          </div>
        </div>

        <ActionButton
          size="lg"
          className="mt-4 w-full"
          backgroundColor="black"
          textColor="white"
          disabled={shield.isPending || !proposal.data}
        >
          {shield.isPending ? "Shielding..." : "Shield"}
        </ActionButton>

        {shield.isPending && (
          <div className="mt-2 text-sm text-center font-medium">
            Proving takes up to a minute after you approve in the keychain.
          </div>
        )}

        {error && (
          <div className="mt-4 text-red-500 text-center">{error.message}</div>
        )}
      </form>
    </div>
  );
}
