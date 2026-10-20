/**
 * Theme preference — light, dark, or follow the device. With no saved choice
 * the app opens dark, because it is designed as dark violet glass. The initial
 * class is applied by a blocking script in `index.html` before first paint, so
 * this hook only has to keep the document in sync afterwards — no flash of the
 * wrong theme.
 */

import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";

export const THEME_KEY = "felicia-theme";

export const THEME_OPTIONS: Array<{ value: Theme; label: string; hint: string }> =
  [
    { value: "system", label: "Match my device", hint: "Follows your system setting" },
    { value: "light", label: "Violet light", hint: "Porcelain pages, deep violet accent" },
    { value: "dark", label: "Ambient purple", hint: "Violet glass, easy on the eyes at night" },
  ];

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function readStored(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const raw = window.localStorage.getItem(THEME_KEY);
    if (raw === "light" || raw === "dark") return raw;
    if (raw === "system") return "system";
    // First visit: the app is designed as dark violet glass, so open there.
    return "dark";
  } catch {
    return "dark";
  }
}

export function isDarkTheme(theme: Theme): boolean {
  return theme === "dark" || (theme === "system" && systemPrefersDark());
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", isDarkTheme(theme));
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readStored);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // While following the device, keep listening for a system change so the app
  // re-themes live instead of waiting for a reload.
  useEffect(() => {
    if (theme !== "system") return;
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    media.addEventListener?.("change", onChange);
    return () => media.removeEventListener?.("change", onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // Private mode — still apply it for this session.
    }
    setThemeState(next);
    applyTheme(next);
  }, []);

  return { theme, setTheme, isDark: isDarkTheme(theme) };
}
