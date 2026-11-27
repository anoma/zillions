import type { ComponentProps } from "react";

// Base logo, from web3icons (https://github.com/0xa3k5/web3icons, MIT),
// raw-svgs/networks/background/base.svg, with its square background made circular.
export function BaseIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" width="64" height="64" fill="none" {...props}>
      <defs>
        <clipPath id="base-clip">
          <circle cx="12" cy="12" r="12" />
        </clipPath>
      </defs>
      <g clipPath="url(#base-clip)">
        <circle cx="12" cy="12" r="12" fill="#0000FF" />
        <path
          d="M4.001 5.517C4.001 4.997 4.001 4.737 4.098 4.538C4.192 4.346 4.347 4.191 4.538 4.098C4.738 4 4.997 4 5.517 4H18.483C19.003 4 19.262 4 19.462 4.098C19.654 4.191 19.808 4.347 19.902 4.538C20 4.738 20 4.997 20 5.517V18.483C20 19.003 20 19.262 19.902 19.462C19.808 19.654 19.653 19.808 19.462 19.902C19.262 20 19.003 20 18.483 20H5.517C4.997 20 4.738 20 4.538 19.902C4.346 19.808 4.192 19.653 4.098 19.462C4 19.262 4 19.003 4 18.483V5.517H4.001Z"
          fill="white"
        />
      </g>
    </svg>
  );
}
