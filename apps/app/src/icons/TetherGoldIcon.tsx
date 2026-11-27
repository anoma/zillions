import type { ComponentProps } from "react";

// Tether Gold (XAUt) logo, from web3icons (https://github.com/0xa3k5/web3icons, MIT),
// raw-svgs/tokens/background/XAUT.svg, with its square background made circular.
export function TetherGoldIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" width="64" height="64" fill="none" {...props}>
      <defs>
        <clipPath id="tether-gold-clip">
          <circle cx="12" cy="12" r="12" />
        </clipPath>
      </defs>
      <g clipPath="url(#tether-gold-clip)">
        <circle cx="12" cy="12" r="12" fill="black" />
        <path
          d="M12 12C14.43 12 16.4 11.642 16.4 11.2C16.4 10.758 14.43 10.4 12 10.4C9.57 10.4 7.6 10.758 7.6 11.2C7.6 11.642 9.57 12 12 12Z"
          fill="white"
        />
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M17.006 4.8H6.972L4 11.322L12 19.2L20 11.322L17.006 4.8ZM12.8 12.383C15.071 12.288 16.802 11.795 16.802 11.2C16.802 10.537 14.652 10 12.002 10C9.351 10 7.202 10.537 7.202 11.2C7.202 11.794 8.931 12.288 11.2 12.383V16H12.8V12.383Z"
          fill="white"
        />
        <path
          d="M15.6 7.2H8.4V8.8H11.2V11.6H12.8V8.8H15.6V7.2Z"
          fill="#DDA85B"
        />
      </g>
    </svg>
  );
}
