import { ReactNode } from "react";

type SummaryHeaderProps = {
  label: ReactNode;
  children: ReactNode;
  /** A small line under the bold one. */
  detail?: ReactNode;
};

/** What an approval is about, centered: a small label over a bold line. */
export const SummaryHeader = ({
  label,
  children,
  detail,
}: SummaryHeaderProps) => (
  <header className="text-center mb-2">
    <p className="text-sm text-neutral-600">{label}</p>
    <p className="text-3xl font-medium text-black">{children}</p>
    {detail && <p className="text-sm text-neutral-600 mt-1">{detail}</p>}
  </header>
);
