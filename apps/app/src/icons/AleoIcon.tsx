import type { ComponentProps } from "react";

// Aleo (ALEO) logo, from web3icons (https://github.com/0xa3k5/web3icons, MIT),
// raw-svgs/tokens/background/ALEO.svg, with its square background made circular.
export function AleoIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" width="64" height="64" fill="none" {...props}>
      <defs>
        <clipPath id="aleo-clip">
          <circle cx="12" cy="12" r="12" />
        </clipPath>
      </defs>
      <g clipPath="url(#aleo-clip)">
        <circle cx="12" cy="12" r="12" fill="#111111" />
        <path
          d="M13.977 4H10.292L7.094 13.354H9.041L11.632 5.723H12.57L15.161 13.354H9.041L8.439 15.077H15.742L17.416 20H19.426L13.977 4ZM4.821 20H6.764L8.439 15.077H6.504L4.821 20ZM5.163 13.354L4.574 15.077H6.504L7.094 13.354H5.163Z"
          fill="white"
        />
      </g>
    </svg>
  );
}
