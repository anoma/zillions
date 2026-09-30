import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useGetBalance } from "../hooks/useGetBalance";
import { PageError } from "./PageError";
import { PageLoader } from "./PageLoader";
import { ActionButton } from "./ui/ActionButton";
import { ZecValue } from "./ZecValue";

function Label({ children }: { children: ReactNode }) {
  return <div className="text-sm mb-1 xl:mb-6">{children}</div>;
}

export function TotalBalance() {
  const balance = useGetBalance();

  if (balance.isPending) {
    return <PageLoader />;
  }

  if (!balance.isSuccess) {
    return <PageError>{String(balance.error)}</PageError>;
  }

  const shieldedBalance = balance.data.shieldedBalance;
  const pendingBalance =
    balance.data.pendingChange + balance.data.pendingSpendable;
  const transparentBalance = balance.data.unshieldedBalance;
  const totalBalance = shieldedBalance + transparentBalance + pendingBalance;

  return (
    <div className="p-10 flex max-lg:flex-col lg:items-center justify-between gap-10 font-medium border-b border-gray-300 overflow-auto">
      <div>
        <Label>Total Balance in Zillions</Label>
        <div className="my-5 lg:my-10">
          <ZecValue zat={totalBalance} className="text-5xl xl:text-7xl" />
          {pendingBalance > 0n && (
            <div className="text-xs font-normal mt-1">
              <ZecValue zat={pendingBalance} /> pending (included)
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Link to="/receive">
            <ActionButton size="sm" className="w-50" outlineColor="black">
              Receive
            </ActionButton>
          </Link>
        </div>
      </div>
      <div>
        <Label>Shielded balance</Label>
        <div className="my-3 lg:my-6">
          <ZecValue zat={shieldedBalance} className="text-xl xl:text-3xl" />
        </div>
      </div>
      <div className="lg:mr-15">
        <Label>Transparent balance</Label>
        <div className="my-3 lg:my-6">
          <ZecValue zat={transparentBalance} className="text-xl xl:text-3xl" />
        </div>
      </div>
    </div>
  );
}
