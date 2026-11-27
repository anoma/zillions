import type { ComponentProps } from "react";

// BNB / BNB Smart Chain logo, from web3icons (https://github.com/0xa3k5/web3icons, MIT),
// raw-svgs/networks/background/binance-smart-chain.svg, with its square background made circular.
export function BnbIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" width="64" height="64" fill="none" {...props}>
      <defs>
        <clipPath id="bnb-clip">
          <circle cx="12" cy="12" r="12" />
        </clipPath>
      </defs>
      <g clipPath="url(#bnb-clip)">
        <circle cx="12" cy="12" r="12" fill="#F0B90B" />
        <path
          d="M7.635 6.449L12 4L16.364 6.449L14.764 7.356L12 5.809L9.24 7.356L7.635 6.449ZM16.364 9.542L14.764 8.636L12 10.182L9.24 8.636L7.635 9.542V11.351L10.391 12.898V15.987L12 16.893L13.604 15.987V12.898L16.364 11.351V9.542ZM16.364 14.444V12.631L14.764 13.538V15.347L16.364 14.444ZM17.506 15.085L14.746 16.627V18.44L19.111 15.987V11.089L17.506 11.991V15.085ZM15.902 7.996L17.502 8.902V10.711L19.111 9.809V7.996L17.506 7.089L15.902 8V7.996ZM10.391 17.284V19.093L12 20L13.604 19.093V17.289L12 18.191L10.395 17.284H10.391ZM7.635 14.44L9.235 15.347V13.538L7.635 12.631V14.444V14.44ZM10.391 7.996L12 8.902L13.604 7.996L12 7.089L10.395 8L10.391 7.996ZM6.493 8.902L8.098 7.996L6.498 7.089L4.889 8V9.813L6.493 10.716V8.907V8.902ZM6.493 11.991L4.889 11.089V15.987L9.253 18.44V16.622L6.498 15.08V11.987L6.493 11.991Z"
          fill="white"
        />
      </g>
    </svg>
  );
}
