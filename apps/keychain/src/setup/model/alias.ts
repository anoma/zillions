/**
 * A device account's default name. Sites see every account's name, so it
 * mustn't say how the keys are held.
 */
export const DEFAULT_ALIAS = "Account";

/** `base`, or `base 2`, `base 3`… — the first one no account uses yet. */
export const freeAlias = (base: string, taken: string[]): string => {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
};
