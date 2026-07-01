import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/unshield")({
  component: UnshieldRoute,
});

function UnshieldRoute() {
  return <div>Unshield</div>;
}
