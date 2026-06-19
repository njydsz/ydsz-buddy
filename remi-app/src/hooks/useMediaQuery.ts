// Centralized "is mobile" breakpoint hook.
import { useEffect, useState } from "react";

const MOBILE_QUERY = "(max-width: 768px)";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const list = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    list.addEventListener("change", handler);
    return () => list.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY);
}
