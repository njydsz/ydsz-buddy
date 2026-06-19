// Placeholder settings view. The full version (mirroring
// `apps/web/src/components/SettingsView.tsx` in the original Peak Code
// repo) is part of milestone M2 — see `MIGRATION_PLAN.md`.
export function SettingsView() {
  return (
    <div className="m-6 rounded-md border border-dashed border-border/60 p-6 text-sm text-muted-foreground">
      <h2 className="mb-2 text-base font-semibold text-foreground">Settings</h2>
      <p>
        Remi Code settings are stubbed in this skeleton. The full settings surface
        (providers, keybindings, theme packs, voice, debug) is scheduled for the
        M2 milestone.
      </p>
    </div>
  );
}
