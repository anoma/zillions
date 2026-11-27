import type { ComponentProps } from "react";

// Aurora (AURORA) logo, from web3icons (https://github.com/0xa3k5/web3icons, MIT),
// raw-svgs/tokens/background/AURORA.svg, with its square background made circular.
export function AuroraIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" width="64" height="64" fill="none" {...props}>
      <defs>
        <clipPath id="aurora-clip">
          <circle cx="12" cy="12" r="12" />
        </clipPath>
        <linearGradient
          id="aurora-0"
          x1="16.969"
          y1="5.951"
          x2="7.493"
          y2="18.537"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#95E141" />
          <stop offset="0.59" stopColor="#63B836" />
          <stop offset="1" stopColor="#409C2D" />
        </linearGradient>
      </defs>
      <g clipPath="url(#aurora-clip)">
        <circle cx="12" cy="12" r="12" fill="url(#aurora-0)" />
        <path
          d="M13.671 6.379C13.518 6.066 13.279 5.803 12.983 5.619C12.687 5.435 12.345 5.337 11.997 5.337C11.648 5.337 11.307 5.435 11.011 5.619C10.715 5.803 10.476 6.066 10.322 6.379L5.266 15.963C5.123 16.248 5.055 16.565 5.069 16.884C5.084 17.203 5.179 17.512 5.347 17.784C5.515 18.055 5.75 18.278 6.029 18.433C6.308 18.588 6.622 18.668 6.941 18.668H17.053C17.372 18.668 17.686 18.588 17.965 18.433C18.244 18.278 18.478 18.055 18.646 17.784C18.814 17.512 18.91 17.203 18.924 16.884C18.938 16.565 18.871 16.248 18.728 15.963L13.671 6.379ZM9.367 5.899C9.61 5.409 9.985 4.996 10.449 4.708C10.914 4.419 11.45 4.266 11.997 4.266C12.544 4.266 13.08 4.419 13.544 4.708C14.009 4.996 14.384 5.409 14.626 5.899L19.688 15.483C19.913 15.932 20.02 16.43 19.997 16.931C19.975 17.433 19.824 17.92 19.56 18.346C19.296 18.773 18.926 19.124 18.488 19.367C18.049 19.61 17.555 19.736 17.053 19.734H6.941C6.44 19.733 5.948 19.605 5.511 19.361C5.073 19.118 4.705 18.767 4.442 18.341C4.178 17.916 4.027 17.43 4.003 16.93C3.98 16.43 4.084 15.932 4.306 15.483L9.367 5.904V5.899Z"
          fill="white"
        />
      </g>
    </svg>
  );
}
