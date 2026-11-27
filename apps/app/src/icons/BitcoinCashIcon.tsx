import type { ComponentProps } from "react";

// Bitcoin Cash (BCH) logo, from web3icons (https://github.com/0xa3k5/web3icons, MIT),
// raw-svgs/tokens/background/BCH.svg, with its square background made circular.
export function BitcoinCashIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" width="64" height="64" fill="none" {...props}>
      <defs>
        <clipPath id="bitcoin-cash-clip">
          <circle cx="12" cy="12" r="12" />
        </clipPath>
      </defs>
      <g clipPath="url(#bitcoin-cash-clip)">
        <circle cx="12" cy="12" r="12" fill="#58BE92" />
        <path
          d="M16.128 7.631C15.512 6.054 13.953 5.91 12.133 6.27L11.49 4L10.11 4.4L10.744 6.589L9.647 6.921L9.014 4.706L7.647 5.106L8.29 7.353L7.414 7.622V7.618L5.521 8.157L5.939 9.622C5.939 9.622 6.951 9.308 6.942 9.335C7.495 9.173 7.769 9.447 7.904 9.712L8.641 12.279L8.789 12.256L8.641 12.297L9.674 15.901C9.701 16.081 9.674 16.387 9.292 16.499C9.31 16.508 8.29 16.791 8.29 16.791L8.488 18.508L10.272 17.995L11.261 17.721L11.917 20L13.279 19.605L12.641 17.353L13.737 17.047L14.38 19.294L15.76 18.899L15.104 16.62C17.373 15.825 18.825 14.777 18.407 12.553C18.065 10.764 17.018 10.216 15.62 10.283C16.295 9.64 16.587 8.791 16.137 7.631H16.128ZM15.616 13.07C16.097 14.777 13.126 15.416 12.2 15.69L11.333 12.665C12.263 12.396 15.104 11.294 15.616 13.07ZM13.755 8.975C14.196 10.535 11.706 11.047 10.928 11.272L10.142 8.53C10.919 8.31 13.288 7.362 13.755 8.984V8.975Z"
          fill="white"
        />
      </g>
    </svg>
  );
}
