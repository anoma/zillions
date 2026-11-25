import { queryOptions, useQuery } from "@tanstack/react-query";
import { createFileRoute, notFound, useParams } from "@tanstack/react-router";
import { PageError } from "../components/PageError";
import { PageLoader } from "../components/PageLoader";
import { LinkShare } from "../components/send/PaymentLinkCreated";
import { TransactionReceipt } from "../components/TransactionReceipt";
import { PublicReceiptCard } from "../components/TransactionReceiptCard";
import { ActionButton } from "../components/ui/ActionButton";
import { useGetTransactionHistory } from "../hooks/useGetTransactionHistory";
import { useShowLink } from "../hooks/usePaymentLink";
import { LightwalletdError, NOT_FOUND } from "../lib/wallet/chain/lightwalletd";
import { lookupTransaction } from "../lib/wallet/transparent";
import type { Activity } from "../lib/wallet/types";

export const Route = createFileRoute("/tx/$id")({
  component: TransactionRoute,
});

const publicTransaction = (txid: string) =>
  queryOptions({
    queryKey: ["publicTransaction", txid],
    queryFn: () => lookupTransaction(txid),
    retry: false,
  });

function TransactionRoute() {
  const { id = "" } = useParams({ strict: false });

  const transactionHistory = useGetTransactionHistory();
  const tx = transactionHistory.data?.find((t) => t.txid === id);
  // A link shared by someone else: only what the chain shows anyone.
  const lookup = useQuery({
    ...publicTransaction(id),
    enabled: transactionHistory.isSuccess && !tx && /^[0-9a-f]{64}$/.test(id),
  });

  if (transactionHistory.isPending) {
    return <PageLoader />;
  }

  if (!transactionHistory.isSuccess) {
    return <PageError>{String(transactionHistory.error)}</PageError>;
  }

  if (tx) {
    return (
      <>
        <TransactionReceipt tx={tx} />
        <PaymentLink tx={tx} />
      </>
    );
  }

  if (lookup.isSuccess) {
    return <PublicReceiptCard tx={lookup.data} />;
  }

  if (lookup.isLoading) {
    return <PageLoader />;
  }

  if (
    lookup.error &&
    !(
      lookup.error instanceof LightwalletdError &&
      lookup.error.status === NOT_FOUND
    )
  ) {
    return <PageError>{String(lookup.error)}</PageError>;
  }

  throw notFound();
}

/** Shows the link a send funded again, behind a Keychain approval. */
function PaymentLink({ tx }: { tx: Activity }) {
  const { isLink, description, reveal } = useShowLink(
    tx.txid,
    tx.tx_type === "Sent" && tx.status !== "Expired",
  );
  if (!isLink) return null;

  return (
    <div className="px-10 max-sm:px-6 pb-10">
      <div className="isolate max-w-120 mx-auto flex flex-col gap-4">
        {reveal.data ? (
          <LinkShare url={reveal.data} description={description} />
        ) : (
          <div className="flex flex-col items-center gap-2">
            <ActionButton
              type="button"
              size="sm"
              outlineColor="black"
              disabled={reveal.isPending}
              onClick={() => reveal.mutate()}
            >
              {reveal.isPending
                ? "Waiting for the Keychain..."
                : "Show payment link"}
            </ActionButton>
            {reveal.error && (
              <p role="alert" className="text-sm text-red-700 text-center">
                {reveal.error.message}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
