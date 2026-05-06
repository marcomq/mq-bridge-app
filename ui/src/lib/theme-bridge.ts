export type ThemePreference = "auto" | "light" | "dark";

export function getThemePreference(): ThemePreference | undefined {
  return window.getThemePreference?.() as ThemePreference | undefined;
}

export function setThemePreference(value: ThemePreference) {
  window.setThemePreference?.(value);
}
