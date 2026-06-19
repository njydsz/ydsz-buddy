// M2 client-side settings store. Mirrors the Rust `ServerConfig` and
// persists a slim subset of preferences to localStorage so the
// settings UI is responsive even when the server is offline. The
// full settings surface (voice, debug, backup) is still authoritative
// on the server side and queried through the `settings.*` RPCs.

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  DebugSettings,
  Keybinding,
  ProviderSettings,
  ThemePack,
  VoiceSettings,
} from "@/lib/rpc";

export const DEFAULT_KEYBINDINGS: Keybinding[] = [
  { id: "composer.send", label: "Send message", chord: "Mod+Enter" },
  { id: "composer.attach", label: "Attach file", chord: "Mod+Shift+A" },
  { id: "composer.cancel", label: "Cancel turn", chord: "Escape" },
  { id: "sidebar.toggle", label: "Toggle sidebar", chord: "Mod+B" },
  { id: "settings.open", label: "Open settings", chord: "Mod+," },
  { id: "chat.retry", label: "Retry last turn", chord: "Mod+R" },
];

export const DEFAULT_THEME_PACKS: ThemePack[] = [
  {
    id: "remi.dark",
    name: "Remi Dark",
    source: "built-in",
    description: "Default dark theme (slate + indigo accent).",
    colors: {
      "--background": "0 0% 7%",
      "--foreground": "210 20% 95%",
      "--primary": "239 84% 67%",
      "--accent": "217 19% 27%",
      "--border": "215 14% 22%",
    },
  },
  {
    id: "remi.light",
    name: "Remi Light",
    source: "built-in",
    description: "Default light theme (white + indigo accent).",
    colors: {
      "--background": "0 0% 100%",
      "--foreground": "222 47% 11%",
      "--primary": "239 84% 60%",
      "--accent": "226 100% 96%",
      "--border": "220 13% 91%",
    },
  },
  {
    id: "remi.solarized",
    name: "Solarized",
    source: "built-in",
    description: "Classic solarized dark palette.",
    colors: {
      "--background": "192 100% 11%",
      "--foreground": "44 96% 89%",
      "--primary": "175 59% 40%",
      "--accent": "192 80% 14%",
      "--border": "192 35% 18%",
    },
  },
];

export const DEFAULT_PROVIDERS: ProviderSettings[] = [
  { id: "claude", enabled: false, defaultModel: "claude-3-7-sonnet" },
  { id: "codex", enabled: false, defaultModel: "gpt-5-codex" },
  { id: "cursor", enabled: false, defaultModel: "cursor-default" },
  { id: "gemini", enabled: false, defaultModel: "gemini-2-5-pro" },
  { id: "grok", enabled: false, defaultModel: "grok-3" },
  { id: "opencode", enabled: false, defaultModel: "opencode-default" },
  { id: "pi", enabled: false, defaultModel: "pi-default" },
  { id: "kilo", enabled: false, defaultModel: "kilo-default" },
];

export const DEFAULT_VOICE: VoiceSettings = {
  enabled: false,
  language: "en",
  model: "whisper-1",
};

export const DEFAULT_DEBUG: DebugSettings = {
  verboseLogging: false,
  recordFrames: false,
  maxFrames: 256,
};

export interface SettingsState {
  providers: ProviderSettings[];
  keybindings: Keybinding[];
  themePacks: ThemePack[];
  activeThemePackId: string;
  voice: VoiceSettings;
  debug: DebugSettings;
  /** Server-side bootstrap state. Null when not yet queried. */
  auth: { needsPairing: boolean; clientId?: string } | null;
  /** Last user-issued pairing code, kept for display only. */
  lastPairingCode: string | null;

  // Provider settings
  setProvider: (id: string, patch: Partial<ProviderSettings>) => void;
  // Keybindings
  setKeybinding: (id: string, chord: string) => void;
  resetKeybindings: () => void;
  // Theme packs
  activateTheme: (id: string) => void;
  addThemePack: (pack: ThemePack) => void;
  removeThemePack: (id: string) => void;
  // Voice
  setVoice: (patch: Partial<VoiceSettings>) => void;
  // Debug
  setDebug: (patch: Partial<DebugSettings>) => void;
  // Auth
  setAuth: (auth: SettingsState["auth"]) => void;
  setLastPairingCode: (code: string | null) => void;
}

const STORAGE_KEY = "remi:settings:v1";

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      providers: DEFAULT_PROVIDERS,
      keybindings: DEFAULT_KEYBINDINGS,
      themePacks: DEFAULT_THEME_PACKS,
      activeThemePackId: "remi.dark",
      voice: DEFAULT_VOICE,
      debug: DEFAULT_DEBUG,
      auth: null,
      lastPairingCode: null,

      setProvider: (id, patch) =>
        set((s) => ({
          providers: s.providers.map((p) =>
            p.id === id ? { ...p, ...patch, lastUpdated: new Date().toISOString() } : p,
          ),
        })),
      setKeybinding: (id, chord) =>
        set((s) => {
          // Detect conflicts across the rest of the map.
          const others = s.keybindings.filter((k) => k.id !== id);
          const conflict = others.find(
            (k) => k.chord.toLowerCase() === chord.toLowerCase(),
          );
          return {
            keybindings: s.keybindings.map((k) =>
              k.id === id
                ? { ...k, chord, conflictsWith: conflict?.id }
                : conflict
                  ? { ...k, conflictsWith: id }
                  : { ...k, conflictsWith: undefined },
            ),
          };
        }),
      resetKeybindings: () => set({ keybindings: DEFAULT_KEYBINDINGS }),
      activateTheme: (id) => set({ activeThemePackId: id }),
      addThemePack: (pack) =>
        set((s) =>
          s.themePacks.some((p) => p.id === pack.id)
            ? s
            : { themePacks: [...s.themePacks, pack] },
        ),
      removeThemePack: (id) =>
        set((s) => ({
          themePacks: s.themePacks.filter((p) => p.id !== id),
          activeThemePackId:
            s.activeThemePackId === id ? "remi.dark" : s.activeThemePackId,
        })),
      setVoice: (patch) => set((s) => ({ voice: { ...s.voice, ...patch } })),
      setDebug: (patch) => set((s) => ({ debug: { ...s.debug, ...patch } })),
      setAuth: (auth) => set({ auth }),
      setLastPairingCode: (code) => set({ lastPairingCode: code }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (s) => ({
        providers: s.providers,
        keybindings: s.keybindings,
        themePacks: s.themePacks,
        activeThemePackId: s.activeThemePackId,
        voice: s.voice,
        debug: s.debug,
      }),
    },
  ),
);
