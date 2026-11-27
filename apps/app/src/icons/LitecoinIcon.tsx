import type { ComponentProps } from "react";

// Litecoin (LTC) logo, from web3icons (https://github.com/0xa3k5/web3icons, MIT),
// raw-svgs/tokens/background/LTC.svg, with its square background made circular.
export function LitecoinIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" width="64" height="64" fill="none" {...props}>
      <defs>
        <clipPath id="litecoin-clip">
          <circle cx="12" cy="12" r="12" />
        </clipPath>
      </defs>
      <g clipPath="url(#litecoin-clip)">
        <circle cx="12" cy="12" r="12" fill="#345D9D" />
        <path
          d="M6.43 15.21L5 15.77L5.69 13L7.13 12.42L9.21 4H14.34L12.82 10.2L14.23 9.63L13.55 12.37L12.13 12.95L11.28 16.571H19L18.13 20H5.25L6.43 15.21Z"
          fill="white"
        />
      </g>
    </svg>
  );
}
