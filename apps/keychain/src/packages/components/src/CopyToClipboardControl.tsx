import { copyToClipboard } from "@zillions/utils";
import { useState } from "react";
import { GoCheckCircle, GoCopy } from "react-icons/go";
import { twMerge } from "tailwind-merge";

type CopyToClipboardControlIcon = {
  value: string;
  className?: string;
  children?: React.ReactNode;
};

export const CopyToClipboardControl = ({
  value,
  className,
  children,
}: CopyToClipboardControlIcon) => {
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
    copyToClipboard(value || "");
    showConfirmation();
  };

  return (
    <div
      className={twMerge(
        "relative flex items-center gap-2 active:top-px",
        className
      )}
      role="button"
      aria-labelledby="Copy to clipboard"
      onClick={onClick}
    >
      {children}
      {copied ?
        <div className="animate-pop-in">
          <GoCheckCircle className="w-[18px] h-[18px]" />
        </div>
      : <GoCopy className="w-[18px] h-[18px]" />}
    </div>
  );
};
