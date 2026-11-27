import type { ComponentProps } from "react";

// NEAR Protocol (NEAR) logo, from web3icons (https://github.com/0xa3k5/web3icons, MIT),
// raw-svgs/tokens/background/NEAR.svg, with its square background made circular.
export function NearIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" width="64" height="64" fill="none" {...props}>
      <defs>
        <clipPath id="near-clip">
          <circle cx="12" cy="12" r="12" />
        </clipPath>
      </defs>
      <g clipPath="url(#near-clip)">
        <circle cx="12" cy="12" r="12" fill="#00EC97" />
        <path
          d="M16.823 4.817L13.48 9.777C13.251 10.12 13.697 10.52 14.017 10.24L16.931 7.383C17.017 7.309 17.143 7.36 17.143 7.486V16.429C17.143 16.549 16.983 16.6 16.914 16.514L7.337 4.606C7.181 4.413 6.983 4.259 6.758 4.154C6.533 4.049 6.288 3.997 6.04 4C5.011 4 4 4.52 4 5.709V18.286C4.002 18.656 4.125 19.016 4.349 19.311C4.574 19.606 4.888 19.82 5.245 19.92C5.601 20.021 5.981 20.003 6.326 19.869C6.672 19.735 6.964 19.492 7.16 19.177L10.497 14.217C10.726 13.874 10.286 13.474 9.966 13.754L7.069 16.669C6.983 16.743 6.857 16.692 6.857 16.566V7.646C6.857 7.52 7.017 7.474 7.086 7.56L16.646 19.394C16.966 19.789 17.446 20 17.943 20C18.977 20 20 19.486 20 18.291V5.714C19.999 5.341 19.877 4.978 19.651 4.68C19.425 4.383 19.108 4.167 18.749 4.066C18.389 3.965 18.006 3.985 17.659 4.121C17.311 4.258 17.017 4.504 16.823 4.823V4.817Z"
          fill="white"
        />
      </g>
    </svg>
  );
}
