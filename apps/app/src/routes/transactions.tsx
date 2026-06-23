import { createFileRoute } from "@tanstack/react-router";
import { TransactionHistory } from "../components/TransactionHistory";

export const Route = createFileRoute("/transactions")({
  component: TransactionsRoute,
});

function TransactionsRoute() {
  return <TransactionHistory />;
}
