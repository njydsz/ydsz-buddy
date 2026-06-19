// Persisted slice of the store. We keep this small on purpose: the
// authoritative thread / project state always comes from the Rust
// server. The persisted slice is just enough to make the UI feel
// sticky across reloads (last active thread, theme, layout, etc).

const STORAGE_KEY = "remi:store:v1";
const STORAGE_VERSION = 1;

export interface PersistedState {
  version: number;
  activeThreadId: string | null;
  activeProjectId: string | null;
  theme: "light" | "dark" | "system";
  language: "en" | "zh-CN";
  composerDraft: string;
  sidebarCollapsed: boolean;
  expandedProjectIds: string[];
  windowBounds: { x: number; y: number; width: number; height: number } | null;
}

export const DEFAULT_PERSISTED_STATE: PersistedState = {
  version: STORAGE_VERSION,
  activeThreadId: null,
  activeProjectId: null,
  theme: "system",
  language: "en",
  composerDraft: "",
  sidebarCollapsed: false,
  expandedProjectIds: [],
  windowBounds: null,
};

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadPersistedState(): PersistedState {
  if (!isBrowser()) return { ...DEFAULT_PERSISTED_STATE };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PERSISTED_STATE };
    const parsed = JSON.parse(raw) as PersistedState;
    if (parsed.version !== STORAGE_VERSION) {
      // Migrations live here. For now we just drop the old shape.
      return { ...DEFAULT_PERSISTED_STATE, ...migrate(parsed) };
    }
    return { ...DEFAULT_PERSISTED_STATE, ...parsed };
  } catch (err) {
    console.warn("[remi-app] failed to load persisted state", err);
    return { ...DEFAULT_PERSISTED_STATE };
  }
}

export function savePersistedState(slice: PersistedState): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(slice));
  } catch (err) {
    // localStorage may be full or blocked by privacy mode; warn but
    // never throw — the UI must keep working.
    console.warn("[remi-app] failed to persist state", err);
  }
}

export function clearPersistedState(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(STORAGE_KEY);
}

function migrate(legacy: unknown): Partial<PersistedState> {
  // Reserved for future shape migrations.
  if (!legacy || typeof legacy !== "object") return {};
  return legacy as Partial<PersistedState>;
}
