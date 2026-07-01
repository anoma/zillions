import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/shield")({
  component: ShieldRoute,
});

function ShieldRoute() {
  return <div>Shield</div>;
}
