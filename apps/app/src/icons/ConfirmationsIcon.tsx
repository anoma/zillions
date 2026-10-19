import type { ComponentProps } from "react";

const C = 2 * Math.PI * 12;

/** A ring of `of` segments, `done` of them filled. */
export function ConfirmationsIcon({
  done,
  of,
  ...props
}: ComponentProps<"svg"> & { done: number; of: number }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" {...props}>
      {Array.from({ length: of }, (_, i) => (
        <circle
          key={i}
          cx={16}
          cy={16}
          r={12}
          strokeWidth={6}
          strokeDasharray={`${C / of - 2} ${C}`}
          transform={`rotate(${(i * 360) / of - 90} 16 16)`}
          opacity={i < done ? 1 : 0.3}
        />
      ))}
    </svg>
  );
}
