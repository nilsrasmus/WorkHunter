import type { AppTheme } from "../types";

export function resolveTheme(value?: string | null): AppTheme {
  return value === "dark" ? "dark" : "light";
}

export function applyThemeAttribute(theme: AppTheme) {
  document.documentElement.setAttribute("data-theme", theme);
}
