import type { ComponentProps } from "react";

// Safe (SAFE) logo, from web3icons (https://github.com/0xa3k5/web3icons, MIT),
// raw-svgs/tokens/background/SAFE.svg, with its square background made circular.
export function SafeIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" width="64" height="64" fill="none" {...props}>
      <defs>
        <clipPath id="safe-clip">
          <circle cx="12" cy="12" r="12" />
        </clipPath>
      </defs>
      <g clipPath="url(#safe-clip)">
        <circle cx="12" cy="12" r="12" fill="#049F67" />
        <path
          d="M7.611 8.549C7.611 8.031 8.031 7.611 8.549 7.611H15.447C15.965 7.611 16.385 7.191 16.385 6.673V4.938C16.385 4.42 15.965 4 15.447 4H8.149C7.631 4 7.211 4.42 7.211 4.938V6.275C7.211 6.793 6.792 7.213 6.273 7.213H4.938C4.42 7.213 4 7.633 4 8.151V11.078C4 11.596 4.422 11.995 4.94 11.995H6.675C7.193 11.995 7.613 11.575 7.613 11.057L7.611 8.549Z"
          fill="white"
        />
        <path
          d="M19.061 11.995H17.327C16.809 11.995 16.389 12.415 16.389 12.933V15.451C16.389 15.969 15.969 16.389 15.451 16.389H8.549C8.031 16.389 7.611 16.809 7.611 17.327V19.062C7.611 19.58 8.031 20 8.549 20H15.851C16.369 20 16.783 19.58 16.783 19.062V17.67C16.783 17.152 17.202 16.784 17.721 16.784H19.061C19.58 16.784 20 16.364 20 15.846V12.922C20 12.404 19.58 11.995 19.061 11.995Z"
          fill="white"
        />
        <path
          d="M12.85 10.171H11.183C10.641 10.171 10.2 10.612 10.2 11.155V12.821C10.2 13.364 10.64 13.805 11.183 13.805H12.85C13.392 13.805 13.833 13.364 13.833 12.821V11.155C13.833 10.612 13.393 10.171 12.85 10.171Z"
          fill="white"
        />
      </g>
    </svg>
  );
}
