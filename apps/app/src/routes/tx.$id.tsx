import { createFileRoute, notFound, useParams } from "@tanstack/react-router";
import { PageError } from "../components/PageError";
import { PageLoader } from "../components/PageLoader";
import { LinkShare } from "../components/send/PaymentLinkCreated";
import { TransactionReceiptCard } from "../components/TransactionReceiptCard";
import { ActionButton } from "../components/ui/ActionButton";
import { useGetTransactionHistory } from "../hooks/useGetTransactionHistory";
import { useShowLink } from "../hooks/usePaymentLink";
import type { Activity } from "../lib/wallet/types";

export const Route = createFileRoute("/tx/$id")({
  component: TransactionRoute,
});

function TransactionRoute() {
  const { id } = useParams({ strict: false });

  const transactionHistory = useGetTransactionHistory();

  if (transactionHistory.isPending) {
    return <PageLoader />;
  }

  if (!transactionHistory.isSuccess) {
    return <PageError>{String(transactionHistory.error)}</PageError>;
  }

  const tx = transactionHistory.data.find((t) => t.txid === id);
  if (!tx) {
    throw notFound();
  }

  return (
    <>
      <TransactionReceiptCard tx={tx} />
      <PaymentLink tx={tx} />
    </>
  );
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
