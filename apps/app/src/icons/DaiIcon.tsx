import type { ComponentProps } from "react";

// Dai (DAI) logo, from web3icons (https://github.com/0xa3k5/web3icons, MIT),
// raw-svgs/tokens/background/DAI.svg, with its square background made circular.
export function DaiIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" width="64" height="64" fill="none" {...props}>
      <defs>
        <clipPath id="dai-clip">
          <circle cx="12" cy="12" r="12" />
        </clipPath>
      </defs>
      <g clipPath="url(#dai-clip)">
        <circle cx="12" cy="12" r="12" fill="#FDC134" />
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M11.711 4.774H5.548V9.419H4V11.484H5.548V12.516H4V14.581H5.548V19.226H11.711C14.808 19.226 17.445 17.295 18.493 14.581H20V12.516H18.947C18.971 12.172 18.971 11.828 18.947 11.484H20V9.419H18.493C17.445 6.705 14.803 4.774 11.711 4.774ZM16.872 12.516C16.907 12.173 16.907 11.827 16.872 11.484H7.613V12.516H16.878H16.872ZM7.613 14.581V17.161H11.597C13.559 17.161 15.277 16.124 16.191 14.581H7.613ZM7.613 9.419H16.196C15.277 7.876 13.564 6.839 11.603 6.839H7.613V9.419Z"
          fill="white"
        />
      </g>
    </svg>
  );
}
