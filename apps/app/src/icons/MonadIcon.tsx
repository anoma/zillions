import type { ComponentProps } from "react";

// Monad (MON) logo, from web3icons (https://github.com/0xa3k5/web3icons, MIT),
// raw-svgs/networks/background/monad.svg, with its square background made circular.
export function MonadIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" width="64" height="64" fill="none" {...props}>
      <defs>
        <clipPath id="monad-clip">
          <circle cx="12" cy="12" r="12" />
        </clipPath>
      </defs>
      <g clipPath="url(#monad-clip)">
        <circle cx="12" cy="12" r="12" fill="#836EF9" />
        <path
          d="M12 4C9.69 4 4 9.69 4 12C4 14.31 9.69 20 12 20C14.31 20 20 14.31 20 12C20 9.69 14.31 4 12 4ZM10.753 16.575C9.779 16.309 7.16 11.727 7.425 10.753C7.691 9.779 12.273 7.16 13.247 7.425C14.221 7.691 16.84 12.272 16.575 13.247C16.309 14.221 11.727 16.84 10.753 16.575Z"
          fill="white"
        />
      </g>
    </svg>
  );
}
