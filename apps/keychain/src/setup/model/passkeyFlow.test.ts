import { describe, expect, it } from "vitest";

import { isLastStep, nextStep, previousStep } from "./navigation";
import { STEP_META } from "./steps";
import { initialWizardState, wizardReducer } from "./wizard";

describe("passkey setup flow", () => {
  it("starts at connect with the passkey device already chosen", () => {
    const state = wizardReducer(initialWizardState(false), {
      type: "chooseFlow",
      flow: "passkey",
    });
    expect(state.step).toBe("device.connect");
    expect(state.deviceKind).toBe("passkey-prf");
  });

  it("leaves the device unset for the hardware flow", () => {
    const state = wizardReducer(initialWizardState(false), {
      type: "chooseFlow",
      flow: "device",
    });
    expect(state.deviceKind).toBeUndefined();
  });

  it("skips the hardware picker in both directions", () => {
    expect(previousStep("passkey", "device.connect")).toBe("start");
    expect(nextStep("passkey", "device.connect")).toBe("device.name");
    expect(nextStep("passkey", "device.name")).toBe("device.complete");
    expect(isLastStep("passkey", "device.complete")).toBe(true);
  });

  it("numbers its own three steps", () => {
    expect(
      (["device.connect", "device.name", "device.complete"] as const).map(
        (step) => STEP_META.passkey[step]?.index,
      ),
    ).toEqual([1, 2, 3]);
  });
});
