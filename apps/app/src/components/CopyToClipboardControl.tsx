import { useState } from "react";
import { GoCheckCircle, GoCopy } from "react-icons/go";
import { twMerge } from "tailwind-merge";

type CopyToClipboardControlIcon = {
  value: string;
  className?: string;
  iconClassName?: string;
  children?: React.ReactNode;
};

export function CopyToClipboardControl({
  value,
  className,
  iconClassName,
  children,
}: CopyToClipboardControlIcon) {
  const [copied, setCopied] = useState(false);

  const showConfirmation = (): void => {
    const timeInMiliseconds = 3000;
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, timeInMiliseconds);
  };

  const copy = (e: React.SyntheticEvent): void => {
    e.preventDefault();
    if (copied) return;
    navigator.clipboard.writeText(value);
    showConfirmation();
  };

  return (
    <div
      className={twMerge(
        "relative flex items-center gap-2 active:top-px cursor-pointer",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black",
        className,
      )}
      role="button"
      tabIndex={0}
      onClick={copy}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && copy(e)}
    >
      {children}
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied" : "Copy"}
      </span>
      {copied ? (
        <GoCheckCircle
          aria-hidden="true"
          className={twMerge("shrink-0 size-5 animate-pop-in", iconClassName)}
        />
      ) : (
        <GoCopy
          aria-hidden="true"
          className={twMerge("shrink-0 size-5", iconClassName)}
        />
      )}
    </div>
  );
}
