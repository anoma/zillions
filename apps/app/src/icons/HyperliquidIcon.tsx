import type { ComponentProps } from "react";

// Hyperliquid logo, from web3icons (https://github.com/0xa3k5/web3icons, MIT),
// raw-svgs/networks/background/hyper-evm.svg, with its square background made circular.
export function HyperliquidIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" width="64" height="64" fill="none" {...props}>
      <defs>
        <clipPath id="hyperliquid-clip">
          <circle cx="12" cy="12" r="12" />
        </clipPath>
      </defs>
      <g clipPath="url(#hyperliquid-clip)">
        <circle cx="12" cy="12" r="12" fill="#072723" />
        <path
          d="M20 11.942C20.014 13.265 19.739 14.53 19.199 15.737C18.428 17.457 16.579 18.864 14.891 17.367C13.514 16.146 13.259 13.669 11.196 13.307C8.467 12.974 8.401 16.161 6.618 16.521C4.631 16.928 3.972 13.562 4.001 12.033C4.03 10.504 4.434 8.355 6.161 8.355C8.148 8.355 8.282 11.386 10.805 11.222C13.303 11.05 13.347 7.897 14.979 6.547C16.387 5.381 18.044 6.236 18.873 7.64C19.642 8.938 19.98 10.462 19.997 11.942H20Z"
          fill="#50D2C1"
        />
      </g>
    </svg>
  );
}
