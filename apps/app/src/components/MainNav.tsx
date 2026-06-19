import { Link, useLocation } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";
import { ArrowDownIcon } from "../icons/ArrowDownIcon";
import { ArrowUpIcon } from "../icons/ArrowUpIcon";
import { HouseIcon } from "../icons/HouseIcon";
import { LogoIcon } from "../icons/LogoIcon";
import { RotateCcwIcon } from "../icons/RotateCcwIcon";
import { XIcon } from "../icons/XLogo";

export function MainNav() {
  const { pathname } = useLocation();

  return (
    <aside className="h-full flex flex-col justify-between border-r border-gray-300 px-6 overflow-auto">
      <nav>
        <div className="h-20 flex items-center">
          <Link to="/" className="hover:text-gold transition-all">
            <LogoIcon className="h-11" />
          </Link>
        </div>
        <ul className="mt-8">
          {[
            { label: "Wallet", to: "/", icon: HouseIcon },
            { label: "Send", to: "/send", icon: ArrowUpIcon },
            { label: "Receive", to: "/receive", icon: ArrowDownIcon },
            { label: "Transactions", to: "/transactions", icon: RotateCcwIcon },
          ].map((item) => (
            <li key={item.to} className="my-4">
              <Link
                to={item.to}
                className="group inline-flex items-center gap-3"
              >
                <item.icon
                  className={twMerge(
                    "w-5 h-5 transition-all",
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
            { label: "Help", to: "#" },
            { label: "Privacy policy", to: "#" },
          ].map((item) => (
            <li key={item.to} className="my-2">
              <Link
                to={item.to}
                className="inline-flex text-sm hover:font-semibold transition-all"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <div>
          <Link to="#" className="inline-flex hover:text-gold transition-all">
            <XIcon className="h-5 w-5" />
          </Link>
        </div>
      </footer>
    </aside>
  );
}
