import { Link, useLocation } from "@tanstack/react-router";
import { useContext, useEffect } from "react";
import { LuMoon, LuSun } from "react-icons/lu";
import { twMerge } from "tailwind-merge";
import { SetNavEnabledContext } from "../context/nav";
import { useDarkMode } from "../hooks/useDarkMode";
import { ArrowDownIcon } from "../icons/ArrowDownIcon";
import { ArrowUpIcon } from "../icons/ArrowUpIcon";
import { ArrowsLeftRight } from "../icons/ArrowsLeftRight";
import { HouseIcon } from "../icons/HouseIcon";
import { RotateCcwIcon } from "../icons/RotateCcwIcon";
import { XIcon } from "../icons/XLogo";
import { ZillionsIcon } from "../icons/ZillionsIcon";
import { helpUrl, privacyPolicyUrl, xUrl } from "../lib/urls";
import { SmartLink } from "./SmartLink";
import { Toggle } from "./Toggle";

const navItems = [
  { label: "Wallet", to: "/", icon: HouseIcon },
  { label: "Send", to: "/send", icon: ArrowUpIcon },
  { label: "Receive", to: "/receive", icon: ArrowDownIcon },
  { label: "Swap", to: "/swap", icon: ArrowsLeftRight },
  { label: "Transactions", to: "/transactions", icon: RotateCcwIcon },
] as const;

/** Enables navigation while mounted; place it where the wallet is ready. */
export function EnableNav() {
  const setNavEnabled = useContext(SetNavEnabledContext);
  useEffect(() => {
    setNavEnabled(true);
    return () => setNavEnabled(false);
  }, [setNavEnabled]);
  return null;
}

export function HelpLinks() {
  return (
    <>
      <DarkModeToggle />
      <ul className="mt-6">
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

function DarkModeToggle() {
  const [dark, setDark] = useDarkMode();
  const icon = (active: boolean) =>
    twMerge(
      "size-[15px] transition-colors duration-300",
      active ? "text-on-gold" : "text-gray-500",
    );
  return (
    <Toggle
      aria-label="Dark mode"
      active={dark}
      onChange={setDark}
      className="mt-2 h-[31px] w-[62px]"
    >
      {/* Same padding and square as the thumb, so each icon centres on a resting spot. */}
      <span className="h-full p-0.5 flex justify-between">
        <span className="h-full aspect-square grid place-items-center">
          <LuSun className={icon(!dark)} />
        </span>
        <span className="h-full aspect-square grid place-items-center">
          <LuMoon className={icon(dark)} />
        </span>
      </span>
    </Toggle>
  );
}

export function MainNav({ enabled }: { enabled: boolean }) {
  const pathname = useLocation().pathname;
  const current = enabled ? pathname : undefined;

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
                disabled={!enabled}
                aria-current={item.to === current ? "page" : undefined}
                className={twMerge(
                  "flex items-center gap-3 px-3 py-2.5 rounded-full text-sm transition-colors duration-300",
                  "hover:bg-card/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black",
                  item.to === current && "bg-card font-semibold",
                  !enabled &&
                    "text-gray-400 cursor-default hover:bg-transparent",
                )}
              >
                <item.icon
                  className={twMerge(
                    "size-5 transition-colors duration-300",
                    item.to === current && "text-gold",
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

export function BottomNav({ enabled }: { enabled: boolean }) {
  const pathname = useLocation().pathname;
  const current = enabled ? pathname : undefined;

  return (
    <nav className="fixed bottom-0 inset-x-0 z-10 grid grid-cols-4 border-t border-line bg-surface">
      {navItems.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          disabled={!enabled}
          className={twMerge(
            "h-16 flex flex-col items-center justify-center gap-1",
            !enabled && "text-gray-400",
          )}
        >
          <item.icon
            className={twMerge(
              "size-5 transition-all",
              item.to === current && "text-gold",
            )}
          />
          <span
            className={twMerge(
              "text-xs",
              item.to === current && "font-semibold",
            )}
          >
            {item.label}
          </span>
        </Link>
      ))}
    </nav>
  );
}
