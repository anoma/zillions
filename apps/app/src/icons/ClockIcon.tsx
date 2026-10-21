import type { ComponentProps } from "react";

export function ClockIcon(props: ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.90622"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="10" cy="10" r="7.94" />
      <path d="M10 5.8V10l2.8 1.7" />
    </svg>
  );
}
