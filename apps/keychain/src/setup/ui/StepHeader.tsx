/**
 * Step header: progress indicator + title + back button. Reads metadata from
 * `STEP_META` and derives the back target from wizard state.
 */
import { Heading, ProgressIndicator } from "@zillions/components";
import clsx from "clsx";
import { GoArrowLeft } from "react-icons/go";

import { isLastStep, previousStep } from "../model/navigation";
import { LANDING, STEP_META } from "../model/steps";
import { useWizard } from "../SetupContext";

export const StepHeader = () => {
  const { state, dispatch } = useWizard();
  const meta = STEP_META[state.flow][state.step] ?? LANDING;

  // No header on the landing screen.
  if (meta.total === 0) return null;

  const showBack = !isLastStep(state.flow, state.step);

  return (
    // Keyed by flow so the header fades in when leaving the landing screen.
    <div key={state.flow} className="animate-screen-fade">
      <div className="relative flex items-center min-h-[22px]">
        {showBack && (
          <span
            className={clsx(
              "flex absolute items-center text-black cursor-pointer",
              "top-0 left-0 text-[22px] transition-colors hover:text-primary active:top-px"
            )}
            onClick={() =>
              dispatch({
                type: "goToStep",
                step: previousStep(state.flow, state.step),
              })
            }
          >
            <GoArrowLeft />
          </span>
        )}
        <ProgressIndicator
          keyName="setup"
          totalSteps={meta.total}
          currentStep={meta.index}
        />
      </div>
      {meta.title && (
        <hgroup key={state.step} className="mt-3 mb-4 animate-screen-fade">
          <Heading
            level="h2"
            className="max-w-[70%] text-xl text-black mx-auto text-center leading-[1.25]"
          >
            {meta.title}
          </Heading>
        </hgroup>
      )}
    </div>
  );
};
