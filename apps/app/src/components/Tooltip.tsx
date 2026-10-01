import { useEffect, useRef, useState } from "react";
import { twMerge } from "tailwind-merge";

export type TooltipProps = {
  children: React.ReactNode;
  content: React.ReactNode;
  position?: "top" | "bottom" | "left" | "right";
  className?: string;
  onClose?: () => void;
};

/** Shows `content` by `children` while a mouse hovers, or toggled by tap on touch; `onClose` fires as it hides. */
export function Tooltip({
  children,
  content,
  className = "",
  position = "top",
  onClose,
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const toggle = (next: boolean) => {
    if (open && !next) onClose?.();
    setOpen(next);
  };

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: PointerEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      setOpen(false);
      onClose?.();
    };
    document.addEventListener("pointerdown", onOutside);
    return () => document.removeEventListener("pointerdown", onOutside);
  }, [open, onClose]);

  return (
    <div
      ref={ref}
      className="relative"
      onPointerEnter={(e) => e.pointerType === "mouse" && toggle(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && toggle(false)}
    >
      <div onPointerUp={(e) => e.pointerType !== "mouse" && toggle(!open)}>
        {children}
      </div>
      <span
        className={twMerge(
          "flex bg-surface text-xs absolute opacity-0 pointer-events-none",
          "text-black",
          "border border-gray-300 rounded-2xl",
          "transition-all",
          open && "visible opacity-100 pointer-events-auto",
          "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
          position === "top" && [
            "top-0 -translate-y-[calc(100%-10px)]",
            open && "-translate-y-full",
          ],
          position === "bottom" && [
            "top-auto bottom-0 translate-y-[calc(100%-10px)]",
            open && "translate-y-full",
          ],
          position === "left" && [
            "left-0 -translate-x-[calc(100%-10px)]",
            open && "-translate-x-full",
          ],
          position === "right" && [
            "left-auto right-0 translate-x-[calc(100%-10px)]",
            open && "translate-x-full",
          ],
          className,
        )}
      >
        {content}
      </span>
    </div>
  );
}
