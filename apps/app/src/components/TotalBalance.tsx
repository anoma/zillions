import { Link } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";
import { useGetBalance } from "../hooks/useGetBalance";
import { fitFontSize, zatoshiToZec } from "../lib/utils";
import { PageError } from "./PageError";
import { PageLoader } from "./PageLoader";
import { ActionButton } from "./ui/ActionButton";
import {
  cardClassName,
  sectionLabelClassName,
  textButtonClassName,
} from "./ui/utils";
import { ZecValue } from "./ZecValue";

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
  // +2 for the half-size " ZEC" suffix.
  const totalChars = zatoshiToZec(totalBalance).length + 2;

  const pools = shieldedBalance + transparentBalance;
  const shieldedShare =
    pools > 0n ? Number((shieldedBalance * 1000n) / pools) / 10 : 0;

  return (
    <div className="p-10 pb-0 max-sm:px-6 font-medium">
      <section
        aria-labelledby="balance-total"
        className={twMerge(cardClassName, "@container gap-8 p-8 max-sm:p-6")}
      >
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex flex-col gap-4">
            <h2 id="balance-total" className={sectionLabelClassName}>
              Total balance
            </h2>
            <div
              className="[--max:3rem] xl:[--max:4.5rem] leading-none"
              style={{ fontSize: fitFontSize(totalChars, "var(--max)") }}
            >
              <ZecValue zat={totalBalance} />
            </div>
          </div>
          <div className="flex gap-2 max-sm:w-full">
            <ActionButton
              href="/send"
              size="sm"
              className="w-36 max-sm:flex-1"
              backgroundColor="gold-button"
            >
              Send
            </ActionButton>
            <ActionButton
              href="/receive"
              size="sm"
              className="w-36 max-sm:flex-1"
              outlineColor="black"
            >
              Receive
            </ActionButton>
          </div>
        </div>

        {/* The numbers below say the same; the bar only shows the split at a glance. */}
        <div
          aria-hidden="true"
          className="h-1 flex rounded-full overflow-hidden bg-black/10"
        >
          <div
            className="bg-gold transition-[width] duration-500 ease-out"
            style={{ width: `${shieldedShare}%` }}
          />
        </div>

        <div className="flex flex-wrap gap-x-20 gap-y-6">
          <PoolBalance
            label="Shielded"
            zat={shieldedBalance}
            dotClassName="bg-gold"
            action={{ href: "/unshield", label: "Unshield" }}
          />
          <PoolBalance
            label="Transparent"
            zat={transparentBalance}
            dotClassName="bg-black/10 border border-black/40"
            action={{ href: "/shield", label: "Shield" }}
          />
        </div>
      </section>
    </div>
  );
}

function PoolBalance({
  label,
  zat,
  dotClassName,
  action,
}: {
  label: string;
  zat: bigint;
  dotClassName: string;
  action: { href: string; label: string };
}) {
  return (
    <div>
      <h3 className="flex items-center gap-2 text-xs text-gray-600">
        <span
          aria-hidden="true"
          className={twMerge("size-2 rounded-full", dotClassName)}
        />
        {label}
      </h3>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-2">
        <ZecValue zat={zat} className="text-xl xl:text-2xl" />
        {zat > 0n && (
          <Link
            to={action.href}
            className={twMerge(textButtonClassName, "text-sm")}
          >
            {action.label} →
          </Link>
        )}
      </div>
    </div>
  );
}
