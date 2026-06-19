import { Link, useLocation } from "@tanstack/react-router";
import { useAppStore } from "@/store";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";

const NAV_ITEMS = [
  { to: "/", labelKey: "nav.chat" as const, match: (p: string) => p === "/" || p.startsWith("/$threadId") || p.startsWith("/workspace") },
  { to: "/automations", labelKey: "nav.automations" as const, match: (p: string) => p.startsWith("/automations") },
  { to: "/plugins", labelKey: "nav.plugins" as const, match: (p: string) => p.startsWith("/plugins") },
  { to: "/settings", labelKey: "nav.settings" as const, match: (p: string) => p.startsWith("/settings") },
];

export function AppNavigationButtons() {
  const t = useT();
  const threads = useAppStore((s) => s.threads);
  const location = useLocation();
  return (
    <nav className="flex h-10 items-center gap-1 border-b border-border/60 bg-background/95 px-3 text-sm">
      {NAV_ITEMS.map((item) => {
        const active = item.match(location.pathname);
        return (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
              active && "bg-accent text-foreground",
            )}
          >
            {t(item.labelKey)}
            {item.to === "/" && threads.length > 0 ? (
              <span className="ml-1 text-[10px] text-muted-foreground">
                ({threads.length})
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
