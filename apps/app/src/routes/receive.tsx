import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/receive")({
  component: ReceiveRoute,
});

function ReceiveRoute() {
  return <div>Receive</div>;
}
