import { useSyncExternalStore } from "react";

// index.html sets the initial class before the app loads.
const root = document.documentElement;

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(root, { attributeFilter: ["class"] });
  return () => observer.disconnect();
}

const isDark = () => root.classList.contains("dark");

export function useDarkMode() {
  const dark = useSyncExternalStore(subscribe, isDark);
  const setDark = (next: boolean) => {
    root.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };
  return [dark, setDark] as const;
}
