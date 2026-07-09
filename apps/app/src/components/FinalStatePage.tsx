import type { ReactNode } from "react";

export function FinalStatePage({
  title,
  children,
}: {
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 items-center justify-center h-svh text-center">
      <div className="text-3xl">{title}</div>
      {children}
    </div>
  );
}
