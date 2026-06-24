import type { ComponentProps } from "react";
import { twMerge } from "tailwind-merge";

export function ActionButton(props: ComponentProps<"button">) {
  return (
    <button
      {...props}
      className={twMerge(
        "bg-gold py-2 px-6 rounded-full cursor-pointer",
        props.className,
      )}
    />
  );
}
