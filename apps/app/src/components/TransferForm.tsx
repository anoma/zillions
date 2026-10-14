import type { ReactNode } from "react";
import { twMerge } from "tailwind-merge";
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
          "px-2 py-0.5 rounded-full border border-gray-300",
          isMax && "bg-black text-white border-black",
        )}
        title={maxTitle}
        onClick={onToggleMax}
      >
        Max
      </button>
    </div>
  );
}

export function ProvingNotice() {
  return (
    <div className="mt-2 text-sm text-center font-medium">
      Proving takes up to a minute after you approve in the keychain.
    </div>
  );
}

export function FormError({ children }: { children: ReactNode }) {
  return <div className="mt-4 text-red-500 text-center">{children}</div>;
}
