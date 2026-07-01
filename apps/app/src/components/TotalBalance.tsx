import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { twMerge } from "tailwind-merge";
import { useGetBalance } from "../hooks/useGetBalance";
import { zatoshiToZec } from "../lib/utils";
import { PageError } from "./PageError";
import { PageLoader } from "./PageLoader";
import { ActionButton } from "./ui/ActionButton";

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
      className={twMerge("whitespace-nowrap text-xl xl:text-3xl", className)}
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
        <Amount className="text-5xl xl:text-7xl my-10">
          {zatoshiToZec(shieldedBalance + transparentBalance)}
        </Amount>
        <div className="flex gap-2">
          <Link to="/send">
            <ActionButton size="sm" className="w-50">
              Send
            </ActionButton>
          </Link>
          <Link to="/receive">
            <ActionButton size="sm" className="w-50" outlineColor="black">
              Receive
            </ActionButton>
          </Link>
        </div>
      </div>
      <div>
        <Label>Shielded balance</Label>
        <Amount className="my-6">{zatoshiToZec(shieldedBalance)}</Amount>
        <Link to="/unshield">
          <ActionButton size="xs" outlineColor="black">
            Unshield
          </ActionButton>
        </Link>
      </div>
      <div className="mr-15">
        <Label>Transparent balance</Label>
        <Amount className="my-6">{zatoshiToZec(transparentBalance)}</Amount>
        <div>
          <Link to="/shield">
            <ActionButton size="xs" outlineColor="black">
              Shield
            </ActionButton>
          </Link>
        </div>
      </div>
    </div>
  );
}
