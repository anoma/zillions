import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { GoX } from "react-icons/go";
import { twMerge } from "tailwind-merge";
import { ExitIcon } from "../../icons/ExitIcon";
import { keychain } from "../../lib/keychain/keychain";
import { ActionButton } from "../ui/ActionButton";
import { AccountSwitcher } from "./AccountSwitcher";
import { AddressCard } from "./AddressCard";

export function AccountDrawer({ onClose }: { onClose: () => void }) {
  // Slides out first; `onClose` unmounts it once the slide ends.
  const [closing, setClosing] = useState(false);
  const close = () => setClosing(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setClosing(true);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        className={twMerge(
          "absolute inset-0 bg-black/20 dark:bg-surface/60 backdrop-blur-sm",
          "transition-opacity duration-500 starting:opacity-0",
          closing && "opacity-0 duration-300",
        )}
        onClick={close}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Account"
        className={twMerge(
          "absolute inset-y-0 right-0 w-full max-w-96 flex flex-col overflow-y-auto border-l border-line-strong bg-surface",
          "transition-transform duration-500 ease-out-circ starting:translate-x-full",
          closing && "translate-x-full duration-300 ease-in",
        )}
        onTransitionEnd={(e) =>
          closing && e.target === e.currentTarget && onClose()
        }
      >
        {/* Same height and inset as AppHeader, so the X lands where the avatar was. */}
        <div className="shrink-0 h-16 flex items-center justify-between border-b border-line-strong pl-8 pr-6">
          <span className="text-sm font-medium">Account</span>
          <button
            className="size-7 grid place-items-center rounded-full border border-current transition-colors duration-300 hover:bg-gold/15 cursor-pointer"
            aria-label="Close"
            onClick={close}
          >
            <GoX className="size-4" />
          </button>
        </div>
        <div className="flex-1 flex flex-col gap-8 px-8 pt-6 pb-8">
          <AccountSwitcher />
          <AddressCard />
          <div className="mt-auto space-y-3">
            <ActionButton
              size="sm"
              outlineColor="black"
              // Without its own stacking context the hover fill paints behind the panel.
              className="w-full isolate"
              icon={
                <ExitIcon className="size-4 transition-transform group-hover:translate-x-1" />
              }
              onClick={() => keychain().disconnect()}
            >
              Log out
            </ActionButton>
            <div className="text-center text-xs text-neutral-400">
              App v{__APP_VERSION__} · Keychain v{keychain().version()}
            </div>
          </div>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
