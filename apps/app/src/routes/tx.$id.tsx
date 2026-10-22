import { queryOptions, useQuery } from "@tanstack/react-query";
import { createFileRoute, notFound, useParams } from "@tanstack/react-router";
import { PageError } from "../components/PageError";
import { PageLoader } from "../components/PageLoader";
import {
  PublicReceiptCard,
  TransactionReceiptCard,
} from "../components/TransactionReceiptCard";
import { useGetTransactionHistory } from "../hooks/useGetTransactionHistory";
import { LightwalletdError, NOT_FOUND } from "../lib/wallet/chain/lightwalletd";
import { lookupTransaction } from "../lib/wallet/transparent";

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
    return <TransactionReceiptCard tx={tx} />;
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
