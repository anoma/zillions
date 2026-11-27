import type { ComponentProps } from "react";

// Aave (AAVE) logo, from web3icons (https://github.com/0xa3k5/web3icons, MIT),
// raw-svgs/tokens/background/AAVE.svg, with its square background made circular.
export function AaveIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" width="64" height="64" fill="none" {...props}>
      <defs>
        <clipPath id="aave-clip">
          <circle cx="12" cy="12" r="12" />
        </clipPath>
      </defs>
      <g clipPath="url(#aave-clip)">
        <circle cx="12" cy="12" r="12" fill="#9391F7" />
        <path
          d="M9.876 16C10.775 16 11.503 15.302 11.503 14.44C11.503 13.578 10.775 12.88 9.876 12.88C8.977 12.88 8.249 13.578 8.249 14.44C8.249 15.302 8.977 16 9.876 16Z"
          fill="white"
        />
        <path
          d="M14.129 16C15.028 16 15.757 15.302 15.757 14.44C15.757 13.578 15.028 12.88 14.129 12.88C13.231 12.88 12.502 13.578 12.502 14.44C12.502 15.302 13.231 16 14.129 16Z"
          fill="white"
        />
        <path
          d="M12 8C7.581 8 3.999 11.5 4 15.815H6.044C6.044 12.581 8.689 9.959 12 9.959C15.311 9.959 17.956 12.581 17.956 15.815H20C20.001 11.5 16.418 8 12 8Z"
          fill="white"
        />
      </g>
    </svg>
  );
}
