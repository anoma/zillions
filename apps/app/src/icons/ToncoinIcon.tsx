import type { ComponentProps } from "react";

// Toncoin (TON) logo, from web3icons (https://github.com/0xa3k5/web3icons, MIT),
// raw-svgs/tokens/background/TON.svg, with its square background made circular.
export function ToncoinIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" width="64" height="64" fill="none" {...props}>
      <defs>
        <clipPath id="toncoin-clip">
          <circle cx="12" cy="12" r="12" />
        </clipPath>
      </defs>
      <g clipPath="url(#toncoin-clip)">
        <circle cx="12" cy="12" r="12" fill="#0088CC" />
        <path
          d="M19.699 7.751L12.725 18.857C12.64 18.991 12.522 19.101 12.383 19.178C12.244 19.254 12.088 19.294 11.929 19.294C11.769 19.295 11.612 19.254 11.472 19.177C11.332 19.099 11.214 18.988 11.129 18.852L4.292 7.746C4.1 7.435 3.999 7.076 4 6.711C4.009 6.171 4.231 5.657 4.618 5.281C5.006 4.906 5.526 4.699 6.066 4.706H17.944C19.078 4.706 20 5.6 20 6.706C20 7.073 19.896 7.436 19.699 7.751ZM5.972 7.379L11.059 15.224V6.589H6.504C5.976 6.589 5.741 6.937 5.972 7.379ZM12.941 15.224L18.028 7.379C18.264 6.937 18.023 6.589 17.497 6.589H12.941V15.224Z"
          fill="white"
        />
      </g>
    </svg>
  );
}
