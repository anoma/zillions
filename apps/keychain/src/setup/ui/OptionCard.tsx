import clsx from "clsx";
import { GoChevronRight } from "react-icons/go";

type OptionCardProps = {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
  /** Shows a chevron: the choice opens a further list. */
  more?: boolean;
  /** Greys the card and stops clicks (ActionButton's disabled idiom). */
  disabled?: boolean;
  "data-testid"?: string;
};

/** A full-width choice card: icon, title and one line of explanation. */
export const OptionCard = ({
  icon,
  title,
  subtitle,
  onClick,
  more,
  disabled = false,
  ...props
}: OptionCardProps) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className={clsx(
      "group flex items-center gap-5 w-full min-h-[72px] px-5 py-4 rounded-xl text-left",
      "bg-white dark:bg-card text-black hover:bg-gold hover:text-rblack",
      "cursor-pointer outline-none transition-[background-color,color,box-shadow,translate] duration-300 ease-out-quart",
      "hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-12px_rgb(0_0_0/0.25)]",
      "active:translate-y-0 active:shadow-none",
      "focus-visible:ring-2 focus-visible:ring-black/40",
      "disabled:pointer-events-none disabled:cursor-auto disabled:opacity-25",
    )}
    {...props}
  >
    <span
      className={clsx(
        "flex justify-center items-center size-6 shrink-0 text-[22px]",
        "transition-[scale] duration-200 ease-out-quart group-hover:scale-110",
      )}
    >
      {icon}
    </span>
    <span className="flex-1 min-w-0">
      <span className="block text-[15px] font-medium leading-snug">
        {title}
      </span>
      <span className="block mt-0.5 text-xs font-medium text-muted transition-colors duration-200 group-hover:text-rblack/75">
        {subtitle}
      </span>
    </span>
    {more && (
      <GoChevronRight className="size-5 shrink-0 transition-transform group-hover:translate-x-0.5" />
    )}
  </button>
);
