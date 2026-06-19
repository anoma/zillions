import type { ComponentPropsWithoutRef } from "react";

export function ActionButton(props: ComponentPropsWithoutRef<"button">) {
  return (
    <button
      className="bg-gold py-2 px-6 rounded-full cursor-pointer"
      {...props}
    />
  );
}
