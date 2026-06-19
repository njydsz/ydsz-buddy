// Provider settings panel. Renders one card per provider with a
// toggle, an API key field (masked), an optional base URL, and a
// default-model selector. The settings are kept in
// `useSettingsStore` and persisted to localStorage as a "shadow" of
// the server's authoritative `ServerConfig`.

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, type ProviderSettings } from "@/lib/rpc";
import { useSettingsStore } from "@/store/settings";
import { useT } from "@/i18n";
import { toast } from "@/lib/toast";
import { log } from "@/lib/logger";

const PROVIDER_LABELS: Record<string, { name: string; models: string[]; description: string }> = {
  claude: {
    name: "Anthropic Claude",
    models: ["claude-3-7-sonnet", "claude-3-5-sonnet", "claude-3-opus"],
    description: "Anthropic's Claude models via the Messages API.",
  },
  codex: {
    name: "OpenAI Codex",
    models: ["gpt-5-codex", "gpt-5", "gpt-4o", "o3"],
    description: "OpenAI Codex — REST and app-server protocols.",
  },
  cursor: {
    name: "Cursor",
    models: ["cursor-default", "cursor-fast"],
    description: "Cursor CLI / ACP bridge for the Cursor agent.",
  },
  gemini: {
    name: "Google Gemini",
    models: ["gemini-2-5-pro", "gemini-2-5-flash", "gemini-2-0-pro"],
    description: "Google Gemini models via the Generative Language API.",
  },
  grok: {
    name: "xAI Grok",
    models: ["grok-3", "grok-3-mini", "grok-2"],
    description: "xAI Grok models.",
  },
  opencode: {
    name: "OpenCode",
    models: ["opencode-default", "opencode-fast"],
    description: "OpenCode CLI / stdio bridge.",
  },
  pi: {
    name: "Pi",
    models: ["pi-default", "pi-fast"],
    description: "Pi CLI / stdio bridge.",
  },
  kilo: {
    name: "Kilo",
    models: ["kilo-default", "kilo-fast"],
    description: "Kilo CLI / stdio bridge.",
  },
};

export function ProvidersPanel() {
  const t = useT();
  const providers = useSettingsStore((s) => s.providers);
  const setProvider = useSettingsStore((s) => s.setProvider);
  const queryClient = useQueryClient();
  const [revealKey, setRevealKey] = useState<string | null>(null);

  // The Rust `provider.listSettings` RPC is the authoritative source;
  // we refresh it on mount so a freshly restarted server can push
  // updated keys/availability into the UI.
  const remoteQuery = useQuery({
    queryKey: ["providers", "settings"],
    queryFn: () => rpc.providerListSettings(),
    retry: 0,
  });

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; patch: Partial<ProviderSettings> }) =>
      rpc.providerUpdateSettings(input.id, input.patch),
    onSuccess: (next) => {
      setProvider(next.id, next);
      queryClient.invalidateQueries({ queryKey: ["providers", "settings"] });
      toast.success(t("settings.providers.saved"), { source: "settings" });
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : String(e);
      log.error("providerUpdateSettings failed", { error: msg });
      toast.error(msg, { source: "settings" });
    },
  });

  const onSave = (id: string) => {
    const local = providers.find((p) => p.id === id);
    if (!local) return;
    updateMutation.mutate({
      id,
      patch: {
        apiKey: local.apiKey,
        baseUrl: local.baseUrl,
        defaultModel: local.defaultModel,
        enabled: local.enabled,
      },
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {t("settings.providers.intro")}
      </p>
      {remoteQuery.isError ? (
        <div className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {t("settings.providers.offlineHint")}
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {providers.map((provider) => {
          const meta = PROVIDER_LABELS[provider.id] ?? {
            name: provider.id,
            models: provider.defaultModel ? [provider.defaultModel] : [],
            description: "",
          };
          return (
            <div
              key={provider.id}
              className="space-y-3 rounded-md border border-border/60 bg-card/40 p-3"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-medium text-foreground">
                    {meta.name}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {meta.description}
                  </div>
                </div>
                <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={provider.enabled}
                    onChange={(e) =>
                      setProvider(provider.id, { enabled: e.target.checked })
                    }
                  />
                  {t("settings.providers.enabled")}
                </label>
              </div>
              <label className="block text-[11px] text-muted-foreground">
                {t("settings.providers.apiKey")}
                <div className="mt-1 flex gap-1">
                  <input
                    type={revealKey === provider.id ? "text" : "password"}
                    className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                    value={provider.apiKey ?? ""}
                    onChange={(e) =>
                      setProvider(provider.id, { apiKey: e.target.value })
                    }
                    placeholder="sk-…"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    className="rounded border border-border bg-background px-2 text-[10px] text-muted-foreground hover:border-primary hover:text-foreground"
                    onClick={() =>
                      setRevealKey((cur) =>
                        cur === provider.id ? null : provider.id,
                      )
                    }
                  >
                    {revealKey === provider.id ? t("settings.providers.hide") : t("settings.providers.show")}
                  </button>
                </div>
              </label>
              <label className="block text-[11px] text-muted-foreground">
                {t("settings.providers.baseUrl")}
                <input
                  type="text"
                  className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                  value={provider.baseUrl ?? ""}
                  onChange={(e) =>
                    setProvider(provider.id, { baseUrl: e.target.value })
                  }
                  placeholder="https://api.example.com"
                  spellCheck={false}
                />
              </label>
              <label className="block text-[11px] text-muted-foreground">
                {t("settings.providers.defaultModel")}
                <select
                  className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                  value={provider.defaultModel ?? ""}
                  onChange={(e) =>
                    setProvider(provider.id, { defaultModel: e.target.value })
                  }
                >
                  {meta.models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center justify-end gap-2">
                <span className="text-[10px] text-muted-foreground">
                  {provider.lastUpdated
                    ? t("settings.providers.lastUpdated", {
                        time: new Date(provider.lastUpdated).toLocaleTimeString(),
                      })
                    : ""}
                </span>
                <button
                  type="button"
                  className="rounded-md border border-primary bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
                  onClick={() => onSave(provider.id)}
                  disabled={updateMutation.isPending}
                >
                  {t("settings.providers.save")}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
