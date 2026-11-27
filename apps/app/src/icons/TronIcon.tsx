import type { ComponentProps } from "react";

// TRON (TRX) logo, from web3icons (https://github.com/0xa3k5/web3icons, MIT),
// raw-svgs/tokens/background/TRX.svg, with its square background made circular.
export function TronIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" width="64" height="64" fill="none" {...props}>
      <defs>
        <clipPath id="tron-clip">
          <circle cx="12" cy="12" r="12" />
        </clipPath>
      </defs>
      <g clipPath="url(#tron-clip)">
        <circle cx="12" cy="12" r="12" fill="#C4342B" />
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M5.261 4.165C5.322 4.098 5.399 4.049 5.486 4.022C5.572 3.996 5.664 3.993 5.752 4.014L16.333 6.605C16.397 6.621 16.457 6.649 16.51 6.687L18.663 8.256C18.768 8.333 18.839 8.448 18.861 8.576C18.883 8.705 18.855 8.837 18.781 8.944L11.374 19.781C11.322 19.858 11.25 19.918 11.165 19.956C11.081 19.994 10.987 20.008 10.895 19.996C10.803 19.984 10.717 19.947 10.645 19.888C10.572 19.83 10.518 19.753 10.487 19.666L5.161 4.67C5.13 4.585 5.124 4.493 5.141 4.404C5.159 4.315 5.2 4.232 5.261 4.165ZM7.007 6.872L10.705 17.282L11.313 11.887L7.007 6.872ZM12.302 12.061L11.685 17.55L16.915 9.896L12.302 12.061ZM17.387 8.567L14.015 10.149L16.276 7.757L17.387 8.567ZM15.258 7.374L7.031 5.36L11.854 10.977L15.258 7.374Z"
          fill="white"
        />
      </g>
    </svg>
  );
}
