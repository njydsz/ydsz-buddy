/**
 * 服务器配置、状态、诊断及相关事件定义。
 * 包含 Provider 状态、使用量快照、语音转录、快捷键、生命周期事件等类型。
 */
import type {
  IsoDateTime,
  NonNegativeInt,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
} from "./baseSchemas";
import type { KeybindingRule, ResolvedKeybindingsConfig } from "./keybindings";
import type { EditorId } from "./editor";
import type { ProviderKind } from "./orchestration";
import type { ServerSettings, ServerSettingsPatch } from "./settings";
import type { ExecutionEnvironmentDescriptor } from "./environment";

/** 语音转录音频 Base64 最大字符数限制 */
const SERVER_VOICE_TRANSCRIPTION_MAX_AUDIO_BASE64_CHARS = 14_000_000;

/** 快捷键配置问题联合类型（快捷键配置错误或条目无效） */
export type ServerConfigIssue =
  | {
      kind: "keybindings.malformed-config";
      message: TrimmedNonEmptyString;
    }
  | {
      kind: "keybindings.invalid-entry";
      message: TrimmedNonEmptyString;
      index: number;
    };

type ServerConfigIssues = ServerConfigIssue[];

/** Provider 状态枚举：就绪、警告、错误 */
export type ServerProviderStatusState = "ready" | "warning" | "error";

/** Provider 认证状态枚举：已认证、未认证、未知 */
export type ServerProviderAuthStatus = "authenticated" | "unauthenticated" | "unknown";

/** Provider 版本建议信息 */
export interface ServerProviderVersionAdvisory {
  status: "unknown" | "current" | "behind_latest";
  currentVersion: TrimmedNonEmptyString | null;
  latestVersion: TrimmedNonEmptyString | null;
  updateCommand: TrimmedNonEmptyString | null;
  canUpdate: boolean;
  checkedAt: IsoDateTime | null;
  message: TrimmedNonEmptyString | null;
}

/** Provider 更新操作的状态跟踪 */
export interface ServerProviderUpdateState {
  status: "idle" | "queued" | "running" | "succeeded" | "failed" | "unchanged";
  startedAt: IsoDateTime | null;
  finishedAt: IsoDateTime | null;
  message: TrimmedNonEmptyString | null;
  output: string | null;
}

/** 单个 Provider 的完整状态信息，包括可用性、认证、版本、更新状态等 */
export interface ServerProviderStatus {
  provider: ProviderKind;
  status: ServerProviderStatusState;
  available: boolean;
  authStatus: ServerProviderAuthStatus;
  authType?: TrimmedNonEmptyString;
  authLabel?: TrimmedNonEmptyString;
  voiceTranscriptionAvailable?: boolean;
  version?: TrimmedNonEmptyString | null;
  checkedAt: IsoDateTime;
  message?: TrimmedNonEmptyString;
  /** 版本建议信息，指示是否为最新版本及更新命令 */
  versionAdvisory?: ServerProviderVersionAdvisory;
  /** Provider 更新操作的状态跟踪 */
  updateState?: ServerProviderUpdateState;
}

type ServerProviderStatuses = ServerProviderStatus[];

/** 服务器配置信息，包含工作目录、快捷键、Provider 状态、可用编辑器等 */
export interface ServerConfig {
  cwd: TrimmedNonEmptyString;
  homeDir?: TrimmedNonEmptyString;
  worktreesDir: TrimmedNonEmptyString;
  keybindingsConfigPath: TrimmedNonEmptyString;
  keybindings: ResolvedKeybindingsConfig;
  issues: ServerConfigIssues;
  providers: ServerProviderStatuses;
  availableEditors: EditorId[];
}

/** 服务器管理的 Git Worktree 信息 */
export interface ServerManagedWorktree {
  path: TrimmedNonEmptyString;
  workspaceRoot: TrimmedNonEmptyString;
}

/** 列出所有 Worktree 的结果 */
export interface ServerListWorktreesResult {
  worktrees: ServerManagedWorktree[];
}

/** Provider 使用量限制信息，包含窗口、已用百分比、重置时间等 */
export interface ServerProviderUsageLimit {
  window: TrimmedNonEmptyString;
  usedPercent?: number;
  resetsAt?: IsoDateTime;
  windowDurationMins?: NonNegativeInt;
}

/** Provider 使用量信息行（标签-值对） */
export interface ServerProviderUsageLine {
  label: TrimmedNonEmptyString;
  value: TrimmedNonEmptyString;
  subtitle?: TrimmedNonEmptyString;
}

/** Provider 使用量快照，包含限制和使用量明细 */
export interface ServerProviderUsageSnapshot {
  provider: ProviderKind;
  updatedAt: IsoDateTime;
  limits: ServerProviderUsageLimit[];
  usageLines: ServerProviderUsageLine[];
  source: TrimmedNonEmptyString;
}

/** 获取 Provider 使用量快照的输入参数 */
export interface ServerGetProviderUsageSnapshotInput {
  provider: ProviderKind;
  homePath?: TrimmedNonEmptyString;
}

/** 获取 Provider 使用量快照的结果（可能为空） */
export type ServerGetProviderUsageSnapshotResult = ServerProviderUsageSnapshot | null;

/** 服务器内存使用诊断信息 */
export interface ServerDiagnosticsMemory {
  rssBytes: NonNegativeInt;
  heapTotalBytes: NonNegativeInt;
  heapUsedBytes: NonNegativeInt;
  externalBytes: NonNegativeInt;
  arrayBuffersBytes: NonNegativeInt;
}

/** 子进程诊断信息 */
export interface ServerDiagnosticsChildProcess {
  pid: NonNegativeInt;
  ppid: NonNegativeInt;
  rssBytes: NonNegativeInt;
  virtualSizeBytes: NonNegativeInt;
  command: string;
  args: string;
}

/** 服务器诊断结果，包含进程信息、子进程、项目/线程统计 */
export interface ServerDiagnosticsResult {
  generatedAt: IsoDateTime;
  process: {
    pid: NonNegativeInt;
    uptimeSeconds: NonNegativeInt;
    memory: ServerDiagnosticsMemory;
  };
  childProcesses: ServerDiagnosticsChildProcess[];
  childProcessTotalCount: NonNegativeInt;
  childProcessTotalRssBytes: NonNegativeInt;
  projection: {
    projectCount: NonNegativeInt;
    threadCount: NonNegativeInt;
  };
}

/** 语音转录请求输入，包含音频数据和元信息 */
export interface ServerVoiceTranscriptionInput {
  provider: ProviderKind;
  cwd: TrimmedNonEmptyString;
  threadId?: ThreadId;
  mimeType: TrimmedNonEmptyString;
  sampleRateHz: NonNegativeInt;
  durationMs: NonNegativeInt;
  audioBase64: TrimmedNonEmptyString;
}

/** 语音转录结果 */
export interface ServerVoiceTranscriptionResult {
  text: TrimmedNonEmptyString;
}

/** 新增或更新快捷键规则的输入 */
export type ServerUpsertKeybindingInput = KeybindingRule;

/** 新增或更新快捷键规则的结果，返回更新后的配置和问题列表 */
export interface ServerUpsertKeybindingResult {
  keybindings: ResolvedKeybindingsConfig;
  issues: ServerConfigIssues;
}

/** 服务器配置更新事件载荷 */
export interface ServerConfigUpdatedPayload {
  issues: ServerConfigIssues;
  providers: ServerProviderStatuses;
}

/** Provider 状态更新事件载荷 */
export interface ServerProviderStatusesUpdatedPayload {
  providers: ServerProviderStatuses;
}

/** 服务器设置更新事件载荷 */
export interface ServerSettingsUpdatedPayload {
  settings: ServerSettings;
}

/** 服务器生命周期欢迎事件载荷，包含初始项目信息 */
export interface ServerLifecycleWelcomePayload {
  cwd: TrimmedNonEmptyString;
  homeDir?: TrimmedNonEmptyString;
  projectName: TrimmedNonEmptyString;
  bootstrapProjectId?: ProjectId;
  bootstrapThreadId?: ThreadId;
}

/** 服务器生命周期流事件：欢迎、就绪、维护任务 */
export type ServerLifecycleStreamEvent =
  | {
      type: "welcome";
      payload: ServerLifecycleWelcomePayload;
    }
  | {
      type: "ready";
      payload: {
        at: IsoDateTime;
      };
    }
  | {
      type: "maintenance";
      payload: {
        task: "thread-retention";
        state: "started" | "progress" | "compacting" | "completed" | "failed";
        at: IsoDateTime;
        deletedCount?: number;
        purgedCount?: number;
        totalCount?: number;
        freePageCount?: number;
        error?: string;
      };
    };

/** 服务器配置流事件：快照、配置更新、Provider 状态更新、设置更新 */
export type ServerConfigStreamEvent =
  | {
      type: "snapshot";
      config: ServerConfig;
    }
  | {
      type: "configUpdated";
      payload: ServerConfigUpdatedPayload;
    }
  | {
      type: "providerStatuses";
      payload: ServerProviderStatusesUpdatedPayload;
    }
  | {
      type: "settingsUpdated";
      payload: ServerSettingsUpdatedPayload;
    };

/** 刷新 Provider 列表的结果 */
export type ServerRefreshProvidersResult = ServerProviderStatusesUpdatedPayload;

/** 更新 Provider 的输入参数 */
export interface ServerProviderUpdateInput {
  provider: ProviderKind;
}

/** Provider 更新失败错误 */
export class ServerProviderUpdateError extends Error {
  readonly _tag = "ServerProviderUpdateError";
  constructor(
    readonly provider: ProviderKind,
    readonly reason: TrimmedNonEmptyString,
  ) {
    super(`Provider update failed for ${provider}: ${reason}`);
    this.name = "ServerProviderUpdateError";
  }
}

/** Provider 更新结果 */
export type ServerProviderUpdateResult = ServerProviderStatusesUpdatedPayload;

/** 获取服务器设置的结果 */
export type ServerGetSettingsResult = ServerSettings;

/** 获取执行环境描述的结果 */
export type ServerGetEnvironmentResult = ExecutionEnvironmentDescriptor;

/** 更新服务器设置的输入参数 */
export type ServerUpdateSettingsInput = ServerSettingsPatch;

/** 更新服务器设置的结果 */
export type ServerUpdateSettingsResult = ServerSettings;
