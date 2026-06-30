import type { ReactNode } from "react";
import { twMerge } from "tailwind-merge";
import { useGetBalance } from "../hooks/useGetBalance";
import { zatoshiToZec } from "../lib/utils";
import { PageError } from "./PageError";
import { PageLoader } from "./PageLoader";

function Label({ children }: { children: ReactNode }) {
  return <div className="text-sm mb-1 xl:mb-6">{children}</div>;
}

function Amount({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={twMerge("whitespace-nowrap text-2xl xl:text-4xl", className)}
    >
      <span>{children}</span>
      <span className="text-[0.5em]"> ZEC</span>
    </div>
  );
}

export function TotalBalance() {
  const balance = useGetBalance();

  if (balance.isPending) {
    return <PageLoader />;
  }

  if (!balance.isSuccess) {
    return <PageError>{String(balance.error)}</PageError>;
  }

  const transparentBalance = balance.data.unshieldedBalance;
  const shieldedBalance =
    balance.data.orchardBalance +
    balance.data.saplingBalance +
    balance.data.pendingChange +
    balance.data.pendingSpendable;

  return (
    <div className="p-10 flex max-lg:flex-col lg:items-center justify-between gap-6 lg:gap-10 font-medium border-b border-gray-300 overflow-auto">
      <div>
        <Label>Total Balance in Zillions</Label>
        <Amount className="text-6xl xl:text-8xl">
          {zatoshiToZec(shieldedBalance + transparentBalance)}
        </Amount>
      </div>
      <div>
        <Label>Shielded balance</Label>
        <Amount>{zatoshiToZec(shieldedBalance)}</Amount>
      </div>
      <div className="mr-15">
        <Label>Total Transparent balance</Label>
        <Amount>{zatoshiToZec(transparentBalance)}</Amount>
      </div>
    </div>
  );
}
