import type { ComponentProps } from "react";

// Tether (USDT) logo, from web3icons (https://github.com/0xa3k5/web3icons, MIT),
// raw-svgs/tokens/background/USDT.svg, with its square background made circular.
export function TetherIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" width="64" height="64" fill="none" {...props}>
      <defs>
        <clipPath id="tether-clip">
          <circle cx="12" cy="12" r="12" />
        </clipPath>
      </defs>
      <g clipPath="url(#tether-clip)">
        <circle cx="12" cy="12" r="12" fill="#009393" />
        <path
          d="M12 18.4L4 10.508L7.052 5.6H16.948L20 10.508L12 18.4ZM12.8 11.2V10.224C14.24 10.296 15.584 10.576 16 10.94C15.516 11.364 13.784 11.672 12 11.672C10.216 11.672 8.484 11.364 8 10.94C8.412 10.576 9.76 10.3 11.2 10.22V11.2H12.8ZM8 10.936V11.524C8.412 11.888 9.756 12.164 11.2 12.244V14.4H12.8V12.24C14.24 12.168 15.588 11.888 16 11.524V10.352C15.588 9.988 14.24 9.708 12.8 9.632V8.8H15.2V7.6H8.8V8.8H11.2V9.632C9.756 9.708 8.412 9.988 8 10.352V10.936Z"
          fill="white"
        />
      </g>
    </svg>
  );
}
