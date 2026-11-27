import type { ComponentProps } from "react";

// Solana (SOL) logo, from web3icons (https://github.com/0xa3k5/web3icons, MIT),
// raw-svgs/tokens/background/SOL.svg, with its square background made circular.
export function SolanaIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" width="64" height="64" fill="none" {...props}>
      <defs>
        <clipPath id="solana-clip">
          <circle cx="12" cy="12" r="12" />
        </clipPath>
        <linearGradient
          id="solana-0"
          x1="4"
          y1="15.841"
          x2="20.384"
          y2="15.192"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#599DB0" />
          <stop offset="1" stopColor="#47F8C3" />
        </linearGradient>
      </defs>
      <g clipPath="url(#solana-clip)">
        <circle cx="12" cy="12" r="12" fill="url(#solana-0)" />
        <path
          d="M17.7 8.357C17.6 8.447 17.47 8.502 17.335 8.502H4.515C4.06 8.502 3.83 7.982 4.145 7.677L6.25 5.647C6.35 5.552 6.48 5.497 6.615 5.497H19.485C19.945 5.497 20.17 6.022 19.85 6.327L17.7 8.357Z"
          fill="white"
        />
        <path
          d="M17.7 18.363C17.6 18.453 17.47 18.503 17.335 18.503H4.515C4.06 18.503 3.83 17.988 4.145 17.683L6.25 15.648C6.35 15.553 6.48 15.503 6.615 15.503H19.485C19.945 15.503 20.17 16.023 19.85 16.328L17.7 18.363Z"
          fill="white"
        />
        <path
          d="M17.7 10.643C17.6 10.553 17.47 10.503 17.335 10.503H4.515C4.06 10.503 3.83 11.018 4.145 11.323L6.25 13.358C6.35 13.448 6.48 13.503 6.615 13.503H19.485C19.945 13.503 20.17 12.983 19.85 12.678L17.7 10.643Z"
          fill="white"
        />
      </g>
    </svg>
  );
}
