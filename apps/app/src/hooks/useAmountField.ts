import { useState } from "react";
import { missingAmount, shownAmount } from "../lib/amount";
import { capDecimals, zecToZatoshi } from "../lib/utils";

/**
 * What the user typed in an amount field, or Max: `typed` in zatoshi (0 while
 * not a number), `shown(amount)` the text to draw (under Max the amount once
 * known, 0 included), and `missing` why the amount is 0.
 */
export function useAmountField() {
  const [text, setText] = useState("");
  const [isMax, setIsMax] = useState(false);

  let typed = 0n;
  try {
    typed = zecToZatoshi(text);
  } catch {
    // Not a number yet.
  }

  return {
    text,
    isMax,
    typed,
    missing: missingAmount(text, isMax),
    type: (value: string) => {
      setIsMax(false);
      setText(capDecimals(value));
    },
    toggleMax: () => setIsMax((max) => !max),
    shown: (amount?: bigint) => shownAmount(text, isMax, amount),
  };
}
