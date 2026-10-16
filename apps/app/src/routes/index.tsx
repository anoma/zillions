import { createFileRoute } from "@tanstack/react-router";
import { MigrationSection } from "../components/MigrationSection";
import { TotalBalance } from "../components/TotalBalance";
import { TransactionHistory } from "../components/TransactionHistory";

export const Route = createFileRoute("/")({
  component: HomeRoute,
});

function HomeRoute() {
  return (
    <>
      <TotalBalance />
      <MigrationSection />
      <TransactionHistory title="Recent transactions" limit={5} />
    </>
  );
}
