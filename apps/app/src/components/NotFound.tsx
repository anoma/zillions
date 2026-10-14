import { FinalStatePage } from "./FinalStatePage";
import { ActionButton } from "./ui/ActionButton";

export function NotFound() {
  return (
    <FinalStatePage title="Page not found">
      <ActionButton href="/">Home</ActionButton>
    </FinalStatePage>
  );
}
