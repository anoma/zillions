import type { ReactNode } from "react";

export function FinalStatePage({
  title,
  children,
}: {
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div className="absolute inset-0 flex flex-col gap-5 items-center justify-center px-6 text-center">
      <div className="text-3xl">{title}</div>
      {children}
    </div>
  );
}
