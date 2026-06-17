/**
 * 服务端合约定义
 *
 * 用途：定义服务端配置、Provider 状态、使用量统计、诊断信息、语音转录等结构。
 * 所属模块：共享契约层（Shared Contracts）
 * 主要导出：
 *   - ServerConfig —— 服务端配置
 *   - ServerProviderStatus / ProviderStatusState / ProviderAuthStatus —— Provider 状态
 *   - ServerManagedWorktree —— 托管工作树
 *   - ServerProviderUsageSnapshot / UsageLimit —— 使用量统计
 *   - ServerDiagnosticsResult —— 诊断信息
 *   - ServerVoiceTranscriptionInput / Result —— 语音转录
 *   - ServerUpsertKeybindingInput / Result —— 快捷键更新
 *   - ServerLifecycleStreamEvent —— 生命周期流事件
 *   - ServerConfigStreamEvent —— 配置流事件
 *   - ServerProviderUpdateError —— Provider 更新错误
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

/** 语音转录音频 Base64 最大字符数 */
const SERVER_VOICE_TRANSCRIPTION_MAX_AUDIO_BASE64_CHARS = 14_000_000;

/** 快捷键配置格式错误问题 */
const KeybindingsMalformedConfigIssue = Schema.Struct({
  kind: Schema.Literal("keybindings.malformed-config"),
  message: TrimmedNonEmptyString,
});

/** 快捷键配置无效条目问题 */
const KeybindingsInvalidEntryIssue = Schema.Struct({
  kind: Schema.Literal("keybindings.invalid-entry"),
  message: TrimmedNonEmptyString,
  index: Schema.Number,
});

/** 服务端配置问题联合类型 */
export const ServerConfigIssue = Schema.Union([
  KeybindingsMalformedConfigIssue,
  KeybindingsInvalidEntryIssue,
]);
export type ServerConfigIssue = typeof ServerConfigIssue.Type;

/** 配置问题列表 */
const ServerConfigIssues = Schema.Array(ServerConfigIssue);

/** Provider 状态 */
export const ServerProviderStatusState = Schema.Literals(["ready", "warning", "error"]);
export type ServerProviderStatusState = typeof ServerProviderStatusState.Type;

/** Provider 认证状态 */
export const ServerProviderAuthStatus = Schema.Literals([
  "authenticated",
  "unauthenticated",
  "unknown",
]);
export type ServerProviderAuthStatus = typeof ServerProviderAuthStatus.Type;

/** Provider 状态详情 */
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
  /** 版本更新建议 */
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
  /** Provider 更新状态 */
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

export type ServerProviderVersionAdvisory = NonNullable<ServerProviderStatus["versionAdvisory"]>;
export type ServerProviderUpdateState = NonNullable<ServerProviderStatus["updateState"]>;

/** Provider 状态列表 */
const ServerProviderStatuses = Schema.Array(ServerProviderStatus);

/** 服务端配置 */
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

/** 服务端托管的工作树 */
export const ServerManagedWorktree = Schema.Struct({
  path: TrimmedNonEmptyString,
  workspaceRoot: TrimmedNonEmptyString,
});
export type ServerManagedWorktree = typeof ServerManagedWorktree.Type;

/** 工作树列表结果 */
export const ServerListWorktreesResult = Schema.Struct({
  worktrees: Schema.Array(ServerManagedWorktree),
});
export type ServerListWorktreesResult = typeof ServerListWorktreesResult.Type;

/** Provider 使用量限制 */
export const ServerProviderUsageLimit = Schema.Struct({
  window: TrimmedNonEmptyString,
  usedPercent: Schema.optional(
    Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)).check(Schema.isLessThanOrEqualTo(100)),
  ),
  resetsAt: Schema.optional(IsoDateTime),
  windowDurationMins: Schema.optional(NonNegativeInt),
});
export type ServerProviderUsageLimit = typeof ServerProviderUsageLimit.Type;

/** Provider 使用量行 */
export const ServerProviderUsageLine = Schema.Struct({
  label: TrimmedNonEmptyString,
  value: TrimmedNonEmptyString,
  subtitle: Schema.optional(TrimmedNonEmptyString),
});
export type ServerProviderUsageLine = typeof ServerProviderUsageLine.Type;

/** Provider 使用量快照 */
export const ServerProviderUsageSnapshot = Schema.Struct({
  provider: ProviderKind,
  updatedAt: IsoDateTime,
  limits: Schema.Array(ServerProviderUsageLimit),
  usageLines: Schema.Array(ServerProviderUsageLine),
  source: TrimmedNonEmptyString,
});
export type ServerProviderUsageSnapshot = typeof ServerProviderUsageSnapshot.Type;

/** 获取 Provider 使用量快照输入 */
export const ServerGetProviderUsageSnapshotInput = Schema.Struct({
  provider: ProviderKind,
  homePath: Schema.optional(TrimmedNonEmptyString),
});
export type ServerGetProviderUsageSnapshotInput = typeof ServerGetProviderUsageSnapshotInput.Type;

/** 获取 Provider 使用量快照结果 */
export const ServerGetProviderUsageSnapshotResult = Schema.NullOr(ServerProviderUsageSnapshot);
export type ServerGetProviderUsageSnapshotResult = typeof ServerGetProviderUsageSnapshotResult.Type;

/** 诊断内存信息 */
export const ServerDiagnosticsMemory = Schema.Struct({
  rssBytes: NonNegativeInt,
  heapTotalBytes: NonNegativeInt,
  heapUsedBytes: NonNegativeInt,
  externalBytes: NonNegativeInt,
  arrayBuffersBytes: NonNegativeInt,
});
export type ServerDiagnosticsMemory = typeof ServerDiagnosticsMemory.Type;

/** 诊断子进程信息 */
export const ServerDiagnosticsChildProcess = Schema.Struct({
  pid: NonNegativeInt,
  ppid: NonNegativeInt,
  rssBytes: NonNegativeInt,
  virtualSizeBytes: NonNegativeInt,
  command: Schema.String,
  args: Schema.String,
});
export type ServerDiagnosticsChildProcess = typeof ServerDiagnosticsChildProcess.Type;

/** 诊断结果 */
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

/** 语音转录输入 */
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

/** 快捷键更新输入 */
export const ServerUpsertKeybindingInput = KeybindingRule;
export type ServerUpsertKeybindingInput = typeof ServerUpsertKeybindingInput.Type;

/** 快捷键更新结果 */
export const ServerUpsertKeybindingResult = Schema.Struct({
  keybindings: ResolvedKeybindingsConfig,
  issues: ServerConfigIssues,
});
export type ServerUpsertKeybindingResult = typeof ServerUpsertKeybindingResult.Type;

/** 配置更新负载 */
export const ServerConfigUpdatedPayload = Schema.Struct({
  issues: ServerConfigIssues,
  providers: ServerProviderStatuses,
});
export type ServerConfigUpdatedPayload = typeof ServerConfigUpdatedPayload.Type;

/** Provider 状态更新负载 */
export const ServerProviderStatusesUpdatedPayload = Schema.Struct({
  providers: ServerProviderStatuses,
});
export type ServerProviderStatusesUpdatedPayload = typeof ServerProviderStatusesUpdatedPayload.Type;

/** 设置更新负载 */
export const ServerSettingsUpdatedPayload = Schema.Struct({
  settings: ServerSettings,
});
export type ServerSettingsUpdatedPayload = typeof ServerSettingsUpdatedPayload.Type;

/** 生命周期欢迎负载 */
export const ServerLifecycleWelcomePayload = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  homeDir: Schema.optional(TrimmedNonEmptyString),
  projectName: TrimmedNonEmptyString,
  bootstrapProjectId: Schema.optional(ProjectId),
  bootstrapThreadId: Schema.optional(ThreadId),
});
export type ServerLifecycleWelcomePayload = typeof ServerLifecycleWelcomePayload.Type;

/** 服务端生命周期流事件 */
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

/** 服务端配置流事件 */
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

/** 刷新 Provider 结果（即 Provider 状态更新负载） */
export const ServerRefreshProvidersResult = ServerProviderStatusesUpdatedPayload;
export type ServerRefreshProvidersResult = typeof ServerRefreshProvidersResult.Type;

/** Provider 更新输入 */
export const ServerProviderUpdateInput = Schema.Struct({
  provider: ProviderKind,
});
export type ServerProviderUpdateInput = typeof ServerProviderUpdateInput.Type;

/** Provider 更新错误 */
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

/** 获取设置结果 */
export const ServerGetSettingsResult = ServerSettings;
export type ServerGetSettingsResult = typeof ServerGetSettingsResult.Type;

/** 获取环境结果 */
export const ServerGetEnvironmentResult = ExecutionEnvironmentDescriptor;
export type ServerGetEnvironmentResult = typeof ServerGetEnvironmentResult.Type;

/** 更新设置输入 */
export const ServerUpdateSettingsInput = ServerSettingsPatch;
export type ServerUpdateSettingsInput = typeof ServerUpdateSettingsInput.Type;

/** 更新设置结果 */
export const ServerUpdateSettingsResult = ServerSettings;
export type ServerUpdateSettingsResult = typeof ServerUpdateSettingsResult.Type;