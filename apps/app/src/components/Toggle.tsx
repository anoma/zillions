import type { ComponentPropsWithoutRef } from "react";
import { twMerge } from "tailwind-merge";

type ToggleProps = Omit<ComponentPropsWithoutRef<"button">, "onChange"> & {
  active?: boolean;
  toggleClassname?: string;
  onChange?: (active: boolean) => void;
};

export const Toggle = ({
  active = false,
  onChange,
  className,
  toggleClassname,
  disabled,
  children,
  ...props
}: ToggleProps) => {
  const handleClick = () => {
    if (!disabled) {
      onChange?.(!active);
    }
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      disabled={disabled}
      onClick={handleClick}
      className={twMerge(
        "@container group block",
        "relative h-7 w-11 p-0.5 rounded-full cursor-pointer",
        "border border-line-strong",
        "transition-colors duration-300 ease-out",
        "bg-card",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black",
        disabled && "opacity-30 cursor-not-allowed",
        className,
      )}
      {...props}
    >
      <span
        className={twMerge(
          "flex items-center justify-center",
          "h-[calc(100%)] aspect-square rounded-full bg-gold",
          "transition-all duration-200 ease-decelerate",
          active && "translate-x-[calc(100cqw-100%)]",
          toggleClassname,
        )}
      />
      <div className="absolute inset-0">{children}</div>
    </button>
  );
};
