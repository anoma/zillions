import type { ComponentProps } from "react";

// Robinhood Chain logo, from web3icons (https://github.com/0xa3k5/web3icons, MIT),
// raw-svgs/networks/background/robinhood.svg, with its square background made circular.
export function RobinhoodChainIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" width="64" height="64" fill="none" {...props}>
      <defs>
        <clipPath id="robinhood-chain-clip">
          <circle cx="12" cy="12" r="12" />
        </clipPath>
      </defs>
      <g clipPath="url(#robinhood-chain-clip)">
        <circle cx="12" cy="12" r="12" fill="#CCFF00" />
        <path
          d="M5.597 20H5.967C6.034 20 6.101 19.968 6.124 19.914C8.918 13.13 11.958 9.77 13.866 7.759C13.944 7.673 13.911 7.609 13.798 7.609H10.387C10.264 7.609 10.16 7.656 10.073 7.759L7.627 10.648C7.268 11.076 7.179 11.472 7.179 12.039V14.992C6.382 17.122 5.877 18.566 5.507 19.872C5.484 19.955 5.518 20 5.597 20ZM17.905 4.431C17.378 3.896 14.999 3.875 13.899 4.281C13.671 4.366 13.451 4.509 13.35 4.591C12.34 5.415 11.667 6.068 11.027 6.71C10.948 6.785 10.982 6.86 11.094 6.86H14.876C15.223 6.86 15.425 7.053 15.425 7.384V11.45C15.425 11.557 15.515 11.589 15.582 11.493L17.86 8.658C18.23 8.197 18.343 8.058 18.444 7.416C18.578 6.475 18.5 5.03 17.905 4.431ZM13.024 15.217L14.584 12.767C14.617 12.702 14.629 12.627 14.629 12.574V8.486C14.629 8.379 14.55 8.337 14.472 8.422C12.127 10.915 10.298 13.537 8.604 16.694C8.561 16.773 8.615 16.843 8.716 16.811L12.216 15.784C12.611 15.668 12.834 15.517 13.024 15.217Z"
          fill="#1C180D"
        />
      </g>
    </svg>
  );
}
