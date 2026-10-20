import { useState } from "react";
import { capDecimals, zatoshiToZec, zecToZatoshi } from "../lib/utils";

/**
 * What the user typed in an amount field, or Max. `typed` is the text as
 * zatoshi (0 while it isn't a number); `shown(amount)` is the text to draw,
 * which under Max is the resolved amount. `missing` says why a typed amount
 * is 0.
 */
export function useAmountField() {
  const [text, setText] = useState("");
  const [isMax, setIsMax] = useState(false);

  let typed = 0n;
  let isNumber = false;
  try {
    typed = zecToZatoshi(text);
    isNumber = true;
  } catch {
    // Not a number yet.
  }

  return {
    text,
    isMax,
    typed,
    missing:
      isMax || !text.trim()
        ? "Set an amount"
        : isNumber
          ? "The smallest amount is 0.00000001 ZEC"
          : "Not a valid amount",
    type: (value: string) => {
      setIsMax(false);
      setText(capDecimals(value));
    },
    toggleMax: () => setIsMax((max) => !max),
    setIsMax,
    shown: (amount: bigint) =>
      isMax ? (amount > 0n ? zatoshiToZec(amount) : "") : text,
  };
}
