import type { CSSProperties, InputHTMLAttributes } from "react";

/**
 * Input props for a password or key, `hidden` while masked.
 *
 * Firefox's password manager offers to save, then autofills, any field that
 * has ever been `type="password"`, extension pages included, whatever its
 * `autocomplete` or form. A saved Keychain password unlocks it in one click
 * and sits in the browser profile. So on Firefox the field is text masked by
 * CSS, which the password manager ignores; `autocomplete="off"` keeps it out
 * of form history, which stores text fields in the clear.
 */
export const secretInputProps = (
  hidden: boolean
): InputHTMLAttributes<HTMLInputElement> & { style?: CSSProperties } =>
  import.meta.env.FIREFOX
    ? {
        type: "text",
        autoComplete: "off",
        autoCapitalize: "off",
        autoCorrect: "off",
        spellCheck: false,
        // Not in React's CSS types; React renders it as `-webkit-text-security`.
        style: hidden ? ({ WebkitTextSecurity: "disc" } as CSSProperties) : undefined,
      }
    : { type: hidden ? "password" : "text", autoComplete: "off" };
