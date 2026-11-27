import type { ComponentProps } from "react";

// Fogo (FOGO) logo, from web3icons (https://github.com/0xa3k5/web3icons, MIT),
// raw-svgs/tokens/background/FOGO.svg, with its square background made circular.
export function FogoIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" width="64" height="64" fill="none" {...props}>
      <defs>
        <clipPath id="fogo-clip">
          <circle cx="12" cy="12" r="12" />
        </clipPath>
      </defs>
      <g clipPath="url(#fogo-clip)">
        <circle cx="12" cy="12" r="12" fill="#FF3D00" />
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M12 20C16.418 20 20 16.418 20 12C20 7.582 16.418 4 12 4C7.582 4 4 7.582 4 12C4 16.418 7.582 20 12 20ZM14.653 7.267H11.355L10.883 9.162H9.458L8.86 11.565C8.841 11.639 8.84 11.717 8.855 11.792C8.871 11.867 8.904 11.938 8.951 11.998C8.998 12.059 9.059 12.108 9.127 12.141C9.196 12.175 9.272 12.193 9.348 12.193H10.553L9.423 16.733L13.266 12.667C13.57 12.345 13.343 11.814 12.901 11.814H11.063L11.629 9.54H14.731L15.14 7.895C15.159 7.82 15.16 7.743 15.145 7.668C15.129 7.593 15.096 7.522 15.049 7.462C15.002 7.401 14.942 7.352 14.873 7.318C14.804 7.285 14.729 7.267 14.653 7.267Z"
          fill="white"
        />
      </g>
    </svg>
  );
}
