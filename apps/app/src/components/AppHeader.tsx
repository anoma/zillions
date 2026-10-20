import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { GoGear, GoKebabHorizontal, GoX } from "react-icons/go";
import QRCode from "react-qr-code";
import { twMerge } from "tailwind-merge";
import { useAccount } from "../hooks/useAccount";
import { useFreshAddress } from "../hooks/useAddresses";
import { ExitIcon } from "../icons/ExitIcon";
import { ZillionsIcon } from "../icons/ZillionsIcon";
import { keychain } from "../lib/keychain/keychain";
import { shortenAddress } from "../lib/utils";
import { CopyToClipboardControl } from "./CopyToClipboardControl";
import { HelpLinks } from "./MainNav";
import { ShieldedTransparentToggle } from "./ShieldedTransparentToggle";
import { SyncIndicator } from "./SyncIndicator";
import { Tooltip } from "./Tooltip";
import { ActionButton } from "./ui/ActionButton";

function AccountProfile() {
  const account = useAccount();
  // Rotated once the tooltip closes, so it never changes while it's read.
  const [shown, setShown] = useState(0);
  const shielded = useFreshAddress(shown) ?? "";
  return (
    <Tooltip
      position="bottom"
      // Right-aligned: centred under a label this close to the edge, it would overflow the page.
      className="left-auto right-0 translate-x-0"
      onClose={() => setShown((n) => n + 1)}
      content={
        <div className="p-4 space-y-3 w-55">
          {[
            ["Shielded address", shielded],
            ["Transparent address", account.transparent.address],
          ].map(([label, value]) => (
            <CopyToClipboardControl
              key={value}
              value={value}
              className="justify-between"
            >
              <div>
                <div className="text-xs">{label}:</div>
                <div className="font-semibold">{shortenAddress(value)}</div>
              </div>
            </CopyToClipboardControl>
          ))}
        </div>
      }
    >
      <div className="h-10 flex items-center gap-2 p-2">
        <span className="text-sm">{account.transparent.alias}</span>
      </div>
    </Tooltip>
  );
}

function SettingsPanel({ onClose }: { onClose: () => void }) {
  const account = useAccount();
  const [isTransparent, setIsTransparent] = useState(false);
  // Mounted per open, so each open shows a fresh shielded address.
  const shielded = useFreshAddress();
  const address = isTransparent ? account.transparent.address : shielded;
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
          "absolute inset-0 bg-black/20 backdrop-blur-sm",
          "transition-opacity duration-500 starting:opacity-0",
          closing && "opacity-0 duration-300",
        )}
        onClick={close}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        className={twMerge(
          "absolute inset-y-0 right-0 w-full max-w-96 flex flex-col gap-8 overflow-y-auto border-l border-gray-300 bg-surface p-8",
          "transition-transform duration-500 ease-out-circ starting:translate-x-full",
          closing && "translate-x-full duration-300 ease-in",
        )}
        onTransitionEnd={(e) =>
          closing && e.target === e.currentTarget && onClose()
        }
      >
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold wrap-anywhere">
            {account.transparent.alias}
          </h2>
          <button
            className="-mr-2 p-2 hover:text-gold transition-all cursor-pointer"
            aria-label="Close"
            onClick={close}
          >
            <GoX className="size-5" />
          </button>
        </div>
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="text-center text-sm font-medium">Receive ZEC</div>
            <ShieldedTransparentToggle
              isTransparent={isTransparent}
              setIsTransparent={setIsTransparent}
            />
          </div>
          {address && (
            <>
              <div className="flex justify-center">
                <QRCode
                  size={240}
                  value={address}
                  bgColor="transparent"
                  fgColor="#000000"
                  level="M"
                />
              </div>
              <CopyToClipboardControl
                value={address}
                className="px-4 py-2 border border-gray-300 rounded-2xl text-sm font-medium wrap-anywhere"
              >
                <div>{address}</div>
              </CopyToClipboardControl>
            </>
          )}
        </div>
        <ActionButton
          size="sm"
          outlineColor="black"
          // Without its own stacking context the hover fill paints behind the panel.
          className="mt-auto w-full isolate"
          icon={
            <ExitIcon className="size-4 transition-transform group-hover:translate-x-1" />
          }
          onClick={() => keychain().disconnect()}
        >
          Log out
        </ActionButton>
      </aside>
    </div>,
    document.body,
  );
}

function SettingsButton() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button
        className="h-10 lg:-mr-2 p-2 hover:text-gold transition-all cursor-pointer"
        aria-label="Settings"
        onClick={() => setOpen(true)}
      >
        <GoGear className="size-4" />
      </button>
      {open && <SettingsPanel onClose={close} />}
    </>
  );
}

function MoreMenu() {
  return (
    <Tooltip
      position="bottom"
      className="left-auto right-0 translate-x-0"
      content={
        <div className="px-4 py-1 pb-4 w-40">
          <HelpLinks />
        </div>
      }
    >
      <button className="h-10 -mr-2 p-2 hover:text-gold transition-all cursor-pointer">
        <GoKebabHorizontal className="size-4" />
      </button>
    </Tooltip>
  );
}

export function AppHeader() {
  return (
    <header className="h-full flex items-center justify-end border-b border-line-strong bg-surface px-6">
      <Link to="/" className="mr-auto lg:hidden">
        <ZillionsIcon className="h-8" />
      </Link>
      <SyncIndicator />
      <AccountProfile />
      <SettingsButton />
      <div className="lg:hidden">
        <MoreMenu />
      </div>
    </header>
  );
}
