import type { ComponentProps } from "react";

// Avalanche (AVAX) logo, from web3icons (https://github.com/0xa3k5/web3icons, MIT),
// raw-svgs/tokens/background/AVAX.svg, with its square background made circular.
export function AvalancheIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" width="64" height="64" fill="none" {...props}>
      <defs>
        <clipPath id="avalanche-clip">
          <circle cx="12" cy="12" r="12" />
        </clipPath>
      </defs>
      <g clipPath="url(#avalanche-clip)">
        <circle cx="12" cy="12" r="12" fill="#E84142" />
        <path
          d="M8.015 19H5.325C4.76 19 4.48 19 4.31 18.895C4.125 18.774 4.01 18.58 4 18.365C3.99 18.165 4.13 17.925 4.41 17.44L11.05 5.9C11.335 5.41 11.48 5.165 11.66 5.075C11.85 4.975 12.085 4.975 12.28 5.075C12.46 5.165 12.6 5.41 12.88 5.9L14.25 8.25L14.255 8.26C14.48 8.593 14.658 8.954 14.785 9.335C14.86 9.635 14.86 9.96 14.785 10.265C14.659 10.649 14.481 11.014 14.255 11.35L10.765 17.43L10.755 17.45C10.576 17.813 10.347 18.149 10.075 18.45C9.84 18.67 9.56 18.829 9.25 18.925C8.965 19 8.65 19 8.015 19ZM14.81 19H18.66C19.235 19 19.52 19 19.69 18.89C19.875 18.77 19.989 18.575 20 18.36C20.01 18.165 19.874 17.935 19.605 17.48L19.575 17.43L17.645 14.18L17.625 14.14C17.355 13.69 17.215 13.46 17.04 13.37C16.845 13.27 16.62 13.27 16.425 13.37C16.245 13.46 16.105 13.7 15.825 14.18L13.895 17.435V17.445C13.61 17.925 13.47 18.165 13.48 18.36C13.49 18.575 13.605 18.774 13.79 18.895C13.955 19 14.24 19 14.81 19Z"
          fill="white"
        />
      </g>
    </svg>
  );
}
