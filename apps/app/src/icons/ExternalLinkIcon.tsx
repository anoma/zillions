import type { ComponentProps } from "react";

export function ExternalLinkIcon(props: ComponentProps<"svg">) {
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
      <path d="M8.21 3.16h-3.8A1.58 1.58 0 0 0 2.83 4.74v10.53a1.58 1.58 0 0 0 1.58 1.58h10.53a1.58 1.58 0 0 0 1.58-1.58v-3.8" />
      <path d="M11.99 2.37h4.75v4.75" />
      <path d="M8.98 9.13l8.55-6.75" />
    </svg>
  );
}
