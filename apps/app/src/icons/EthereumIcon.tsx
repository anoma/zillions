import type { ComponentProps } from "react";

// Ethereum (ETH) logo, from web3icons (https://github.com/0xa3k5/web3icons, MIT),
// raw-svgs/tokens/background/ETH.svg, with its square background made circular.
export function EthereumIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" width="64" height="64" fill="none" {...props}>
      <defs>
        <clipPath id="ethereum-clip">
          <circle cx="12" cy="12" r="12" />
        </clipPath>
      </defs>
      <g clipPath="url(#ethereum-clip)">
        <circle cx="12" cy="12" r="12" fill="black" />
        <path d="M12 4V9.912L17 12.148L12 4Z" fill="#8FFCF3" />
        <path d="M12 4L7 12.148L12 9.912V4Z" fill="#CABCF8" />
        <path d="M12 15.979V19.999L17 13.08L12 15.979Z" fill="#CBA7F5" />
        <path d="M12 19.999V15.979L7 13.08L12 19.999Z" fill="#74A0F3" />
        <path d="M12 15.048L17 12.148L12 9.912V15.048Z" fill="#CBA7F5" />
        <path d="M7 12.148L12 15.048V9.912L7 12.148Z" fill="#74A0F3" />
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M12 15.047L7 12.148L12 4L17 12.148L12 15.047ZM7.332 11.912L11.92 4.436V9.872L7.332 11.912ZM7.264 12.116L11.92 10.048V14.816L7.264 12.116ZM12.08 10.048V14.816L16.732 12.116L12.08 10.048ZM12.08 9.872L16.668 11.912L12.08 4.436V9.872Z"
          fill="#202699"
        />
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M12 15.916L7 13.076L12 20L17 13.076L12 15.916ZM7.56 13.576L11.92 16.056V19.616L7.56 13.576ZM12.08 16.056V19.616L16.44 13.576L12.08 16.056Z"
          fill="#202699"
        />
      </g>
    </svg>
  );
}
