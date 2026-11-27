import type { ComponentProps } from "react";

// Abstract logo, from web3icons (https://github.com/0xa3k5/web3icons, MIT),
// raw-svgs/networks/background/abstract.svg, with its square background made circular.
export function AbstractIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" width="64" height="64" fill="none" {...props}>
      <defs>
        <clipPath id="abstract-clip">
          <circle cx="12" cy="12" r="12" />
        </clipPath>
      </defs>
      <g clipPath="url(#abstract-clip)">
        <circle cx="12" cy="12" r="12" fill="#054729" />
        <path
          d="M14.532 14.467L17.741 17.646L16.235 19.137L13.027 15.959C12.891 15.824 12.731 15.718 12.554 15.646C12.378 15.573 12.189 15.537 11.998 15.538C11.608 15.538 11.246 15.686 10.97 15.959L7.762 19.138L6.256 17.646L9.464 14.467H14.532ZM15.067 13.551L19.45 14.713L20 12.674L15.618 11.512C15.434 11.464 15.261 11.38 15.109 11.265C14.958 11.15 14.831 11.005 14.735 10.841C14.639 10.678 14.577 10.497 14.552 10.309C14.527 10.122 14.54 9.931 14.59 9.748L15.763 5.408L13.705 4.862L12.531 9.203L15.065 13.549L15.067 13.551ZM8.933 13.551L4.55 14.713L4 12.674L8.382 11.512C8.566 11.464 8.739 11.38 8.891 11.265C9.042 11.15 9.169 11.005 9.265 10.841C9.361 10.678 9.423 10.497 9.448 10.309C9.473 10.122 9.46 9.931 9.41 9.748L8.237 5.408L10.295 4.862L11.468 9.203L8.935 13.549L8.933 13.551Z"
          fill="white"
        />
      </g>
    </svg>
  );
}
