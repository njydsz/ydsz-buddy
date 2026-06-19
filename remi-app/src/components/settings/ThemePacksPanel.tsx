// Theme packs panel. Lists built-in and user theme packs, lets the
// user activate a pack, import a JSON pack, and remove user packs.
// Activation writes CSS custom properties to `document.documentElement`
// so the change is visible immediately across the whole UI.

import { useRef, useState } from "react";
import { useSettingsStore, type ThemePack } from "@/store/settings";
import { useT } from "@/i18n";
import { toast } from "@/lib/toast";

function applyTheme(pack: ThemePack) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(pack.colors)) {
    root.style.setProperty(key, value);
  }
}

function isValidPack(value: unknown): value is ThemePack {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    typeof v.colors === "object" &&
    v.colors !== null
  );
}

export function ThemePacksPanel() {
  const t = useT();
  const themePacks = useSettingsStore((s) => s.themePacks);
  const activeId = useSettingsStore((s) => s.activeThemePackId);
  const activateTheme = useSettingsStore((s) => s.activateTheme);
  const addThemePack = useSettingsStore((s) => s.addThemePack);
  const removeThemePack = useSettingsStore((s) => s.removeThemePack);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const onImport = async (file: File) => {
    setImportError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      if (!isValidPack(parsed)) {
        throw new Error("invalid pack");
      }
      const pack: ThemePack = { ...parsed, source: "user" };
      addThemePack(pack);
      activateTheme(pack.id);
      applyTheme(pack);
      toast.success(t("settings.themes.imported", { name: pack.name }), { source: "settings" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setImportError(msg);
      toast.error(t("settings.themes.importFailed"), { source: "settings" });
    }
  };

  const onExport = (pack: ThemePack) => {
    const blob = new Blob([JSON.stringify(pack, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${pack.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onActivate = (pack: ThemePack) => {
    activateTheme(pack.id);
    applyTheme(pack);
    toast.info(t("settings.themes.activated", { name: pack.name }), { source: "settings" });
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {t("settings.themes.intro")}
      </p>
      <div className="flex items-center justify-between">
        <input
          ref={fileInput}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onImport(file);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          className="rounded-md border border-primary bg-primary/10 px-3 py-1 text-xs text-primary hover:bg-primary/20"
          onClick={() => fileInput.current?.click()}
        >
          {t("settings.themes.import")}
        </button>
        <span className="text-[11px] text-muted-foreground">
          {t("settings.themes.active", { name: themePacks.find((p) => p.id === activeId)?.name ?? activeId })}
        </span>
      </div>
      {importError ? (
        <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {t("settings.themes.importFailedHint", { error: importError })}
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {themePacks.map((pack) => {
          const isActive = pack.id === activeId;
          return (
            <div
              key={pack.id}
              className={
                isActive
                  ? "space-y-2 rounded-md border border-primary bg-primary/5 p-3"
                  : "space-y-2 rounded-md border border-border/60 bg-card/40 p-3"
              }
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-medium text-foreground">{pack.name}</div>
                  {pack.description ? (
                    <div className="text-[11px] text-muted-foreground">{pack.description}</div>
                  ) : null}
                </div>
                <span className="rounded-full bg-background/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {pack.source}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {Object.entries(pack.colors).slice(0, 5).map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-center gap-1 rounded bg-background/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  >
                    <span
                      className="inline-block h-2 w-2 rounded-full border border-border"
                      style={{
                        background: `hsl(${value} / 1)`,
                      }}
                    />
                    {key.replace(/^--/, "")}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-end gap-2">
                {pack.source === "user" ? (
                  <button
                    type="button"
                    className="rounded border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[11px] text-red-300 hover:bg-red-500/20"
                    onClick={() => {
                      removeThemePack(pack.id);
                      toast.info(t("settings.themes.removed", { name: pack.name }), { source: "settings" });
                    }}
                  >
                    {t("settings.themes.remove")}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="rounded border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground hover:border-primary hover:text-foreground"
                  onClick={() => onExport(pack)}
                >
                  {t("settings.themes.export")}
                </button>
                <button
                  type="button"
                  className={
                    isActive
                      ? "rounded border border-primary bg-primary px-2 py-0.5 text-[11px] text-primary-foreground"
                      : "rounded border border-primary bg-primary/10 px-2 py-0.5 text-[11px] text-primary hover:bg-primary/20"
                  }
                  onClick={() => onActivate(pack)}
                  disabled={isActive}
                >
                  {isActive ? t("settings.themes.activated") : t("settings.themes.activate")}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
