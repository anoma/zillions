import { createFileRoute, notFound, useParams } from "@tanstack/react-router";
import { PageError } from "../components/PageError";
import { PageLoader } from "../components/PageLoader";
import { TransactionReceiptCard } from "../components/TransactionReceiptCard";
import { useGetTransactionHistory } from "../hooks/useGetTransactionHistory";

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

  return <TransactionReceiptCard tx={tx} />;
}
