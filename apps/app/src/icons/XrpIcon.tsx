import type { ComponentProps } from "react";

// XRP (XRP) logo, from web3icons (https://github.com/0xa3k5/web3icons, MIT),
// raw-svgs/tokens/background/XRP.svg, with its square background made circular.
export function XrpIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" width="64" height="64" fill="none" {...props}>
      <defs>
        <clipPath id="xrp-clip">
          <circle cx="12" cy="12" r="12" />
        </clipPath>
      </defs>
      <g clipPath="url(#xrp-clip)">
        <circle cx="12" cy="12" r="12" fill="black" />
        <path
          d="M17.654 5H19.969L15.152 10.139C14.746 10.568 14.258 10.91 13.716 11.145C13.174 11.38 12.59 11.502 12 11.505C11.409 11.502 10.826 11.38 10.284 11.145C9.742 10.91 9.254 10.568 8.848 10.139L4.023 5H6.346L10.002 8.936C11.072 10.072 12.927 10.072 13.998 8.936L17.654 5ZM6.315 18.992H4L8.847 13.868C9.254 13.44 9.743 13.097 10.286 12.863C10.828 12.628 11.412 12.505 12.003 12.502C12.595 12.505 13.179 12.628 13.721 12.863C14.264 13.098 14.753 13.44 15.159 13.869L20 19H17.684L14.006 15.079C12.935 13.944 11.081 13.944 10.01 15.079L6.315 18.992Z"
          fill="white"
        />
      </g>
    </svg>
  );
}
