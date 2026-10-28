/**
 * UI preferences shared by the popup and the approval window: theme, account
 * colours and account order. None of it is secret, and both pages share the
 * extension origin, so `localStorage` is enough and reads synchronously
 * before the first paint.
 */
import { useSyncExternalStore } from "react";

export type Theme = "system" | "light" | "dark";

const THEME_KEY = "zillions.theme";
const COLORS_KEY = "zillions.accountColors";
const ORDER_KEY = "zillions.accountOrder";

/** Account avatar colours: light enough for black initials in both themes. */
export const ACCOUNT_COLORS = [
  "#e5d49a",
  "#c8d2d6",
  "#d9c6cf",
  "#c3cdb9",
  "#e3c4a8",
  "#c9c3dd",
] as const;

const listeners = new Set<() => void>();
const notify = (): void => listeners.forEach((l) => l());
const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const readJson = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, value: unknown): void => {
  localStorage.setItem(key, JSON.stringify(value));
  notify();
};

// ---- theme ----

export const getTheme = (): Theme => {
  const value = localStorage.getItem(THEME_KEY);
  return value === "light" || value === "dark" ? value : "system";
};

const darkQuery = (): MediaQueryList =>
  window.matchMedia("(prefers-color-scheme: dark)");

const paintTheme = (): void => {
  const theme = getTheme();
  const dark = theme === "dark" || (theme === "system" && darkQuery().matches);
  document.documentElement.classList.toggle("dark", dark);
};

export const setTheme = (theme: Theme): void => {
  localStorage.setItem(THEME_KEY, theme);
  paintTheme();
  notify();
};

/** Call once per page, before rendering. */
export const initTheme = (): void => {
  paintTheme();
  darkQuery().addEventListener("change", paintTheme);
};

export const useTheme = (): Theme => useSyncExternalStore(subscribe, getTheme);

// ---- account identity ----

const colorsSnapshot = (): string =>
  localStorage.getItem(COLORS_KEY) ?? "{}";

/** The colour the user chose, else one picked from the id, so it never moves. */
export const accountColor = (accountId: string): string => {
  const chosen = readJson<Record<string, string>>(COLORS_KEY, {})[accountId];
  if (chosen) return chosen;
  let hash = 0;
  for (const char of accountId) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return ACCOUNT_COLORS[Math.abs(hash) % ACCOUNT_COLORS.length];
};

export const setAccountColor = (accountId: string, color: string): void => {
  const colors = readJson<Record<string, string>>(COLORS_KEY, {});
  writeJson(COLORS_KEY, { ...colors, [accountId]: color });
};

/** Re-renders when any account colour changes. */
export const useAccountColors = (): string =>
  useSyncExternalStore(subscribe, colorsSnapshot);

const orderSnapshot = (): string => localStorage.getItem(ORDER_KEY) ?? "[]";

export const useAccountOrder = (): string[] =>
  JSON.parse(useSyncExternalStore(subscribe, orderSnapshot)) as string[];

export const setAccountOrder = (ids: string[]): void =>
  writeJson(ORDER_KEY, ids);

/**
 * `items` in the user's order. Accounts the user never placed (new ones) go
 * first, newest first, as the list showed before any reordering.
 */
export const sortByOrder = <T extends { id: string; timestamp: number }>(
  items: T[],
  order: string[]
): T[] => {
  const rank = new Map(order.map((id, i) => [id, i]));
  const unplaced = items
    .filter((a) => !rank.has(a.id))
    .sort((a, b) => b.timestamp - a.timestamp);
  const placed = items
    .filter((a) => rank.has(a.id))
    .sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  return [...unplaced, ...placed];
};
