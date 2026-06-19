import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { nativeApi } from "@/lib/nativeApi";
import { useAppStore } from "@/store";

type ResolvedTheme = "light" | "dark";
export type ThemePreference = "light" | "dark" | "system";

interface ThemeContextValue {
  /** The effective, resolved theme (no "system" — always light or dark). */
  theme: ResolvedTheme;
  /** Toggle between light and dark. */
  toggle: () => void;
  /** Set a concrete theme; the caller resolves "system" before calling. */
  set: (next: ResolvedTheme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function detectSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function resolvePreference(pref: ThemePreference): ResolvedTheme {
  if (pref === "light" || pref === "dark") return pref;
  return detectSystemTheme();
}

/**
 * Reads/writes the user theme. The store stores the *preference*
 * (which may be "system"); the context exposes the *resolved* theme
 * (always light or dark) so consumers don't need to re-derive it.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const setStoreTheme = useAppStore((s) => s.setTheme);
  const stored = useAppStore((s) => s.theme);

  // Track the system theme so "system" can react to OS changes.
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() =>
    detectSystemTheme(),
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemTheme(mql.matches ? "dark" : "light");
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const resolved: ResolvedTheme =
    stored === "light" || stored === "dark" ? stored : systemTheme;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("light", resolved === "light");
    root.classList.toggle("dark", resolved === "dark");
    window.localStorage.setItem("remi:theme", resolved);
    if (nativeApi) {
      void nativeApi
        .setWindowTheme({ theme: resolved })
        .catch(() => undefined);
    }
  }, [resolved]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: resolved,
      set: (next) => setStoreTheme(next),
      toggle: () => setStoreTheme(resolved === "dark" ? "light" : "dark"),
    }),
    [resolved, setStoreTheme],
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

export { resolvePreference };
