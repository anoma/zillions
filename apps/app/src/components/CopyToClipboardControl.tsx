import { useState } from "react";
import { GoCheckCircle, GoCopy } from "react-icons/go";
import { twMerge } from "tailwind-merge";

type CopyToClipboardControlIcon = {
  value: string;
  className?: string;
  children?: React.ReactNode;
};

export function CopyToClipboardControl({
  value,
  className,
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

  const onClick = (e: React.MouseEvent): void => {
    e.preventDefault();
    if (copied) return;
    navigator.clipboard.writeText(value);
    showConfirmation();
  };

  return (
    <div
      className={twMerge(
        "relative flex items-center gap-2 active:top-px cursor-pointer",
        className,
      )}
      role="button"
      aria-labelledby="Copy to clipboard"
      onClick={onClick}
    >
      {children}
      {copied ? (
        <GoCheckCircle className="size-5 animate-pop-in" />
      ) : (
        <GoCopy className="size-5" />
      )}
    </div>
  );
}
