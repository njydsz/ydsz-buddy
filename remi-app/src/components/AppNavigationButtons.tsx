import { Link, useLocation } from "@tanstack/react-router";
import { useAppStore } from "@/store";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/", label: "Chat" },
  { to: "/automations", label: "Automations" },
  { to: "/plugins", label: "Plugins" },
  { to: "/settings", label: "Settings" },
] as const;

export function AppNavigationButtons() {
  const threads = useAppStore((s) => s.threads);
  const location = useLocation();
  return (
    <nav className="flex h-10 items-center gap-1 border-b border-border/60 bg-background/95 px-3 text-sm">
      {NAV_ITEMS.map((item) => {
        const active =
          item.to === "/"
            ? location.pathname === "/" ||
              location.pathname.startsWith("/$threadId") ||
              location.pathname.startsWith("/workspace")
            : location.pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
              active && "bg-accent text-foreground",
            )}
          >
            {item.label}
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
