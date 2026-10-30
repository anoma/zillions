/**
 * Onboarding composition root: wires the provider and renders the active step
 * (derived from wizard state) inside the shared chrome.
 */
import { Container } from "@zillions/components";
import clsx from "clsx";
import { useState } from "react";

import { previousStep } from "./model/navigation";
import { SetupProvider, useWizard } from "./SetupContext";
import { StepRenderer } from "./StepRenderer";
import { StepHeader } from "./ui/StepHeader";

/**
 * Like the popup's `Screen`: each step slides in, forward from the right or
 * back from the left; the first step only fades in. Keyed by step, so the
 * animation replays on every change.
 *
 * A transform animation makes this wrapper the containing block of absolute
 * children, which would trap the completion overlay (`Loading`) inside the
 * step instead of covering the whole container. So the complete steps only
 * fade, and slides don't hold their end state (`backwards` fill).
 */
const StepSlide = () => {
  const { state } = useWizard();
  const [shown, setShown] = useState({
    step: state.step,
    motion: "animate-screen-fade",
  });

  if (shown.step !== state.step) {
    setShown({
      step: state.step,
      motion:
        state.step.endsWith(".complete") ? "animate-screen-fade"
        : previousStep(state.flow, shown.step) === state.step ?
          "animate-screen-back"
        : "animate-screen-forward",
    });
  }

  return (
    <div
      key={state.step}
      className={clsx(
        "flex flex-col flex-1 [animation-fill-mode:backwards]",
        shown.motion
      )}
    >
      <StepRenderer />
    </div>
  );
};

const SetupShell = () => {
  return (
    // One minimum height for every step keeps the header and the main action
    // in place as the user moves through the flow.
    <Container
      className="flex flex-col min-h-[750px]"
      size="base"
      header={<StepHeader />}
    >
      <StepSlide />
    </Container>
  );
};

export const SetupApp = () => (
  <SetupProvider>
    <SetupShell />
  </SetupProvider>
);
