import { ReactNode } from "react";

/** A rounded group of summary rows, divided by hairlines. */
export const SummaryCard = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-col rounded-md bg-white/50 divide-y divide-neutral-300">
    {children}
  </div>
);
