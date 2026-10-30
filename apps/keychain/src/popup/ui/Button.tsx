import { twMerge } from "tailwind-merge";
import { tv, type VariantProps } from "tailwind-variants";

const button = tv({
  base: [
    "inline-flex items-center justify-center gap-2 rounded-pill font-semibold",
    "cursor-pointer select-none transition-[background-color,opacity,transform] duration-150",
    "active:scale-[0.98] disabled:opacity-35 disabled:pointer-events-none",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
  ],
  variants: {
    variant: {
      primary: "bg-black text-white hover:bg-black/85",
      secondary:
        "border border-line-strong text-black bg-transparent hover:bg-black/5",
      danger: "bg-danger text-white hover:bg-danger/90",
      gold: "bg-gold text-[#111] hover:bg-gold/85",
      appOutline:
        "border-[1.5px] border-app-accent text-app-accent bg-transparent hover:bg-black/5 dark:hover:bg-gold-soft",
    },
    size: {
      md: "h-[38px] px-[18px] text-[13px]",
      sm: "h-[30px] px-3 text-xs",
    },
    block: { true: "w-full" },
  },
  defaultVariants: { variant: "primary", size: "md" },
});

/** Button styling for a link that should look like one. */
export const buttonClass = (props: VariantProps<typeof button> = {}): string =>
  button(props);

type ButtonProps = VariantProps<typeof button> &
  React.ComponentPropsWithoutRef<"button">;

/** `type` defaults to "button": several screens wrap content in a form. */
export const Button = ({
  variant,
  size,
  block,
  className,
  type = "button",
  ...props
}: ButtonProps) => (
  <button
    type={type}
    className={twMerge(button({ variant, size, block }), className)}
    {...props}
  />
);

/**
 * Reject and approve, side by side, at the foot of a screen; stays in view
 * while a long approval scrolls under it.
 */
export const ActionBar = ({ children }: { children: React.ReactNode }) => (
  <div className="sticky bottom-0 mt-auto -mx-5 grid grid-cols-2 gap-2.5 bg-surface px-5 pt-4 pb-5 shadow-[0_-12px_12px_-4px_var(--color-surface)]">
    {children}
  </div>
);
