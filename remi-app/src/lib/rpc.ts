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
} as const;

export type RpcClient = typeof rpc;
