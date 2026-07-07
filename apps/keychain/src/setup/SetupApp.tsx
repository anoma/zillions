/**
 * Onboarding composition root: wires the provider and renders the active step
 * (derived from wizard state) inside the shared chrome.
 */
import { Container } from "@zillions/components";

import { SetupProvider } from "./SetupContext";
import { StepRenderer } from "./StepRenderer";
import { StepHeader } from "./ui/StepHeader";

const SetupShell = () => {
  return (
    <Container className="flex flex-col" size="base" header={<StepHeader />}>
      <StepRenderer />
    </Container>
  );
};

export const SetupApp = () => (
  <SetupProvider>
    <SetupShell />
  </SetupProvider>
);
