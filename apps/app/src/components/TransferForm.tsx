import {
  type ComponentProps,
  type ReactNode,
  type Ref,
  useEffect,
  useState,
} from "react";
import { twMerge } from "tailwind-merge";
import type { StageEntry, SubmitStage } from "../hooks/useSubmitStage";
import { SpinnerIcon } from "../icons/SpinnerIcon";
import { AmountInput } from "./AmountInput";
import { TotalRow } from "./PlannedFee";
import { ActionButton } from "./ui/ActionButton";
import type { Color } from "./ui/types";
import { pillButtonClassName } from "./ui/utils";
import { ZecValue } from "./ZecValue";

const POOL_LABEL = { shielded: "Shielded", transparent: "Transparent" };

/** A transfer's fixed source and destination pools, as one row. */
export function PoolRoute({
  from,
  to,
  fromTitle,
}: {
  from: "shielded" | "transparent";
  to: "shielded" | "transparent";
  fromTitle?: string;
}) {
  const pill = (pool: "shielded" | "transparent", title?: string) => (
    <span
      title={title}
      className={twMerge(
        "h-12 flex items-center justify-center rounded-full text-base font-medium",
        pool === "shielded" ? "bg-gold" : "border border-line bg-card",
      )}
    >
      {POOL_LABEL[pool]}
    </span>
  );
  return (
    <p className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
      <span className="sr-only">From</span>
      {pill(from, fromTitle)}
      <span className="sr-only">to</span>
      <ArrowRightIcon aria-hidden="true" className="size-4 text-black/50" />
      {pill(to)}
    </p>
  );
}

function ArrowRightIcon(props: ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

export function AvailableWithMax({
  available,
  isMax,
  onToggleMax,
}: {
  available: bigint;
  isMax: boolean;
  onToggleMax: () => void;
}) {
  return (
    <div className="flex items-center justify-center gap-2 text-xs font-medium">
      <span>
        Available: <ZecValue zat={available} />
      </span>
      <button
        type="button"
        className={twMerge(
          pillButtonClassName,
          isMax &&
            "bg-black text-white border-black hover:bg-black hover:border-black",
        )}
        aria-pressed={isMax}
        onClick={onToggleMax}
      >
        Max
      </button>
    </div>
  );
}

const STEPS: { label: string; stages: SubmitStage[]; optional?: boolean }[] = [
  { label: "Preparing the transaction", stages: ["building"], optional: true },
  { label: "Approve in your keychain", stages: ["approval"] },
  {
    label: "Downloading Sapling parameters",
    stages: ["sapling-params"],
    optional: true,
  },
  {
    label: "Generating the proof",
    stages: [
      "sapling-proofs",
      "proving-key",
      "orchard-proof",
      "ironwood-proof",
    ],
  },
  { label: "Verifying", stages: ["verifying"] },
  { label: "Broadcasting", stages: ["broadcast"] },
];

const DETAIL: Partial<Record<SubmitStage, string>> = {
  "sapling-proofs": "Sapling",
  "proving-key": "building the proving key",
  "orchard-proof": "Orchard",
  "ironwood-proof": "Ironwood",
};

export function SubmitProgress({ stages }: { stages: StageEntry[] }) {
  const current = stages.at(-1)?.stage;
  const steps = STEPS.filter(
    (step) =>
      !step.optional ||
      stages.some((entry) => step.stages.includes(entry.stage)),
  );
  const active = steps.findIndex(
    (step) => current && step.stages.includes(current),
  );
  const since = stages.find((entry) =>
    steps[active]?.stages.includes(entry.stage),
  )?.at;
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(performance.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="mt-4">
      <ol className="flex flex-col gap-2 text-sm" aria-live="polite">
        {steps.map((step, i) => {
          const state = i < active ? "done" : i === active ? "active" : "next";
          const detail = state === "active" && current && DETAIL[current];
          return (
            <li
              key={step.label}
              className={twMerge(
                "flex items-center gap-2",
                state === "next" && "text-gray-400",
                state === "active" && "font-medium",
              )}
            >
              <span className="size-4 shrink-0 flex items-center justify-center">
                {state === "done" ? (
                  <CheckIcon className="size-4 text-gold" />
                ) : state === "active" ? (
                  <SpinnerIcon className="size-4 text-gold" />
                ) : (
                  <span className="size-2 rounded-full border border-current" />
                )}
              </span>
              <span>
                {step.label}
                {detail && (
                  <span className="font-normal text-gray-500"> · {detail}</span>
                )}
              </span>
              {state === "active" && since !== undefined && (
                <span className="ml-auto text-xs tabular-nums text-gray-500">
                  {Math.max(0, Math.floor((now - since) / 1000))}s
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <div className="mt-3 text-xs text-center text-gray-500">
        Proving runs on this device and can take up to a minute.
      </div>
    </div>
  );
}

function CheckIcon(props: ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
    </svg>
  );
}

export function FormError({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="mt-4 text-red-700 text-center motion-safe:animate-fade-in"
    >
      {children}
    </div>
  );
}

/** A submit-time problem, shown by the field it's about. */
export type Problem<Field extends string = "amount"> = {
  field: Field | "form";
  message: string;
};

/** A section of the form's card, with a heading row and room for a control beside it. */
export function FormCard({
  heading,
  headingId,
  aside,
  className,
  children,
}: {
  heading: ReactNode;
  headingId?: string;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={headingId}
      className={twMerge("flex flex-col gap-2", className)}
    >
      <div className="flex items-center justify-between gap-4">
        <h2 id={headingId} className="text-xs font-medium">
          {heading}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** The hero amount field with its error line. `id` prefixes the ids it exposes. */
export function AmountField({
  id,
  value,
  onChange,
  error,
  describedBy,
  ref,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  describedBy?: string;
  ref?: Ref<HTMLInputElement>;
}) {
  const errorId = `${id}-error`;
  return (
    <>
      <AmountInput
        ref={ref}
        value={value}
        className={twMerge("h-28", error && "text-red-700")}
        maxFontSize="6rem"
        aria-invalid={Boolean(error)}
        aria-describedby={
          [error && errorId, describedBy].filter(Boolean).join(" ") || undefined
        }
        onChange={(e) => onChange(e.target.value)}
      />
      {error && (
        <p
          id={errorId}
          role="alert"
          className="-mt-1 text-sm text-center font-medium text-red-700 motion-safe:animate-fade-in"
        >
          {error}
        </p>
      )}
    </>
  );
}

/** The fee breakdown: `rows` then the total line. */
export function Breakdown({
  label,
  total,
  children,
}: {
  label?: string;
  total?: bigint;
  children: ReactNode;
}) {
  return (
    <section
      aria-label="Summary"
      className="flex flex-col gap-1.5 px-4 pt-6 border-t border-line"
    >
      {children}
      <TotalRow label={label} value={total} />
    </section>
  );
}

/** The submit button, with whatever stands under it: notices, progress, errors. */
export function SubmitBlock({
  label,
  pending,
  pendingLabel,
  color = "gold-button",
  stages,
  error,
  children,
}: {
  label: string;
  pending: boolean;
  pendingLabel: string;
  color?: Extract<Color, "gold-button" | "black">;
  stages: StageEntry[];
  error?: string;
  children?: ReactNode;
}) {
  return (
    // Pulled toward the summary: the button acts on what it adds up.
    <div className="-mt-2">
      <ActionButton
        size="md"
        className="w-full h-14"
        backgroundColor={color}
        textColor={color === "black" ? "white" : undefined}
        disabled={pending}
      >
        {pending ? pendingLabel : label}
      </ActionButton>
      {children}
      {pending && <SubmitProgress stages={stages} />}
      {error && <FormError>{error}</FormError>}
    </div>
  );
}

/** A line under the submit button. */
export function Notice({
  icon,
  className,
  children,
}: {
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <p
      className={twMerge(
        "mt-3 flex items-center justify-center gap-1.5 text-sm text-center font-medium",
        className,
      )}
    >
      {icon}
      {children}
    </p>
  );
}
