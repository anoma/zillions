import type { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

export function PageShell({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={twMerge("p-10 pt-8 max-sm:px-6", className)}>
      <div className="mx-auto max-w-135">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {children}
      </div>
    </div>
  );
}
