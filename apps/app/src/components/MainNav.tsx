import { useLocation } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";
import { ArrowDownIcon } from "../icons/ArrowDownIcon";
import { ArrowUpIcon } from "../icons/ArrowUpIcon";
import { HouseIcon } from "../icons/HouseIcon";
import { LogoIcon } from "../icons/LogoIcon";
import { RotateCcwIcon } from "../icons/RotateCcwIcon";
import { XIcon } from "../icons/XLogo";
import { helpUrl, privacyPolicyUrl, xUrl } from "../lib/urls";
import { SmartLink } from "./SmartLink";

export function MainNav() {
  const { pathname } = useLocation();

  return (
    <aside className="h-full flex flex-col justify-between border-r border-gray-300 px-6 overflow-auto">
      <nav>
        <div className="h-20 flex items-center">
          <SmartLink href="/" className="hover:text-gold transition-all">
            <LogoIcon className="h-11" />
          </SmartLink>
        </div>
        <ul className="mt-8">
          {[
            { label: "Wallet", href: "/", icon: HouseIcon },
            { label: "Send", href: "/send", icon: ArrowUpIcon },
            { label: "Receive", href: "/receive", icon: ArrowDownIcon },
            {
              label: "Transactions",
              href: "/transactions",
              icon: RotateCcwIcon,
            },
          ].map((item) => (
            <li key={item.href} className="my-4">
              <SmartLink
                href={item.href}
                className="group inline-flex items-center gap-3"
              >
                <item.icon
                  className={twMerge(
                    "w-5 h-5 transition-all",
                    item.href === pathname && "text-gold",
                  )}
                />
                <span
                  className={twMerge(
                    "text-sm group-hover:font-semibold transition-all",
                    item.href === pathname && "font-semibold",
                  )}
                >
                  {item.label}
                </span>
              </SmartLink>
            </li>
          ))}
        </ul>
      </nav>
      <footer className="mb-5">
        <ul className="my-8">
          {[
            { label: "Help", href: helpUrl },
            { label: "Privacy policy", href: privacyPolicyUrl },
          ].map((item) => (
            <li key={item.href} className="my-2">
              <SmartLink
                href={item.href}
                className="inline-flex text-sm hover:font-semibold transition-all"
              >
                {item.label}
              </SmartLink>
            </li>
          ))}
        </ul>
        <div>
          <SmartLink
            href={xUrl}
            className="inline-flex hover:text-gold transition-all"
          >
            <XIcon className="h-5 w-5" />
          </SmartLink>
        </div>
      </footer>
    </aside>
  );
}
