import { Link, useLocation } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";
import { ArrowDownIcon } from "../icons/ArrowDownIcon";
import { HouseIcon } from "../icons/HouseIcon";
import { RotateCcwIcon } from "../icons/RotateCcwIcon";
import { XIcon } from "../icons/XLogo";
import { ZillionsIcon } from "../icons/ZillionsIcon";
import { helpUrl, privacyPolicyUrl, xUrl } from "../lib/urls";
import { SmartLink } from "./SmartLink";

export function MainNav() {
  const { pathname } = useLocation();

  return (
    <aside className="h-full flex flex-col justify-between border-r border-gray-300 px-6 overflow-auto">
      <nav>
        <div className="h-20 flex items-center">
          <Link to="/" className="hover:text-gold transition-all">
            <ZillionsIcon className="h-11" />
          </Link>
        </div>
        <ul className="mt-8">
          {(
            [
              { label: "Wallet", to: "/", icon: HouseIcon },
              { label: "Receive", to: "/receive", icon: ArrowDownIcon },
              {
                label: "Transactions",
                to: "/transactions",
                icon: RotateCcwIcon,
              },
            ] as const
          ).map((item) => (
            <li key={item.to} className="my-4">
              <Link
                to={item.to}
                className="group inline-flex items-center gap-3"
              >
                <item.icon
                  className={twMerge(
                    "size-5 transition-all",
                    item.to === pathname && "text-gold",
                  )}
                />
                <span
                  className={twMerge(
                    "text-sm group-hover:font-semibold transition-all",
                    item.to === pathname && "font-semibold",
                  )}
                >
                  {item.label}
                </span>
              </Link>
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
            <XIcon className="size-5" />
          </SmartLink>
        </div>
      </footer>
    </aside>
  );
}
