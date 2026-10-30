import clsx from "clsx";
import { twMerge } from "tailwind-merge";
import { GoChevronRight } from "react-icons/go";

/** Small caps label above a group of rows. */
export const Eyebrow = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <h2
    className={twMerge(
      "m-0 mt-[18px] mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted",
      className
    )}
  >
    {children}
  </h2>
);

/** A titled group of rows. */
export const Section = ({
  title,
  className,
  children,
}: {
  title: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) => (
  <section data-section className={className}>
    <Eyebrow>{title}</Eyebrow>
    <div data-section-body>{children}</div>
  </section>
);

type RowProps = {
  lead?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  trail?: React.ReactNode;
  /** Shows a chevron and makes the whole row a button. */
  onClick?: () => void;
  className?: string;
} & Omit<React.ComponentPropsWithoutRef<"div">, "title" | "onClick">;

/** A flat full-width list row with a hairline below it. */
export const Row = ({
  lead,
  title,
  subtitle,
  trail,
  onClick,
  className,
  ...props
}: RowProps) => (
  <div
    role={onClick ? "button" : undefined}
    tabIndex={onClick ? 0 : undefined}
    onClick={onClick}
    onKeyDown={
      onClick
        ? (e) => {
            if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              onClick();
            }
          }
        : undefined
    }
    className={clsx(
      "flex items-center gap-3 min-h-14 py-3 border-b border-line last:border-b-0",
      // Full-bleed hover behind the content; the hairline keeps its inset.
      onClick && [
        "relative isolate cursor-pointer group outline-none",
        "before:absolute before:inset-y-0 before:-inset-x-5 before:-z-10 before:bg-black/[0.035]",
        "before:opacity-0 before:transition-opacity hover:before:opacity-100 focus-visible:before:opacity-100",
      ],
      className
    )}
    {...props}
  >
    {lead}
    <div className="flex-1 min-w-0">
      <div className="text-[13px] font-semibold truncate">{title}</div>
      {subtitle && (
        <div className="mt-0.5 text-[11.5px] font-medium text-muted truncate">
          {subtitle}
        </div>
      )}
    </div>
    {trail}
    {onClick && !trail && (
      <GoChevronRight className="size-4 shrink-0 text-line-strong transition-transform group-hover:translate-x-0.5 group-hover:text-muted" />
    )}
  </div>
);

/** Rows on a card, for grouped values (approval receipts). */
export const Card = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={clsx("bg-card rounded-xl px-3.5", className)}>{children}</div>
);

/** A label and its value on one line. */
export const KeyValue = ({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) => (
  <div className="flex justify-between gap-4 py-[11px] border-b border-line last:border-b-0 text-[12.5px]">
    <span className="shrink-0 font-medium text-muted">{label}</span>
    <span className="min-w-0 text-right font-medium break-all">{children}</span>
  </div>
);

export const Footer = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <footer className={clsx(className, "mt-auto flex justify-between items-center gap-3 pt-3 pb-4 text-[11px] font-medium text-muted [&_a]:hover:text-black [&_button]:hover:text-black")}>
    {children}
  </footer>
);
