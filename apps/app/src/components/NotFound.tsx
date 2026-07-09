import { Link } from "@tanstack/react-router";
import { FinalStatePage } from "./FinalStatePage";
import { ActionButton } from "./ui/ActionButton";

export function NotFound() {
  return (
    <FinalStatePage title="Page not found">
      <Link to="/">
        <ActionButton>Home</ActionButton>
      </Link>
    </FinalStatePage>
  );
}
