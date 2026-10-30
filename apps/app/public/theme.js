// Before first paint, so a dark page never flashes light. Kept in step with
// useDarkMode. A file rather than an inline script so the CSP (vite.config.ts)
// can refuse every inline script.
if (
  (localStorage.getItem("theme") ??
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) ===
  "dark"
)
  document.documentElement.classList.add("dark");
