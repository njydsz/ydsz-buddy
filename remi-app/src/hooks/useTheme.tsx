import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { nativeApi } from "@/lib/nativeApi";
import { useAppStore } from "@/store";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
  set: (next: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function detectInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem("remi:theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const setStoreTheme = useAppStore((s) => s.setTheme);
  const stored = useAppStore((s) => s.theme);
  const initial = stored === "light" || stored === "dark" ? stored : detectInitialTheme();
  const [theme, setTheme] = useState<Theme>(initial);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("light", theme === "light");
    root.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem("remi:theme", theme);
    setStoreTheme(theme);
    if (nativeApi) {
      void nativeApi.setWindowTheme({ theme }).catch(() => undefined);
    }
  }, [theme, setStoreTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      set: setTheme,
      toggle: () => setTheme((prev) => (prev === "dark" ? "light" : "dark")),
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside <ThemeProvider>");
  }
  return ctx;
}
