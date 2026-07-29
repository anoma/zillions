import { createFileRoute } from "@tanstack/react-router";
import { TotalBalance } from "../components/TotalBalance";
import { TransactionHistory } from "../components/TransactionHistory";

export const Route = createFileRoute("/")({
  component: HomeRoute,
});

function HomeRoute() {
  return (
    <>
      <TotalBalance />
      <TransactionHistory />
    </>
  );
}
