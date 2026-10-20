import { Link, useLocation } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";
import { ArrowDownIcon } from "../icons/ArrowDownIcon";
import { ArrowUpIcon } from "../icons/ArrowUpIcon";
import { HouseIcon } from "../icons/HouseIcon";
import { RotateCcwIcon } from "../icons/RotateCcwIcon";
import { XIcon } from "../icons/XLogo";
import { ZillionsIcon } from "../icons/ZillionsIcon";
import { helpUrl, privacyPolicyUrl, xUrl } from "../lib/urls";
import { SmartLink } from "./SmartLink";

const navItems = [
  { label: "Wallet", to: "/", icon: HouseIcon },
  { label: "Send", to: "/send", icon: ArrowUpIcon },
  { label: "Receive", to: "/receive", icon: ArrowDownIcon },
  { label: "Transactions", to: "/transactions", icon: RotateCcwIcon },
] as const;

export function HelpLinks() {
  return (
    <>
      <ul>
        {[
          { label: "Help", href: helpUrl },
          { label: "Privacy policy", href: privacyPolicyUrl },
        ].map((item) => (
          <li key={item.label} className="my-2">
            <SmartLink
              href={item.href}
              className="inline-flex text-sm hover:font-semibold transition-all"
            >
              {item.label}
            </SmartLink>
          </li>
        ))}
      </ul>
      <div className="mt-8 flex items-end justify-between">
        <SmartLink
          href={xUrl}
          className="inline-flex hover:text-gold transition-all"
        >
          <XIcon className="size-5" />
        </SmartLink>
        <div className="text-xs text-neutral-500">v{__APP_VERSION__}</div>
      </div>
    </>
  );
}

export function MainNav() {
  const { pathname } = useLocation();

  return (
    <aside className="h-full flex flex-col justify-between border-r border-line-strong px-6 overflow-auto">
      <nav>
        <div className="h-16 flex items-center">
          <Link to="/" className="hover:text-gold transition-all">
            <ZillionsIcon className="h-9" />
          </Link>
        </div>
        <ul className="mt-6">
          {navItems.map((item) => (
            <li key={item.to} className="my-1 -mx-3">
              <Link
                to={item.to}
                aria-current={item.to === pathname ? "page" : undefined}
                className={twMerge(
                  "flex items-center gap-3 px-3 py-2.5 rounded-full text-sm transition-colors duration-300",
                  "hover:bg-card/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black",
                  item.to === pathname && "bg-card font-semibold",
                )}
              >
                <item.icon
                  className={twMerge(
                    "size-5 transition-colors duration-300",
                    item.to === pathname && "text-gold",
                  )}
                />
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <footer className="mt-8 mb-5">
        <HelpLinks />
      </footer>
    </aside>
  );
}

export function BottomNav() {
  const { pathname } = useLocation();

  return (
    <nav className="fixed bottom-0 inset-x-0 z-10 grid grid-cols-4 border-t border-line bg-surface">
      {navItems.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          className="h-16 flex flex-col items-center justify-center gap-1"
        >
          <item.icon
            className={twMerge(
              "size-5 transition-all",
              item.to === pathname && "text-gold",
            )}
          />
          <span
            className={twMerge(
              "text-xs",
              item.to === pathname && "font-semibold",
            )}
          >
            {item.label}
          </span>
        </Link>
      ))}
    </nav>
  );
}
