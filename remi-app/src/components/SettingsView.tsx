import { useState } from "react";
import { useAppStore } from "@/store";
import { useTheme } from "@/hooks/useTheme";
import { useLanguage, useT } from "@/i18n";
import { useQuery } from "@tanstack/react-query";
import { rpc } from "@/lib/rpc";
import { toast } from "@/lib/toast";
import { log } from "@/lib/logger";

/**
 * Settings view. The M2 milestone wires this up to the real
 * `remi-contracts::ServerConfig` surface; for M1 we expose the
 * pieces the user can already control from the React side
 * (theme, language, draft clearing) plus a read-only summary of
 * the running server.
 */
export function SettingsView() {
  const t = useT();
  const [language, setLanguage] = useLanguage();
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const { theme: resolved, set: setResolvedTheme } = useTheme();
  const setLanguageStore = useAppStore((s) => s.setLanguage);
  const setComposerDraft = useAppStore((s) => s.setComposerDraft);
  const serverInfo = useAppStore((s) => s.serverInfo);
  const transport = useAppStore((s) => s.transport);
  const [copied, setCopied] = useState(false);

  const providersQuery = useQuery({
    queryKey: ["providers", "static"],
    queryFn: async () => {
      try {
        const list = await rpc.providerListCommands("__all__").catch(() => []);
        return Array.isArray(list) ? list.map((c) => c.id) : [];
      } catch {
        return [];
      }
    },
    staleTime: 5 * 60_000,
  });

  const onCopyEndpoint = async () => {
    if (!serverInfo) return;
    const url = `http://${serverInfo.host}:${serverInfo.port}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success(t("chat.copied"), { source: "settings", duration: 2_000 });
      setTimeout(() => setCopied(false), 1_500);
    } catch (e) {
      log.error("clipboard write failed", { error: String(e) });
      toast.error("Copy failed", { source: "settings" });
    }
  };

  const onClearDraft = () => {
    setComposerDraft("");
    toast.info("Cleared draft", { source: "settings" });
  };

  return (
    <div className="m-6 space-y-6 text-sm">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">
          {t("settings.heading")}
        </h1>
        <p className="text-xs text-muted-foreground">
          Remi Code · v0.1.0 · M1 preview
        </p>
      </header>

      <Section title="Appearance">
        <Row label={t("language.label")} hint="UI language (中 / English)">
          <select
            value={language}
            onChange={(e) => {
              const v = e.target.value as "en" | "zh-CN";
              setLanguage(v);
              setLanguageStore(v);
            }}
            className="rounded-md border border-border/60 bg-background px-2 py-1 text-xs"
          >
            <option value="en">English</option>
            <option value="zh-CN">简体中文</option>
          </select>
        </Row>
        <Row label="Theme" hint="Light / dark / follow system">
          <select
            value={theme}
            onChange={(e) => {
              const v = e.target.value as "light" | "dark" | "system";
              if (v === "system") {
                setTheme("system");
              } else {
                setTheme(v);
                setResolvedTheme(v);
              }
            }}
            className="rounded-md border border-border/60 bg-background px-2 py-1 text-xs"
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </Row>
        <Row label="Resolved theme" hint="Effective theme after system detection">
          <span className="text-xs text-muted-foreground">{resolved}</span>
        </Row>
      </Section>

      <Section title="Workspace">
        <Row
          label="Composer draft"
          hint="The prompt being typed in the chat composer"
        >
          <button
            type="button"
            onClick={onClearDraft}
            className="rounded-md border border-border/60 bg-background px-2 py-1 text-xs hover:border-primary"
          >
            Clear draft
          </button>
        </Row>
      </Section>

      <Section title="Server">
        <Row label="Endpoint" hint="Local Remi Code server">
          <div className="flex items-center gap-2">
            <code className="rounded bg-card px-2 py-0.5 text-[11px] text-muted-foreground">
              {serverInfo
                ? `http://${serverInfo.host}:${serverInfo.port}`
                : "—"}
            </code>
            <button
              type="button"
              onClick={onCopyEndpoint}
              disabled={!serverInfo}
              className="rounded-md border border-border/60 bg-background px-2 py-1 text-xs hover:border-primary disabled:opacity-50"
            >
              {copied ? t("chat.copied") : t("chat.copy")}
            </button>
          </div>
        </Row>
        <Row label="Transport" hint="WebSocket state">
          <span
            className={
              transport === "open"
                ? "text-xs text-emerald-400"
                : "text-xs text-amber-400"
            }
          >
            {transport}
          </span>
        </Row>
        <Row label="Providers" hint="Adapter registry size">
          <span className="text-xs text-muted-foreground">
            {(providersQuery.data ?? []).length} configured
          </span>
        </Row>
      </Section>

      <Section title="About">
        <p className="text-xs text-muted-foreground">
          Remi Code is a Rust-based migration of Peak Code. The full settings
          surface (Provider keys, keybindings, theme packs, voice, debug) ships
          in the M2 milestone.
        </p>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-border/60 bg-card/40 p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm text-foreground">{label}</div>
        {hint ? (
          <div className="text-[11px] text-muted-foreground">{hint}</div>
        ) : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
