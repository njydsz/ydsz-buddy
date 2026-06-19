// Typed RPC façade over the JSON-RPC WebSocket transport. Routes and
// components should import from this file rather than touching the
// transport directly. Method names are sourced from
// `remi-contracts::RpcMethod` and documented inline.

import { call } from "./wsTransport";

export interface Thread {
  id: string;
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt?: string;
  archivedAt?: string | null;
  isPinned?: boolean;
  session?: { status: string; provider: string } | null;
  latestTurn?: unknown | null;
  hasPendingApprovals?: boolean;
  hasPendingUserInput?: boolean;
}

export interface Project {
  id: string;
  name: string;
  kind: "project" | "workspace";
  remoteName: string;
  folderName: string;
  localName?: string | null;
  cwd: string;
  scripts: Array<{ id: string; name: string; command: string }>;
  expanded: boolean;
}

export interface TerminalSession {
  sessionId: string;
  threadId: string;
  shell: string;
  cols: number;
  rows: number;
}

export interface FilesystemEntry {
  path: string;
  name: string;
  isDirectory: boolean;
  size?: number;
  modifiedAt?: string;
  children?: FilesystemEntry[];
}

export interface ProviderSettings {
  id: string;
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  enabled: boolean;
  lastUpdated?: string;
}

export interface Keybinding {
  id: string;
  /** Human-readable label, e.g. "Send message" */
  label: string;
  /** Chord string, e.g. "Mod+Enter" */
  chord: string;
  /** Conflict with another keybinding id, if detected. */
  conflictsWith?: string;
}

export interface ThemePack {
  id: string;
  name: string;
  author?: string;
  description?: string;
  source: "built-in" | "user";
  colors: Record<string, string>;
}

export interface AuthBootstrapState {
  needsPairing: boolean;
  clientId?: string;
  expiresAt?: string;
}

export interface AuthPairingInfo {
  pairingCode: string;
  pairingLink?: string;
  expiresAt: string;
}

export interface VoiceSettings {
  enabled: boolean;
  language: string;
  /** Audio input device id, when supported by the platform. */
  deviceId?: string;
  /** Whisper / upstream transcription model identifier. */
  model?: string;
}

export interface DebugSettings {
  verboseLogging: boolean;
  /** Persist JSON-RPC frames for postmortem inspection. */
  recordFrames: boolean;
  /** How many frames to keep in the ring buffer. */
  maxFrames: number;
}

export interface BackupSnapshot {
  id: string;
  createdAt: string;
  byteSize: number;
  description?: string;
  source: "auto" | "manual";
}

export const rpc = {
  // Authentication
  authBootstrap: () => call<{ needsPairing: boolean }>("auth.bootstrap"),
  authCreatePairingCredential: (label?: string) =>
    call<{ pairingCode: string; expiresAt: string }>("auth.createPairingCredential", { label }),
  authRevokePairingLink: (linkId: string) =>
    call<void>("auth.revokePairingLink", { linkId }),
  authRevokeClientSession: (sessionId: string) =>
    call<void>("auth.revokeClientSession", { sessionId }),

  // Threads
  threadList: () => call<Thread[]>("thread.list"),
  threadGet: (threadId: string) => call<Thread>("thread.get", { threadId }),
  threadCreate: (projectId: string, title?: string) =>
    call<Thread>("thread.create", { projectId, title }),
  threadDelete: (threadId: string) => call<void>("thread.delete", { threadId }),
  threadListMessages: (threadId: string) =>
    call<Array<{ id: string; role: string; text: string; createdAt: string }>>(
      "thread.listMessages",
      { threadId },
    ),
  threadListTurns: (threadId: string) =>
    call<Array<{ id: string; state: string; createdAt: string }>>(
      "thread.listTurns",
      { threadId },
    ),
  threadSendMessage: (input: {
    threadId: string;
    text: string;
    attachments?: unknown[];
  }) => call<{ turnId: string }>("thread.sendMessage", input),
  threadCancel: (threadId: string) =>
    call<{ cancelled: boolean }>("thread.cancel", { threadId }),
  threadRetryTurn: (threadId: string, turnId: string) =>
    call<{ turnId: string }>("thread.retryTurn", { threadId, turnId }),

  // Projects
  projectsList: () => call<Project[]>("projects.list"),
  projectsAdd: (input: { name: string; cwd: string; kind?: "project" | "workspace" }) =>
    call<Project>("projects.add", input),
  projectsRemove: (projectId: string) =>
    call<void>("projects.remove", { projectId }),

  // Filesystem
  filesystemBrowse: (input: { path: string; recursive?: boolean; limit?: number }) =>
    call<{ entries: FilesystemEntry[]; total: number }>("filesystem.browse", input),
  filesystemReadFile: (path: string) =>
    call<{ content: string; encoding: "utf-8" | "base64" }>(
      "filesystem.readFile",
      { path },
    ),
  filesystemWriteFile: (path: string, content: string) =>
    call<{ bytesWritten: number }>("filesystem.writeFile", { path, content }),
  filesystemCreateDirectory: (path: string) =>
    call<{ path: string }>("filesystem.createDirectory", { path }),
  filesystemDeletePath: (path: string) =>
    call<void>("filesystem.deletePath", { path }),

  // Git
  gitStatus: (cwd: string) => call<{ branch: string; dirty: boolean; files: unknown[] }>(
    "git.status",
    { cwd },
  ),
  gitCheckout: (cwd: string, ref: string) =>
    call<void>("git.checkout", { cwd, ref }),
  gitCreateBranch: (cwd: string, name: string, baseRef?: string) =>
    call<{ branch: string }>("git.createBranch", { cwd, name, baseRef }),
  gitListBranches: (cwd: string) =>
    call<Array<{ name: string; isCurrent: boolean }>>("git.listBranches", { cwd }),
  gitPull: (cwd: string) => call<{ updated: boolean }>("git.pull", { cwd }),
  gitReadWorkingTreeDiff: (cwd: string) =>
    call<{ files: unknown[] }>("git.readWorkingTreeDiff", { cwd }),
  gitSummarizeDiff: (cwd: string, maxLength?: number) =>
    call<{ summary: string }>("git.summarizeDiff", { cwd, maxLength }),

  // Terminal
  terminalCreate: (input: { threadId: string; shell?: string; cols?: number; rows?: number }) =>
    call<TerminalSession>("terminal.create", input),
  terminalWrite: (sessionId: string, data: string) =>
    call<void>("terminal.write", { sessionId, data }),
  terminalResize: (sessionId: string, cols: number, rows: number) =>
    call<void>("terminal.resize", { sessionId, cols, rows }),
  terminalClose: (sessionId: string) =>
    call<void>("terminal.close", { sessionId }),
  terminalList: () => call<TerminalSession[]>("terminal.list"),
  terminalStatus: (sessionId: string) =>
    call<{ status: "active" | "exited"; exitCode?: number }>(
      "terminal.status",
      { sessionId },
    ),
  terminalClear: (sessionId: string) => call<void>("terminal.clear", { sessionId }),
  terminalRestart: (sessionId: string) => call<void>("terminal.restart", { sessionId }),
  terminalReplay: (sessionId: string) =>
    call<Array<{ offset: number; data: string }>>("terminal.replay", { sessionId }),

  // Provider
  providerListCommands: (provider: string) =>
    call<Array<{ id: string; label: string; description?: string }>>(
      "provider.listCommands",
      { provider },
    ),

  // Editor
  editorOpen: (path: string, editor?: string) =>
    call<void>("editor.open", { path, editor }),

  // Settings (M2 surface)
  settingsGet: () =>
    call<{
      providers: ProviderSettings[];
      keybindings: Keybinding[];
      themePacks: ThemePack[];
      voice: VoiceSettings;
      debug: DebugSettings;
      activeThemePackId: string;
    }>("settings.get"),
  settingsUpdate: (patch: Record<string, unknown>) =>
    call<void>("settings.update", { patch }),

  // Provider settings (M2)
  providerListSettings: () => call<ProviderSettings[]>("provider.listSettings"),
  providerUpdateSettings: (id: string, patch: Partial<ProviderSettings>) =>
    call<ProviderSettings>("provider.updateSettings", { provider: id, patch }),

  // Keybindings (M2)
  keybindingsList: () => call<Keybinding[]>("keybindings.list"),
  keybindingsUpdate: (id: string, chord: string) =>
    call<Keybinding>("keybindings.update", { id, chord }),
  keybindingsReset: () => call<Keybinding[]>("keybindings.reset"),

  // Theme packs (M2)
  themeList: () => call<ThemePack[]>("theme.list"),
  themeActivate: (id: string) => call<void>("theme.activate", { id }),
  themeImport: (json: string) =>
    call<ThemePack>("theme.import", { json }),
  themeRemove: (id: string) => call<void>("theme.remove", { id }),
  themeExport: (id: string) =>
    call<{ json: string; filename: string }>("theme.export", { id }),

  // Voice (M2)
  voiceGet: () => call<VoiceSettings>("voice.get"),
  voiceUpdate: (patch: Partial<VoiceSettings>) =>
    call<VoiceSettings>("voice.update", { patch }),

  // Debug (M2)
  debugGet: () => call<DebugSettings>("debug.get"),
  debugUpdate: (patch: Partial<DebugSettings>) =>
    call<DebugSettings>("debug.update", { patch }),

  // Backup (M2)
  backupList: () => call<BackupSnapshot[]>("backup.list"),
  backupCreate: (description?: string) =>
    call<BackupSnapshot>("backup.create", { description }),
  backupRestore: (id: string) => call<void>("backup.restore", { id }),
  backupDelete: (id: string) => call<void>("backup.delete", { id }),
} as const;

// Re-export the raw call so the rest of the app can use it for
// ad-hoc RPCs (cancel, retry, custom events).
export { call } from "./wsTransport";
