import type { ComponentProps } from "react";

// OKB / X Layer logo, from web3icons (https://github.com/0xa3k5/web3icons, MIT),
// raw-svgs/networks/background/x-layer.svg, with its square background made circular.
export function OkxIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" width="64" height="64" fill="none" {...props}>
      <defs>
        <clipPath id="okx-clip">
          <circle cx="12" cy="12" r="12" />
        </clipPath>
      </defs>
      <g clipPath="url(#okx-clip)">
        <circle cx="12" cy="12" r="12" fill="black" />
        <path
          d="M4 4H9.333V9.333H4V4ZM14.667 9.333H9.333V14.667H4V20H9.333V14.667H14.667V20H20V14.667H14.667V9.333ZM14.667 9.333V4H20V9.333H14.667Z"
          fill="white"
        />
      </g>
    </svg>
  );
}
