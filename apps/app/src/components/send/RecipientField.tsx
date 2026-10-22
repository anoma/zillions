import { type Ref, useRef } from "react";
import { twMerge } from "tailwind-merge";
import type { useAddressKind } from "../../hooks/useAddresses";
import { inputClassName, pillButtonClassName } from "../ui/utils";

type Kind = ReturnType<typeof useAddressKind>;

// Touch screens only: on desktops, reading the clipboard asks for a
// permission, and pasting into the field is already one shortcut away.
const canPaste =
  Boolean(navigator.clipboard?.readText) &&
  matchMedia("(pointer: coarse)").matches;

/** The address field, a Paste button while it's empty, and what the address is under it. */
export function RecipientField({
  value,
  kind,
  error,
  onChange,
  ref,
}: {
  value: string;
  kind: Kind;
  error?: string;
  onChange: (address: string) => void;
  ref?: Ref<HTMLInputElement>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const invalid = Boolean(value) && kind === null;
  const tone = error || invalid ? "red" : kind;

  const paste = async () => {
    try {
      onChange((await navigator.clipboard.readText()).trim());
    } catch {
      // Permission refused: the field is still there to paste into.
    }
    inputRef.current?.focus();
  };

  return (
    <div className="motion-safe:animate-fade-in">
      <div className="relative">
        <input
          id="send-to-address"
          name="to"
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="Paste a Zcash address"
          ref={(el) => {
            inputRef.current = el;
            if (typeof ref === "function") ref(el);
            else if (ref) ref.current = el;
          }}
          aria-invalid={tone === "red"}
          aria-describedby="send-to-kind"
          className={twMerge(
            inputClassName,
            // 16px on phones: iOS zooms into any smaller field on focus.
            "h-11 text-base sm:text-sm text-ellipsis",
            !value && canPaste && "pr-20",
            tone === "transparent" &&
              "border-black hover:border-black focus:border-black",
            tone === "shielded" &&
              "border-gold hover:border-gold focus:border-gold",
            tone === "red" &&
              "border-red-700 hover:border-red-700 focus:border-red-700",
          )}
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
        />
        {!value && canPaste && (
          <button
            type="button"
            onClick={paste}
            className={twMerge(
              pillButtonClassName,
              "absolute right-2 top-1/2 -translate-y-1/2",
            )}
          >
            Paste
          </button>
        )}
      </div>
      <div
        id="send-to-kind"
        aria-live="polite"
        className="mt-2.5 empty:mt-0 flex items-center gap-1.5 text-xs font-medium"
      >
        {(error || (value && kind !== undefined)) && (
          <span
            key={error ?? kind}
            role={tone === "red" ? "alert" : undefined}
            className={twMerge(
              "flex items-center gap-1.5 motion-safe:animate-fade-in",
              tone === "red" && "text-red-700",
            )}
          >
            <span
              aria-hidden="true"
              className={twMerge(
                "size-2 rounded-full",
                tone === "shielded" && "bg-gold",
                tone === "transparent" && "border border-black",
                tone === "red" && "bg-red-700",
              )}
            />
            {error ??
              (kind === "shielded"
                ? "Shielded address"
                : kind === "transparent"
                  ? "Transparent address, visible on-chain"
                  : "Not a valid Zcash address")}
          </span>
        )}
      </div>
    </div>
  );
}
