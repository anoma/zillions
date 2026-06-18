import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/transactions")({
  component: TransactionsRoute,
});

function TransactionsRoute() {
  return <div>Transactions</div>;
}
