import { createFileRoute } from "@tanstack/react-router";
import { TotalBalance } from "../components/TotalBalance";
import { TransactionHistory } from "../components/TransactionHistory";
import { Zcrawler } from "../components/Zcrawler";

export const Route = createFileRoute("/")({
  component: HomeRoute,
});

function HomeRoute() {
  return (
    <>
      <Zcrawler />
      <TotalBalance />
      <TransactionHistory />
    </>
  );
}
