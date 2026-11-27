import type { ComponentProps } from "react";

// GMX (GMX) logo, from web3icons (https://github.com/0xa3k5/web3icons, MIT),
// raw-svgs/tokens/background/GMX.svg, with its square background made circular.
export function GmxIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" width="64" height="64" fill="none" {...props}>
      <defs>
        <clipPath id="gmx-clip">
          <circle cx="12" cy="12" r="12" />
        </clipPath>
        <linearGradient
          id="gmx-0"
          x1="12.578"
          y1="6.102"
          x2="7"
          y2="19.404"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#03D1CF" stopOpacity="0.99" />
          <stop offset="1" stopColor="#4E09F8" />
        </linearGradient>
      </defs>
      <g clipPath="url(#gmx-clip)">
        <circle cx="12" cy="12" r="12" fill="url(#gmx-0)" />
        <path
          d="M20 18.222L12.013 5.778L4 18.222H15.165L12.009 13.471L10.453 16H8.787L12.013 10.978L16.676 18.222H20Z"
          fill="white"
        />
      </g>
    </svg>
  );
}
