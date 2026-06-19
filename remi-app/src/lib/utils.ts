import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Tailwind-aware `clsx` wrapper. Mirrors the helper used in the
 * original Peak Code web app so individual components can keep the
 * `cn(...)` ergonomics when migrating to `remi-app`.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
