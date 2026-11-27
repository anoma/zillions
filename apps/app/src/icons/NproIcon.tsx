import type { ComponentProps } from "react";

// NPRO (NPRO) logo, from web3icons (https://github.com/0xa3k5/web3icons, MIT),
// raw-svgs/tokens/background/NPRO.svg, with its square background made circular.
export function NproIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" width="64" height="64" fill="none" {...props}>
      <defs>
        <clipPath id="npro-clip">
          <circle cx="12" cy="12" r="12" />
        </clipPath>
        <linearGradient
          id="npro-0"
          x1="0"
          y1="0"
          x2="24"
          y2="24"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#9498FE" />
          <stop offset="1" stopColor="#1BD6D5" />
        </linearGradient>
      </defs>
      <g clipPath="url(#npro-clip)">
        <circle cx="12" cy="12" r="12" fill="url(#npro-0)" />
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M10.63 4L5.269 11.645L5.146 12.151L10.63 19.988L10.783 19.948L10.792 19.746L6.985 13.648L6.747 13.062L7.086 13.147L8.313 13.873L11.035 18.275L11.149 18.125L10.946 17.62L9.288 14.277L9.212 13.94L9.415 13.848L14.782 13.899L14.704 14.277L12.909 17.923L12.842 18.227L12.959 18.278L15.604 13.974L15.794 13.756L17.217 13.062L17.173 13.366L13.197 19.746L13.189 19.948L13.364 20L18.73 12.356L18.853 11.848L13.517 4.152L13.263 4.008L13.173 4.152L13.364 4.529L17.611 11.341L17.725 11.645L17.663 11.848L16.099 12.7L15.791 12.759L13.384 7.291L12.959 6.575L12.845 6.684L12.924 7.089L14.73 12.151L14.93 12.962L9.112 12.972L9.098 12.759L11.208 6.785L11.035 6.575L8.249 12.759L7.897 12.721L6.418 11.948L6.262 11.747L6.328 11.443L10.796 4.253L10.803 4.051L10.63 4Z"
          fill="white"
        />
      </g>
    </svg>
  );
}
