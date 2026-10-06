import { ReactNode } from "react";

type SummaryRowProps = {
  label: ReactNode;
  children: ReactNode;
};

/** One labelled value in a summary card: label above, value below. */
export const SummaryRow = ({ label, children }: SummaryRowProps) => (
  <div className="flex flex-col gap-0.5 px-4 py-3">
    <span className="text-xs text-neutral-600">{label}</span>
    <span className="text-base text-black break-all text-sm">{children}</span>
  </div>
);
