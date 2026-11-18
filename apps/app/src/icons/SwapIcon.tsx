import type { ComponentProps } from "react";

export function SwapIcon(props: ComponentProps<"svg">) {
  return (
    <svg
      width="22"
      height="48"
      viewBox="0 0 39 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* Path stretched to 48px to accommodate the overlap */}
      <path d="M12 0v48M19 41l-7 7-7-7" />
      {/* Up arrow (on the right) */}
      <path d="M27 48V0M20 7l7-7 7 7" />
    </svg>
  );
}
