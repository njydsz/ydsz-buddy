/**
 * @file 服务端配置契约模块
 *
 * 云顶数字 Buddy : 服务端（ydsz-provider）的配置契约，涵盖运行模式、监听地址、
 * 端口、状态目录、数据库路径等核心配置项。
 *
 * ## 核心契约
 *
 * - `RuntimeMode`：运行模式枚举（desktop / server / headless）
 * - `ServerConfig`：服务端完整配置
 * - `ServerStatusResult`：服务端运行时状态（端口、版本、启动时间等）
 * - `ServerWorkspaceStatusResult`：工作区状态
 * - `ServerUpdateCheckResult`：更新检查结果
 *
 * ## 协议设计
 *
 * - **配置来源**：CLI 参数、环境变量、配置文件按优先级合并
 * - **运行时查询**：通过 `serverStatus` 拉取当前运行状态
 * - **目录约定**：所有运行时数据均位于 `baseDir` 下，按子目录分类
 *
 * ## 使用场景
 *
 * - 启动时加载配置
 * - 状态栏展示服务端运行信息
 * - 升级检查（`serverUpdateCheck`）
 *
 * ## 注意事项
 *
 * - 路径均为绝对路径，跨平台使用 PathBuf
 * - 配置变更需要重启服务才能生效
 */

import { Schema } from "effect";
import {
  IsoDateTime,
  NonNegativeInt,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
  ProviderKind,
} from "./baseSchemas";
import { KeybindingRule, ResolvedKeybindingsConfig } from "./keybindings";
import { EditorIdSchema } from "./editor";
import { ServerSettings, ServerSettingsPatch } from "./settings";
import { ExecutionEnvironmentDescriptor } from "./environment";

const SERVER_VOICE_TRANSCRIPTION_MAX_AUDIO_BASE64_CHARS = 14_000_000;

const KeybindingsMalformedConfigIssue = Schema.Struct({
  kind: Schema.Literal("keybindings.malformed-config"),
  message: TrimmedNonEmptyString,
});

const KeybindingsInvalidEntryIssue = Schema.Struct({
  kind: Schema.Literal("keybindings.invalid-entry"),
  message: TrimmedNonEmptyString,
  index: Schema.Number,
});

export const ServerConfigIssue = Schema.Union(
  KeybindingsMalformedConfigIssue,
  KeybindingsInvalidEntryIssue,
);
export type ServerConfigIssue = typeof ServerConfigIssue.Type;

const ServerConfigIssues = Schema.Array(ServerConfigIssue);

export const ServerProviderStatusState = Schema.Literal("ready", "warning", "error");
export type ServerProviderStatusState = typeof ServerProviderStatusState.Type;

export const ServerProviderAuthStatus = Schema.Literal(
  "authenticated",
  "unauthenticated",
  "unknown",
);
export type ServerProviderAuthStatus = typeof ServerProviderAuthStatus.Type;

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
  versionAdvisory: Schema.optional(
    Schema.Struct({
      status: Schema.Literal("unknown", "current", "behind_latest"),
      currentVersion: Schema.NullOr(TrimmedNonEmptyString),
      latestVersion: Schema.NullOr(TrimmedNonEmptyString),
      updateCommand: Schema.NullOr(TrimmedNonEmptyString),
      canUpdate: Schema.Boolean,
      checkedAt: Schema.NullOr(IsoDateTime),
      message: Schema.NullOr(TrimmedNonEmptyString),
    }),
  ),
  updateState: Schema.optional(
    Schema.Struct({
      status: Schema.Literal("idle", "queued", "running", "succeeded", "failed", "unchanged"),
      startedAt: Schema.NullOr(IsoDateTime),
      finishedAt: Schema.NullOr(IsoDateTime),
      message: Schema.NullOr(TrimmedNonEmptyString),
      output: Schema.NullOr(Schema.String.pipe(Schema.maxLength(10_000))),
    }),
  ),
});
export type ServerProviderStatus = typeof ServerProviderStatus.Type;

export type ServerProviderVersionAdvisory = NonNullable<ServerProviderStatus["versionAdvisory"]>;
export type ServerProviderUpdateState = NonNullable<ServerProviderStatus["updateState"]>;

const ServerProviderStatuses = Schema.Array(ServerProviderStatus);

export const ServerConfig = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  homeDir: Schema.optional(TrimmedNonEmptyString),
  worktreesDir: TrimmedNonEmptyString,
  keybindingsConfigPath: TrimmedNonEmptyString,
  keybindings: ResolvedKeybindingsConfig,
  issues: ServerConfigIssues,
  providers: ServerProviderStatuses,
  availableEditors: Schema.Array(EditorIdSchema),
});
export type ServerConfig = typeof ServerConfig.Type;

export const ServerManagedWorktree = Schema.Struct({
  path: TrimmedNonEmptyString,
  workspaceRoot: TrimmedNonEmptyString,
});
export type ServerManagedWorktree = typeof ServerManagedWorktree.Type;

export const ServerListWorktreesResult = Schema.Struct({
  worktrees: Schema.Array(ServerManagedWorktree),
});
export type ServerListWorktreesResult = typeof ServerListWorktreesResult.Type;

export const ServerProviderUsageLimit = Schema.Struct({
  window: TrimmedNonEmptyString,
  usedPercent: Schema.optional(
    Schema.Number.pipe(Schema.greaterThanOrEqualTo(0), Schema.lessThanOrEqualTo(100)),
  ),
  resetsAt: Schema.optional(IsoDateTime),
  windowDurationMins: Schema.optional(NonNegativeInt),
});
export type ServerProviderUsageLimit = typeof ServerProviderUsageLimit.Type;

export const ServerProviderUsageLine = Schema.Struct({
  label: TrimmedNonEmptyString,
  value: TrimmedNonEmptyString,
  subtitle: Schema.optional(TrimmedNonEmptyString),
});
export type ServerProviderUsageLine = typeof ServerProviderUsageLine.Type;

export const ServerProviderUsageSnapshot = Schema.Struct({
  provider: ProviderKind,
  updatedAt: IsoDateTime,
  limits: Schema.Array(ServerProviderUsageLimit),
  usageLines: Schema.Array(ServerProviderUsageLine),
  source: TrimmedNonEmptyString,
});
export type ServerProviderUsageSnapshot = typeof ServerProviderUsageSnapshot.Type;

export const ServerGetProviderUsageSnapshotInput = Schema.Struct({
  provider: ProviderKind,
  homePath: Schema.optional(TrimmedNonEmptyString),
});
export type ServerGetProviderUsageSnapshotInput = typeof ServerGetProviderUsageSnapshotInput.Type;

export const ServerGetProviderUsageSnapshotResult = Schema.NullOr(ServerProviderUsageSnapshot);
export type ServerGetProviderUsageSnapshotResult = typeof ServerGetProviderUsageSnapshotResult.Type;

export const ServerDiagnosticsMemory = Schema.Struct({
  rssBytes: NonNegativeInt,
  heapTotalBytes: NonNegativeInt,
  heapUsedBytes: NonNegativeInt,
  externalBytes: NonNegativeInt,
  arrayBuffersBytes: NonNegativeInt,
});
export type ServerDiagnosticsMemory = typeof ServerDiagnosticsMemory.Type;

export const ServerDiagnosticsChildProcess = Schema.Struct({
  pid: NonNegativeInt,
  ppid: NonNegativeInt,
  rssBytes: NonNegativeInt,
  virtualSizeBytes: NonNegativeInt,
  command: Schema.String,
  args: Schema.String,
});
export type ServerDiagnosticsChildProcess = typeof ServerDiagnosticsChildProcess.Type;

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

export const ServerVoiceTranscriptionInput = Schema.Struct({
  provider: ProviderKind,
  cwd: TrimmedNonEmptyString,
  threadId: Schema.optional(ThreadId),
  mimeType: TrimmedNonEmptyString.pipe(Schema.maxLength(100)),
  sampleRateHz: NonNegativeInt,
  durationMs: NonNegativeInt,
  audioBase64: TrimmedNonEmptyString.pipe(
    Schema.maxLength(SERVER_VOICE_TRANSCRIPTION_MAX_AUDIO_BASE64_CHARS),
  ),
});
export type ServerVoiceTranscriptionInput = typeof ServerVoiceTranscriptionInput.Type;

export const ServerVoiceTranscriptionResult = Schema.Struct({
  text: TrimmedNonEmptyString,
});
export type ServerVoiceTranscriptionResult = typeof ServerVoiceTranscriptionResult.Type;

export const ServerVoicePolishInput = Schema.Struct({
  text: TrimmedNonEmptyString,
  enabled: Schema.optional(Schema.Boolean),
  removeFillerWords: Schema.optional(Schema.Boolean),
  fixGrammar: Schema.optional(Schema.Boolean),
  addStructure: Schema.optional(Schema.Boolean),
  targetLanguage: Schema.optional(TrimmedNonEmptyString),
});
export type ServerVoicePolishInput = typeof ServerVoicePolishInput.Type;

export const ServerVoicePolishResult = Schema.Struct({
  text: Schema.String,
  appliedRules: Schema.Array(Schema.String),
  originalLength: NonNegativeInt,
  polishedLength: NonNegativeInt,
});
export type ServerVoicePolishResult = typeof ServerVoicePolishResult.Type;

export const ServerUpsertKeybindingInput = KeybindingRule;
export type ServerUpsertKeybindingInput = typeof ServerUpsertKeybindingInput.Type;

export const ServerUpsertKeybindingResult = Schema.Struct({
  keybindings: ResolvedKeybindingsConfig,
  issues: ServerConfigIssues,
});
export type ServerUpsertKeybindingResult = typeof ServerUpsertKeybindingResult.Type;

export const ServerConfigUpdatedPayload = Schema.Struct({
  issues: ServerConfigIssues,
  providers: ServerProviderStatuses,
});
export type ServerConfigUpdatedPayload = typeof ServerConfigUpdatedPayload.Type;

export const ServerProviderStatusesUpdatedPayload = Schema.Struct({
  providers: ServerProviderStatuses,
});
export type ServerProviderStatusesUpdatedPayload = typeof ServerProviderStatusesUpdatedPayload.Type;

export const ServerSettingsUpdatedPayload = Schema.Struct({
  settings: ServerSettings,
});
export type ServerSettingsUpdatedPayload = typeof ServerSettingsUpdatedPayload.Type;

export const ServerLifecycleWelcomePayload = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  homeDir: Schema.optional(TrimmedNonEmptyString),
  projectName: TrimmedNonEmptyString,
  bootstrapProjectId: Schema.optional(ProjectId),
  bootstrapThreadId: Schema.optional(ThreadId),
});
export type ServerLifecycleWelcomePayload = typeof ServerLifecycleWelcomePayload.Type;

export const ServerLifecycleStreamEvent = Schema.Union(
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
      state: Schema.Literal("started", "progress", "compacting", "completed", "failed"),
      at: IsoDateTime,
      deletedCount: Schema.optional(Schema.Number),
      purgedCount: Schema.optional(Schema.Number),
      totalCount: Schema.optional(Schema.Number),
      freePageCount: Schema.optional(Schema.Number),
      error: Schema.optional(Schema.String),
    }),
  }),
);
export type ServerLifecycleStreamEvent = typeof ServerLifecycleStreamEvent.Type;

export const ServerConfigStreamEvent = Schema.Union(
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
);
export type ServerConfigStreamEvent = typeof ServerConfigStreamEvent.Type;

export const ServerRefreshProvidersResult = ServerProviderStatusesUpdatedPayload;
export type ServerRefreshProvidersResult = typeof ServerRefreshProvidersResult.Type;

export const ServerProviderUpdateInput = Schema.Struct({
  provider: ProviderKind,
});
export type ServerProviderUpdateInput = typeof ServerProviderUpdateInput.Type;

export class ServerProviderUpdateError extends Schema.TaggedError<ServerProviderUpdateError>()("ServerProviderUpdateError", {
  provider: Schema.String,
  reason: Schema.String,
}) {
  override get message(): string {
    return `Provider update failed for ${this.provider}: ${this.reason}`;
  }
}

export const ServerProviderUpdateResult = ServerProviderStatusesUpdatedPayload;
export type ServerProviderUpdateResult = typeof ServerProviderUpdateResult.Type;

export const ServerGetSettingsResult = ServerSettings;
export type ServerGetSettingsResult = typeof ServerGetSettingsResult.Type;

export const ServerGetEnvironmentResult = ExecutionEnvironmentDescriptor;
export type ServerGetEnvironmentResult = typeof ServerGetEnvironmentResult.Type;

export const ServerUpdateSettingsInput = ServerSettingsPatch;
export type ServerUpdateSettingsInput = typeof ServerUpdateSettingsInput.Type;

export const ServerUpdateSettingsResult = ServerSettings;
export type ServerUpdateSettingsResult = typeof ServerUpdateSettingsResult.Type;
