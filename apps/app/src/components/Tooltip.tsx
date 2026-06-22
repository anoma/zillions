import { twMerge } from "tailwind-merge";

export type TooltipProps = {
  children: React.ReactNode;
  position?: "top" | "bottom" | "left" | "right";
} & React.ComponentPropsWithoutRef<"span">;

// Use group/tooltip class in the parent element that will trigger the Tooltip
export function Tooltip({
  children,
  className = "",
  position = "top",
  ...props
}: TooltipProps) {
  return (
    <span
      className={twMerge(
        "flex bg-surface text-xs absolute opacity-0 pointer-events-none",
        "text-black px-4 py-1",
        "border border-gray-600",
        "transition-all duration-500 ease-out-expo",
        "group-hover/tooltip:visible group-hover/tooltip:opacity-100",
        "group-hover/tooltip:pointer-events-auto",
        "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
        position === "top" &&
          "top-0 -translate-y-[calc(100%-10px)]  group-hover/tooltip:-translate-y-full",
        position === "bottom" &&
          "top-auto bottom-0 translate-y-[calc(100%-10px)] group-hover/tooltip:translate-y-full",
        position === "left" &&
          "left-0 -translate-x-[calc(100%-10px)] group-hover/tooltip:-translate-x-full",
        position === "right" &&
          "left-auto right-0 translate-x-[calc(100%-10px)] group-hover/tooltip:translate-x-full",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
