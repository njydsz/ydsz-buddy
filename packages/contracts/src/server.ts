/**
 * 服务器配置、状态、诊断及相关事件定义。
 * 包含 Provider 状态、使用量快照、语音转录、快捷键、生命周期事件等 Schema。
 */
import { Schema } from "effect";
import {
  IsoDateTime,
  NonNegativeInt,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
} from "./baseSchemas";
import { KeybindingRule, ResolvedKeybindingsConfig } from "./keybindings";
import { EditorId } from "./editor";
import { ProviderKind } from "./orchestration";
import { ServerSettings, ServerSettingsPatch } from "./settings";
import { ExecutionEnvironmentDescriptor } from "./environment";

/** 语音转录音频 Base64 最大字符数限制 */
const SERVER_VOICE_TRANSCRIPTION_MAX_AUDIO_BASE64_CHARS = 14_000_000;

/** 快捷键配置格式错误问题 */
const KeybindingsMalformedConfigIssue = Schema.Struct({
  kind: Schema.Literal("keybindings.malformed-config"),
  message: TrimmedNonEmptyString,
});

/** 快捷键条目无效问题 */
const KeybindingsInvalidEntryIssue = Schema.Struct({
  kind: Schema.Literal("keybindings.invalid-entry"),
  message: TrimmedNonEmptyString,
  index: Schema.Number,
});

/** 服务器配置问题联合类型（快捷键配置错误或条目无效） */
export const ServerConfigIssue = Schema.Union([
  KeybindingsMalformedConfigIssue,
  KeybindingsInvalidEntryIssue,
]);
export type ServerConfigIssue = typeof ServerConfigIssue.Type;

const ServerConfigIssues = Schema.Array(ServerConfigIssue);

/** Provider 状态枚举：就绪、警告、错误 */
export const ServerProviderStatusState = Schema.Literals(["ready", "warning", "error"]);
export type ServerProviderStatusState = typeof ServerProviderStatusState.Type;

/** Provider 认证状态枚举：已认证、未认证、未知 */
export const ServerProviderAuthStatus = Schema.Literals([
  "authenticated",
  "unauthenticated",
  "unknown",
]);
export type ServerProviderAuthStatus = typeof ServerProviderAuthStatus.Type;

/** 单个 Provider 的完整状态信息，包括可用性、认证、版本、更新状态等 */
export const ServerProviderStatus = Schema.Struct({
  provider: ProviderKind,
  status: ServerProviderStatusState,
  available: Schema.Boolean,
  authStatus: ServerProviderAuthStatus,
  authType: Schema.optional(TrimmedNonEmptyString),
  authLabel: Schema.optional(TrimmedNonEmptyString),
  voiceTranscriptionAvailable: Schema.optional(Schema.Boolean),
  version: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  checkedAt: IsoDateTime,
  message: Schema.optional(TrimmedNonEmptyString),
  /** 版本建议信息，指示是否为最新版本及更新命令 */
  versionAdvisory: Schema.optionalKey(
    Schema.Struct({
      status: Schema.Literals(["unknown", "current", "behind_latest"]),
      currentVersion: Schema.NullOr(TrimmedNonEmptyString),
      latestVersion: Schema.NullOr(TrimmedNonEmptyString),
      updateCommand: Schema.NullOr(TrimmedNonEmptyString),
      canUpdate: Schema.Boolean,
      checkedAt: Schema.NullOr(IsoDateTime),
      message: Schema.NullOr(TrimmedNonEmptyString),
    }),
  ),
  /** Provider 更新操作的状态跟踪 */
  updateState: Schema.optionalKey(
    Schema.Struct({
      status: Schema.Literals(["idle", "queued", "running", "succeeded", "failed", "unchanged"]),
      startedAt: Schema.NullOr(IsoDateTime),
      finishedAt: Schema.NullOr(IsoDateTime),
      message: Schema.NullOr(TrimmedNonEmptyString),
      output: Schema.NullOr(Schema.String.check(Schema.isMaxLength(10_000))),
    }),
  ),
});
export type ServerProviderStatus = typeof ServerProviderStatus.Type;

/** Provider 版本建议信息类型 */
export type ServerProviderVersionAdvisory = NonNullable<ServerProviderStatus["versionAdvisory"]>;
/** Provider 更新状态类型 */
export type ServerProviderUpdateState = NonNullable<ServerProviderStatus["updateState"]>;

const ServerProviderStatuses = Schema.Array(ServerProviderStatus);

/** 服务器配置信息，包含工作目录、快捷键、Provider 状态、可用编辑器等 */
export const ServerConfig = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  homeDir: Schema.optional(TrimmedNonEmptyString),
  worktreesDir: TrimmedNonEmptyString,
  keybindingsConfigPath: TrimmedNonEmptyString,
  keybindings: ResolvedKeybindingsConfig,
  issues: ServerConfigIssues,
  providers: ServerProviderStatuses,
  availableEditors: Schema.Array(EditorId),
});
export type ServerConfig = typeof ServerConfig.Type;

/** 服务器管理的 Git Worktree 信息 */
export const ServerManagedWorktree = Schema.Struct({
  path: TrimmedNonEmptyString,
  workspaceRoot: TrimmedNonEmptyString,
});
export type ServerManagedWorktree = typeof ServerManagedWorktree.Type;

/** 列出所有 Worktree 的结果 */
export const ServerListWorktreesResult = Schema.Struct({
  worktrees: Schema.Array(ServerManagedWorktree),
});
export type ServerListWorktreesResult = typeof ServerListWorktreesResult.Type;

/** Provider 使用量限制信息，包含窗口、已用百分比、重置时间等 */
export const ServerProviderUsageLimit = Schema.Struct({
  window: TrimmedNonEmptyString,
  usedPercent: Schema.optional(
    Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)).check(Schema.isLessThanOrEqualTo(100)),
  ),
  resetsAt: Schema.optional(IsoDateTime),
  windowDurationMins: Schema.optional(NonNegativeInt),
});
export type ServerProviderUsageLimit = typeof ServerProviderUsageLimit.Type;

/** Provider 使用量信息行（标签-值对） */
export const ServerProviderUsageLine = Schema.Struct({
  label: TrimmedNonEmptyString,
  value: TrimmedNonEmptyString,
  subtitle: Schema.optional(TrimmedNonEmptyString),
});
export type ServerProviderUsageLine = typeof ServerProviderUsageLine.Type;

/** Provider 使用量快照，包含限制和使用量明细 */
export const ServerProviderUsageSnapshot = Schema.Struct({
  provider: ProviderKind,
  updatedAt: IsoDateTime,
  limits: Schema.Array(ServerProviderUsageLimit),
  usageLines: Schema.Array(ServerProviderUsageLine),
  source: TrimmedNonEmptyString,
});
export type ServerProviderUsageSnapshot = typeof ServerProviderUsageSnapshot.Type;

/** 获取 Provider 使用量快照的输入参数 */
export const ServerGetProviderUsageSnapshotInput = Schema.Struct({
  provider: ProviderKind,
  homePath: Schema.optional(TrimmedNonEmptyString),
});
export type ServerGetProviderUsageSnapshotInput = typeof ServerGetProviderUsageSnapshotInput.Type;

/** 获取 Provider 使用量快照的结果（可能为空） */
export const ServerGetProviderUsageSnapshotResult = Schema.NullOr(ServerProviderUsageSnapshot);
export type ServerGetProviderUsageSnapshotResult = typeof ServerGetProviderUsageSnapshotResult.Type;

/** 服务器内存使用诊断信息 */
export const ServerDiagnosticsMemory = Schema.Struct({
  rssBytes: NonNegativeInt,
  heapTotalBytes: NonNegativeInt,
  heapUsedBytes: NonNegativeInt,
  externalBytes: NonNegativeInt,
  arrayBuffersBytes: NonNegativeInt,
});
export type ServerDiagnosticsMemory = typeof ServerDiagnosticsMemory.Type;

/** 子进程诊断信息 */
export const ServerDiagnosticsChildProcess = Schema.Struct({
  pid: NonNegativeInt,
  ppid: NonNegativeInt,
  rssBytes: NonNegativeInt,
  virtualSizeBytes: NonNegativeInt,
  command: Schema.String,
  args: Schema.String,
});
export type ServerDiagnosticsChildProcess = typeof ServerDiagnosticsChildProcess.Type;

/** 服务器诊断结果，包含进程信息、子进程、项目/线程统计 */
export const ServerDiagnosticsResult = Schema.Struct({
  generatedAt: IsoDateTime,
  process: Schema.Struct({
    pid: NonNegativeInt,
    uptimeSeconds: NonNegativeInt,
    memory: ServerDiagnosticsMemory,
  }),
  childProcesses: Schema.Array(ServerDiagnosticsChildProcess),
  childProcessTotalCount: NonNegativeInt,
  childProcessTotalRssBytes: NonNegativeInt,
  projection: Schema.Struct({
    projectCount: NonNegativeInt,
    threadCount: NonNegativeInt,
  }),
});
export type ServerDiagnosticsResult = typeof ServerDiagnosticsResult.Type;

/** 语音转录请求输入，包含音频数据和元信息 */
export const ServerVoiceTranscriptionInput = Schema.Struct({
  provider: ProviderKind,
  cwd: TrimmedNonEmptyString,
  threadId: Schema.optional(ThreadId),
  mimeType: TrimmedNonEmptyString.check(Schema.isMaxLength(100)),
  sampleRateHz: NonNegativeInt,
  durationMs: NonNegativeInt,
  audioBase64: TrimmedNonEmptyString.check(
    Schema.isMaxLength(SERVER_VOICE_TRANSCRIPTION_MAX_AUDIO_BASE64_CHARS),
  ),
});
export type ServerVoiceTranscriptionInput = typeof ServerVoiceTranscriptionInput.Type;

/** 语音转录结果 */
export const ServerVoiceTranscriptionResult = Schema.Struct({
  text: TrimmedNonEmptyString,
});
export type ServerVoiceTranscriptionResult = typeof ServerVoiceTranscriptionResult.Type;

/** 新增或更新快捷键规则的输入 */
export const ServerUpsertKeybindingInput = KeybindingRule;
export type ServerUpsertKeybindingInput = typeof ServerUpsertKeybindingInput.Type;

/** 新增或更新快捷键规则的结果，返回更新后的配置和问题列表 */
export const ServerUpsertKeybindingResult = Schema.Struct({
  keybindings: ResolvedKeybindingsConfig,
  issues: ServerConfigIssues,
});
export type ServerUpsertKeybindingResult = typeof ServerUpsertKeybindingResult.Type;

/** 服务器配置更新事件载荷 */
export const ServerConfigUpdatedPayload = Schema.Struct({
  issues: ServerConfigIssues,
  providers: ServerProviderStatuses,
});
export type ServerConfigUpdatedPayload = typeof ServerConfigUpdatedPayload.Type;

/** Provider 状态更新事件载荷 */
export const ServerProviderStatusesUpdatedPayload = Schema.Struct({
  providers: ServerProviderStatuses,
});
export type ServerProviderStatusesUpdatedPayload = typeof ServerProviderStatusesUpdatedPayload.Type;

/** 服务器设置更新事件载荷 */
export const ServerSettingsUpdatedPayload = Schema.Struct({
  settings: ServerSettings,
});
export type ServerSettingsUpdatedPayload = typeof ServerSettingsUpdatedPayload.Type;

/** 服务器生命周期欢迎事件载荷，包含初始项目信息 */
export const ServerLifecycleWelcomePayload = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  homeDir: Schema.optional(TrimmedNonEmptyString),
  projectName: TrimmedNonEmptyString,
  bootstrapProjectId: Schema.optional(ProjectId),
  bootstrapThreadId: Schema.optional(ThreadId),
});
export type ServerLifecycleWelcomePayload = typeof ServerLifecycleWelcomePayload.Type;

/** 服务器生命周期流事件：欢迎、就绪、维护任务 */
export const ServerLifecycleStreamEvent = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("welcome"),
    payload: ServerLifecycleWelcomePayload,
  }),
  Schema.Struct({
    type: Schema.Literal("ready"),
    payload: Schema.Struct({
      at: IsoDateTime,
    }),
  }),
  Schema.Struct({
    type: Schema.Literal("maintenance"),
    payload: Schema.Struct({
      task: Schema.Literal("thread-retention"),
      state: Schema.Literals(["started", "progress", "compacting", "completed", "failed"]),
      at: IsoDateTime,
      deletedCount: Schema.optional(Schema.Number),
      purgedCount: Schema.optional(Schema.Number),
      totalCount: Schema.optional(Schema.Number),
      freePageCount: Schema.optional(Schema.Number),
      error: Schema.optional(Schema.String),
    }),
  }),
]);
export type ServerLifecycleStreamEvent = typeof ServerLifecycleStreamEvent.Type;

/** 服务器配置流事件：快照、配置更新、Provider 状态更新、设置更新 */
export const ServerConfigStreamEvent = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("snapshot"),
    config: ServerConfig,
  }),
  Schema.Struct({
    type: Schema.Literal("configUpdated"),
    payload: ServerConfigUpdatedPayload,
  }),
  Schema.Struct({
    type: Schema.Literal("providerStatuses"),
    payload: ServerProviderStatusesUpdatedPayload,
  }),
  Schema.Struct({
    type: Schema.Literal("settingsUpdated"),
    payload: ServerSettingsUpdatedPayload,
  }),
]);
export type ServerConfigStreamEvent = typeof ServerConfigStreamEvent.Type;

/** 刷新 Provider 列表的结果 */
export const ServerRefreshProvidersResult = ServerProviderStatusesUpdatedPayload;
export type ServerRefreshProvidersResult = typeof ServerRefreshProvidersResult.Type;

/** 更新 Provider 的输入参数 */
export const ServerProviderUpdateInput = Schema.Struct({
  provider: ProviderKind,
});
export type ServerProviderUpdateInput = typeof ServerProviderUpdateInput.Type;

/** Provider 更新失败错误 */
export class ServerProviderUpdateError extends Schema.TaggedErrorClass<ServerProviderUpdateError>()(
  "ServerProviderUpdateError",
  {
    provider: ProviderKind,
    reason: TrimmedNonEmptyString,
  },
) {
  override get message(): string {
    return `Provider update failed for ${this.provider}: ${this.reason}`;
  }
}

/** Provider 更新结果 */
export const ServerProviderUpdateResult = ServerProviderStatusesUpdatedPayload;
export type ServerProviderUpdateResult = typeof ServerProviderUpdateResult.Type;

/** 获取服务器设置的结果 */
export const ServerGetSettingsResult = ServerSettings;
export type ServerGetSettingsResult = typeof ServerGetSettingsResult.Type;

/** 获取执行环境描述的结果 */
export const ServerGetEnvironmentResult = ExecutionEnvironmentDescriptor;
export type ServerGetEnvironmentResult = typeof ServerGetEnvironmentResult.Type;

/** 更新服务器设置的输入参数 */
export const ServerUpdateSettingsInput = ServerSettingsPatch;
export type ServerUpdateSettingsInput = typeof ServerUpdateSettingsInput.Type;

/** 更新服务器设置的结果 */
export const ServerUpdateSettingsResult = ServerSettings;
export type ServerUpdateSettingsResult = typeof ServerUpdateSettingsResult.Type;
