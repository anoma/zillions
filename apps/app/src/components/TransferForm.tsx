import {
  type ComponentProps,
  type ReactNode,
  useEffect,
  useState,
} from "react";
import { twMerge } from "tailwind-merge";
import type { StageEntry, SubmitStage } from "../hooks/useSubmitStage";
import { SpinnerIcon } from "../icons/SpinnerIcon";
import { ZecValue } from "./ZecValue";

export function TransferForm({
  onSubmit,
  className,
  children,
}: {
  onSubmit: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <form
      className={twMerge(
        "w-full max-w-125 mx-auto mt-10 flex flex-col",
        className,
      )}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {children}
    </form>
  );
}

export function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={className}>
      <div className="text-xs font-medium mb-1">{label}</div>
      {children}
    </label>
  );
}

/** A fixed From/To pool, drawn like the pool toggle's selected or unselected side. */
export function PoolPill({
  pool,
  title,
}: {
  pool: "shielded" | "transparent";
  title?: string;
}) {
  if (pool === "transparent") {
    return (
      <div
        title={title}
        className="h-11 w-full flex items-center justify-center rounded-full border border-gray-300 font-medium"
      >
        Transparent
      </div>
    );
  }
  return (
    <div
      title={title}
      className="h-11 w-full p-0.5 rounded-full border border-gray-300"
    >
      <div className="h-full w-full flex items-center justify-center rounded-full bg-gold font-medium">
        Shielded
      </div>
    </div>
  );
}

export function AvailableWithMax({
  available,
  isMax,
  onToggleMax,
  maxTitle,
}: {
  available: bigint;
  isMax: boolean;
  onToggleMax: () => void;
  maxTitle?: string;
}) {
  return (
    <div className="mt-4 flex items-center justify-center gap-2 text-xs font-medium">
      <span>
        Available: <ZecValue zat={available} />
      </span>
      <button
        type="button"
        className={twMerge(
          "px-2 py-0.5 rounded-full border border-line cursor-pointer transition-colors duration-300 hover:border-line-strong hover:bg-black/5",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black",
          isMax && "bg-black text-white border-black",
        )}
        title={maxTitle}
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
