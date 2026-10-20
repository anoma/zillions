import { useState } from "react";
import { zatoshiToZec, zecToZatoshi } from "../lib/utils";

/**
 * What the user typed in an amount field, or Max. `typed` is the text as
 * zatoshi (0 while it isn't a number); `shown(amount)` is the text to draw,
 * which under Max is the resolved amount.
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
    type: (value: string) => {
      setIsMax(false);
      setText(value);
    },
    toggleMax: () => setIsMax((max) => !max),
    setIsMax,
    shown: (amount: bigint) =>
      isMax ? (amount > 0n ? zatoshiToZec(amount) : "") : text,
  };
}
