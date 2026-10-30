import { copyToClipboard } from "@zillions/utils";
import { useEffect, useState } from "react";
import { GoCheck, GoCopy } from "react-icons/go";

type CopyButtonProps = {
  value: string;
  label?: string;
  /** Text button instead of an icon. */
  children?: React.ReactNode;
  className?: string;
};

export const CopyButton = ({ value, label = "Copy", children, className }: CopyButtonProps) => {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const onClick = (e: React.MouseEvent): void => {
    e.stopPropagation();
    copyToClipboard(value);
    setCopied(true);
  };

  if (children) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {copied ? "Copied" : children}
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : label}
      title={label}
      onClick={onClick}
      className="size-7 shrink-0 grid place-items-center rounded-lg text-ink-2 cursor-pointer hover:bg-black/5 [&_svg]:size-[15px]"
    >
      {copied ? <GoCheck className="animate-pop-in" /> : <GoCopy />}
    </button>
  );
};
