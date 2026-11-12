import type { ComponentProps, ReactNode, Ref } from "react";
import { twMerge } from "tailwind-merge";
import {
  readyIn,
  type useConfirming,
  useReadyIn,
} from "../hooks/useConfirming";
import type { StageEntry } from "../hooks/useSubmitStage";
import { SpinnerIcon } from "../icons/SpinnerIcon";
import { AmountInput } from "./AmountInput";
import { HeldFunds } from "./HeldFunds";
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
        "h-10 flex items-center justify-center rounded-full text-sm font-medium",
        pool === "shielded"
          ? "bg-gold text-on-gold"
          : "border border-line bg-card",
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

export function BalanceWithMax({
  balance,
  waiting,
  pool,
  isMax,
  onToggleMax,
}: {
  balance: bigint;
  waiting: bigint;
  pool: "shielded" | "transparent";
  isMax: boolean;
  onToggleMax: () => void;
}) {
  return (
    <div className="flex items-center justify-center gap-2 text-xs font-medium">
      <span>
        Balance: <ZecValue zat={balance} />
      </span>
      {/* Opens leftwards: this row sits at the card's right edge. */}
      <HeldFunds
        zat={waiting}
        pool={pool}
        className="left-auto right-0 translate-x-0"
      />
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

export function SubmitProgress({ stages }: { stages: StageEntry[] }) {
  const current = stages.at(-1)?.stage;
  if (!current) return null;
  const approving = current === "building" || current === "approval";
  return (
    <div className="mt-4 text-center" role="status">
      <p className="flex items-center justify-center gap-2 text-sm font-medium">
        <SpinnerIcon className="size-4 text-gold" />
        {approving ? "Approve in your Keychain" : "Processing your transaction"}
      </p>
      {!approving && (
        <p className="mt-1 text-xs text-gray-500">
          Keep this page open until it's done.
        </p>
      )}
    </div>
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

/**
 * A section of the form's card, with a heading row and room for a control
 * beside it. With `htmlFor` the heading is the label of that control.
 */
export function FormCard({
  heading,
  headingId,
  htmlFor,
  aside,
  className,
  children,
}: {
  heading: ReactNode;
  headingId?: string;
  htmlFor?: string;
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
        <h2 id={headingId} className="text-xs font-medium text-gray-600">
          {htmlFor ? <label htmlFor={htmlFor}>{heading}</label> : heading}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** The hero amount field with its error line. `id` is the input's, and prefixes the others. */
export function AmountField({
  id,
  value,
  onChange,
  error,
  describedBy,
  ref,
  unit = "ZEC",
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  describedBy?: string;
  ref?: Ref<HTMLInputElement>;
  unit?: string;
}) {
  const errorId = `${id}-error`;
  return (
    <>
      <AmountInput
        id={id}
        ref={ref}
        value={value}
        unit={unit}
        // Digits have no descenders; this takes back the empty space under them.
        className={twMerge("h-20 -mb-3", error && "text-red-700")}
        maxFontSize="4.5rem"
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
          className="text-sm text-center font-medium text-red-700 motion-safe:animate-fade-in"
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
      className="flex flex-col gap-1.5 px-4 pt-4 border-t border-line"
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
  confirming,
  children,
}: {
  label: string;
  pending: boolean;
  pendingLabel: string;
  color?: Extract<Color, "gold-button" | "black">;
  stages: StageEntry[];
  error?: string;
  confirming?: Confirming;
  children?: ReactNode;
}) {
  const notice = !pending && confirming?.notice;
  return (
    <div>
      <ActionButton
        size="md"
        className="w-full h-12"
        backgroundColor={color}
        textColor={color === "black" ? "white" : undefined}
        disabled={pending}
        aria-describedby={notice ? CONFIRMING_ID : undefined}
      >
        {pending ? pendingLabel : label}
      </ActionButton>
      {children}
      <div id={CONFIRMING_ID} role="status">
        {notice && confirming && (
          <ConfirmingNotice {...confirming} notice={notice} />
        )}
      </div>
      {pending && <SubmitProgress stages={stages} />}
      {error && <FormError>{error}</FormError>}
    </div>
  );
}

const CONFIRMING_ID = "submit-confirming";

type Confirming = ReturnType<typeof useConfirming> & {
  waiting: bigint;
  verb: string;
};

/** Why the submit waits on confirming funds, counting down, then that it can go. */
function ConfirmingNotice({
  notice,
  waiting,
  verb,
}: Confirming & { notice: "waiting" | "ready" }) {
  const ms = useReadyIn();
  return (
    <div className="mt-4 px-4 py-3 rounded-lg bg-gold/15 text-sm text-center motion-safe:animate-fade-in">
      {notice === "ready" ? (
        `Your funds have confirmed. You can ${verb} now.`
      ) : (
        <>
          <ZecValue zat={waiting} /> of your balance is still processing.{" "}
          {/* Read out once a minute, not every second. */}
          <span
            aria-hidden="true"
            className={ms === undefined ? undefined : "whitespace-nowrap"}
          >
            {readyIn(ms)}
          </span>
          <span className="sr-only">{readyIn(ms, true)}</span>
        </>
      )}
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
