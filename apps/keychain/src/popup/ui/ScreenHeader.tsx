import { GoChevronLeft } from "react-icons/go";

import { useBack } from "./useBack";

type IconButtonProps = {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
};

export const IconButton = ({ label, onClick, children }: IconButtonProps) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={onClick}
    className="size-7 grid place-items-center rounded-lg text-ink-2 cursor-pointer hover:bg-black/5 [&_svg]:size-[17px]"
  >
    {children}
  </button>
);

type ScreenHeaderProps = {
  title?: React.ReactNode;
  /** A back chevron, unless `left` replaces it. */
  back?: boolean;
  left?: React.ReactNode;
  right?: React.ReactNode;
};

export const ScreenHeader = ({ title, back, left, right }: ScreenHeaderProps) => {
  const goBack = useBack();
  return (
    <header className="h-14 shrink-0 grid grid-cols-[28px_1fr_auto] items-center gap-2">
      <div>
        {left ??
          (back && (
            <IconButton label="Back" onClick={goBack}>
              <GoChevronLeft />
            </IconButton>
          ))}
      </div>
      <h1 className="m-0 text-center text-sm font-semibold tracking-[-0.01em] truncate">
        {title}
      </h1>
      <div className="min-w-7 flex justify-end">{right}</div>
    </header>
  );
};
