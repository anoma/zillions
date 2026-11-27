import type { ComponentProps } from "react";

// ADI Chain (ADI) logo, from web3icons (https://github.com/0xa3k5/web3icons, MIT),
// raw-svgs/tokens/background/ADI.svg, with its square background made circular.
export function AdiIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" width="64" height="64" fill="none" {...props}>
      <defs>
        <clipPath id="adi-clip">
          <circle cx="12" cy="12" r="12" />
        </clipPath>
        <linearGradient
          id="adi-0"
          x1="12"
          y1="0"
          x2="12"
          y2="24"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FE7109" />
          <stop offset="1" stopColor="#003BFF" />
        </linearGradient>
      </defs>
      <g clipPath="url(#adi-clip)">
        <circle cx="12" cy="12" r="12" fill="url(#adi-0)" />
        <path
          d="M16.932 11.841C16.991 11.939 16.991 12.061 16.932 12.158L12.263 19.852C12.143 20.049 11.857 20.049 11.737 19.852L7.068 12.159C7.009 12.061 7.009 11.939 7.068 11.842L11.737 4.148C11.857 3.951 12.143 3.951 12.263 4.148L16.932 11.841ZM9.263 11.534C9.139 11.738 9.287 11.998 9.526 11.998H14.474C14.714 11.998 14.861 11.738 14.737 11.534L12.263 7.458C12.143 7.261 11.857 7.261 11.737 7.458L9.263 11.534ZM12 9.376C12.481 9.376 12.871 9.766 12.871 10.246C12.871 10.727 12.481 11.117 12 11.117C11.519 11.117 11.129 10.727 11.129 10.246C11.129 9.766 11.519 9.376 12 9.376Z"
          fill="white"
        />
      </g>
    </svg>
  );
}
