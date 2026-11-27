import type { ComponentProps } from "react";

// Chainlink (LINK) logo, from web3icons (https://github.com/0xa3k5/web3icons, MIT),
// raw-svgs/tokens/background/LINK.svg, with its square background made circular.
export function ChainlinkIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" width="64" height="64" fill="none" {...props}>
      <defs>
        <clipPath id="chainlink-clip">
          <circle cx="12" cy="12" r="12" />
        </clipPath>
      </defs>
      <g clipPath="url(#chainlink-clip)">
        <circle cx="12" cy="12" r="12" fill="#2E61DE" />
        <path
          d="M12.001 4L18.43 7.851V15.645L11.082 20V18.902L5.586 15.617L5.57 7.897L12.001 4ZM12.008 17.316L16.593 14.601V8.894L12.001 6.146L7.408 8.93V14.574L12.008 17.316Z"
          fill="white"
        />
      </g>
    </svg>
  );
}
