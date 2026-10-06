import { ReactNode } from "react";

type SummaryHeaderProps = {
  label: ReactNode;
  children: ReactNode;
};

/** What an approval is about, centered: a small label over a bold line. */
export const SummaryHeader = ({ label, children }: SummaryHeaderProps) => (
  <header className="text-center mb-2">
    <p className="text-sm text-neutral-600">{label}</p>
    <p className="text-3xl font-medium text-black">{children}</p>
  </header>
);
