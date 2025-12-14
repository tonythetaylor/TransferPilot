export type ThemeMode = "light" | "dark" | "system";

const KEY = "tp_theme";

export function getStoredTheme(): ThemeMode {
  const v = localStorage.getItem(KEY);
  if (v === "light" || v === "dark" || v === "system") return v;
  return "system";
}

export function storeTheme(mode: ThemeMode) {
  localStorage.setItem(KEY, mode);
}

export function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  const prefersDark =
    window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;

  const shouldDark = mode === "dark" || (mode === "system" && prefersDark);
  root.classList.toggle("dark", shouldDark);
}