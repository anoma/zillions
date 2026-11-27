import type { ComponentProps } from "react";

// Sweat Economy (SWEAT) logo, from web3icons (https://github.com/0xa3k5/web3icons, MIT),
// raw-svgs/tokens/background/SWEAT.svg, with its square background made circular.
export function SweatIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" width="64" height="64" fill="none" {...props}>
      <defs>
        <clipPath id="sweat-clip">
          <circle cx="12" cy="12" r="12" />
        </clipPath>
      </defs>
      <g clipPath="url(#sweat-clip)">
        <circle cx="12" cy="12" r="12" fill="#FF0D74" />
        <path
          d="M15.52 5.882H13.054L11.087 8.061L9.939 5.882H7.379L4 9.628V9.694L8.447 18.118H10.955L12.889 15.967L14.028 18.118H16.631L20 14.376L15.52 5.882ZM9.826 16.165L6.565 9.986L8.541 7.798L11.798 13.972L9.821 16.165H9.826ZM15.44 16.23L12.179 10.056L14.155 7.868L17.416 14.047L15.44 16.23Z"
          fill="white"
        />
      </g>
    </svg>
  );
}
