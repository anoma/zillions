import type { ReactNode } from "react";
import { twMerge } from "tailwind-merge";
import { useGetBalance } from "../hooks/useGetBalance";
import { PageError } from "./PageError";
import { PageLoader } from "./PageLoader";

function Amount({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return (
    <div className={twMerge(className)}>
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
    balance.data.orchardBalance + balance.data.saplingBalance;

  return (
    <div className="p-10 flex items-center justify-between font-medium border-b border-gray-300">
      <div>
        <div className="text-sm">Total Balance in Zillions</div>
        <Amount className="text-7xl mt-6">
          {(shieldedBalance + transparentBalance).toLocaleString()}
        </Amount>
      </div>
      <div>
        <div className="text-sm">Shielded balance</div>
        <Amount className="text-4xl mt-6">
          {shieldedBalance.toLocaleString()}
        </Amount>
      </div>
      <div className="mr-25">
        <div className="text-sm">Transparent balance</div>
        <Amount className="text-4xl mt-6">
          {transparentBalance.toLocaleString()}
        </Amount>
      </div>
    </div>
  );
}
