import { createFileRoute } from "@tanstack/react-router";
import { TotalBalance } from "../components/TotalBalance";

export const Route = createFileRoute("/")({
  component: HomeRoute,
});

function HomeRoute() {
  return (
    <div className="p-10">
      <TotalBalance />
    </div>
  );
}
