/**
 * Step navigation helpers. `next`/`previous` are total functions over
 * `(flow, step)`, keeping the step order defined in one place.
 */
import type { Flow, Step } from "./wizard";

const CREATE_ORDER: Step[] = [
  "create.warning",
  "create.seed",
  "create.confirm",
  "create.name",
  "create.complete",
];

const IMPORT_ORDER: Step[] = [
  "import.secret",
  "import.name",
  "import.complete",
];

const LEDGER_ORDER: Step[] = ["ledger.password", "ledger.complete"];

const ORDERS: Record<Flow, Step[]> = {
  none: [],
  create: CREATE_ORDER,
  import: IMPORT_ORDER,
  ledger: LEDGER_ORDER,
};

const orderFor = (flow: Flow): Step[] => ORDERS[flow];

export const previousStep = (flow: Flow, step: Step): Step => {
  if (step === "start") return "start";
  const order = orderFor(flow);
  const i = order.indexOf(step);
  // First step of a branch goes back to the landing screen.
  if (i <= 0) return "start";
  return order[i - 1];
};

export const nextStep = (flow: Flow, step: Step): Step => {
  const order = orderFor(flow);
  const i = order.indexOf(step);
  if (i === -1 || i === order.length - 1) return step;
  return order[i + 1];
};

/** Is this the final step of its branch (used to hide the back button)? */
export const isLastStep = (flow: Flow, step: Step): boolean => {
  const order = orderFor(flow);
  return order.length > 0 && order[order.length - 1] === step;
};
