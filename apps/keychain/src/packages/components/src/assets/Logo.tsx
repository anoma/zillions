import { ComponentPropsWithoutRef } from "react";

type LogoProps = ComponentPropsWithoutRef<"svg">;

export const Logo = ({ ...props }: LogoProps) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 257 136"
      {...props}
    >
      <g fill="#000" clipPath="url(#logo-a)">
        <path d="M38.17 110.47 196.559 0H0v.742h143.714c18.492 0 27.755 15.592 14.679 24.712L0 135.924h196.518v-.742H52.845c-18.492 0-27.754-15.592-14.678-24.712z" />
        <path d="M68.03 110.47 226.423 0H29.863v.742h143.715c18.492 0 27.754 15.592 14.678 24.712L29.864 135.924H226.38v-.742H82.711c-18.491 0-27.753-15.592-14.678-24.712z" />
        <path d="M97.894 110.47 256.284 0H59.724v.742H203.44c18.491 0 27.754 15.592 14.678 24.712L59.724 135.924h196.518v-.742H112.573c-18.492 0-27.755-15.592-14.679-24.712" />
      </g>
      <defs>
        <clipPath id="logo-a">
          <path fill="#fff" d="M0 0h256.284v135.924H0z" />
        </clipPath>
      </defs>
    </svg>
  );
};
