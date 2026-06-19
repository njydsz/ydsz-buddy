// Keybindings editor. Surfaces the global hotkey table and detects
// conflicts locally (so the UI feels instant even when the server is
// down). The `chord` strings follow the VS Code / Electron
// convention: `Mod+Shift+R` etc.

import { useEffect, useState } from "react";
import { useSettingsStore } from "@/store/settings";
import { useT } from "@/i18n";
import { toast } from "@/lib/toast";

const KEY_PATTERN = /^(Mod|Ctrl|Control|Shift|Alt|Option|Meta)(\+(Mod|Ctrl|Control|Shift|Alt|Option|Meta|\w))*$/;

function normalizeChord(input: string): string {
  return input
    .split("+")
    .map((piece) => {
      const lower = piece.toLowerCase();
      if (lower === "cmd" || lower === "meta") return "Mod";
      if (lower === "control") return "Ctrl";
      if (lower === "option") return "Alt";
      return piece.length === 1 ? piece.toUpperCase() : piece;
    })
    .join("+");
}

function isChordValid(chord: string): boolean {
  return KEY_PATTERN.test(chord);
}

export function KeybindingsPanel() {
  const t = useT();
  const keybindings = useSettingsStore((s) => s.keybindings);
  const setKeybinding = useSettingsStore((s) => s.setKeybinding);
  const resetKeybindings = useSettingsStore((s) => s.resetKeybindings);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editing == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setEditing(null);
        setDraft("");
        setError(null);
        return;
      }
      const parts: string[] = [];
      if (e.metaKey || e.ctrlKey) parts.push("Mod");
      if (e.shiftKey) parts.push("Shift");
      if (e.altKey) parts.push("Alt");
      const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      if (key !== "Shift" && key !== "Control" && key !== "Alt" && key !== "Meta") {
        parts.push(key);
      }
      setDraft(parts.join("+"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing]);

  const conflictCount = keybindings.filter((k) => k.conflictsWith).length / 2;

  const onCommit = (id: string) => {
    const normalized = normalizeChord(draft);
    if (!isChordValid(normalized)) {
      setError(t("settings.keybindings.invalid"));
      return;
    }
    setKeybinding(id, normalized);
    setEditing(null);
    setDraft("");
    setError(null);
    toast.success(t("settings.keybindings.saved"), { source: "settings" });
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {t("settings.keybindings.intro")}
      </p>
      {conflictCount > 0 ? (
        <div className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {t("settings.keybindings.conflicts", { n: conflictCount })}
        </div>
      ) : null}
      <div className="overflow-hidden rounded-md border border-border/60">
        <table className="w-full text-sm">
          <thead className="bg-card/50 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2">{t("settings.keybindings.action")}</th>
              <th className="px-3 py-2">{t("settings.keybindings.chord")}</th>
            </tr>
          </thead>
          <tbody>
            {keybindings.map((kb) => {
              const isEditing = editing === kb.id;
              const hasConflict = Boolean(kb.conflictsWith);
              return (
                <tr
                  key={kb.id}
                  className={
                    hasConflict
                      ? "border-t border-amber-500/30 bg-amber-500/5"
                      : "border-t border-border/40"
                  }
                >
                  <td className="px-3 py-2 align-top">
                    <div className="text-foreground">{kb.label}</div>
                    <div className="text-[10px] text-muted-foreground">{kb.id}</div>
                    {hasConflict ? (
                      <div className="text-[10px] text-amber-300">
                        {t("settings.keybindings.conflict", { other: kb.conflictsWith })}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <div className="flex flex-col gap-2">
                        <input
                          autoFocus
                          className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                          value={draft}
                          placeholder={t("settings.keybindings.pressPrompt")}
                          readOnly
                        />
                        {error ? (
                          <div className="text-[10px] text-red-300">{error}</div>
                        ) : null}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="rounded border border-primary bg-primary/10 px-2 py-0.5 text-[11px] text-primary hover:bg-primary/20"
                            onClick={() => onCommit(kb.id)}
                          >
                            {t("settings.keybindings.save")}
                          </button>
                          <button
                            type="button"
                            className="rounded border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground hover:border-primary hover:text-foreground"
                            onClick={() => {
                              setEditing(null);
                              setDraft("");
                              setError(null);
                            }}
                          >
                            {t("settings.keybindings.cancel")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <code className="rounded bg-background px-2 py-0.5 font-mono text-[11px]">
                          {kb.chord}
                        </code>
                        <button
                          type="button"
                          className="rounded border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground hover:border-primary hover:text-foreground"
                          onClick={() => {
                            setEditing(kb.id);
                            setDraft("");
                          }}
                        >
                          {t("settings.keybindings.rebind")}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          className="rounded-md border border-border bg-background px-3 py-1 text-xs text-muted-foreground hover:border-primary hover:text-foreground"
          onClick={() => {
            resetKeybindings();
            toast.info(t("settings.keybindings.reset"), { source: "settings" });
          }}
        >
          {t("settings.keybindings.resetAll")}
        </button>
      </div>
    </div>
  );
}
