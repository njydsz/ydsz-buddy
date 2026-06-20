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

/** 快捷键配置问题列表 */
type ServerConfigIssues = ServerConfigIssue[];

/** Provider 状态枚举：就绪、警告、错误 */
export type ServerProviderStatusState = "ready" | "warning" | "error";

/** Provider 认证状态枚举：已认证、未认证、未知 */
export type ServerProviderAuthStatus = "authenticated" | "unauthenticated" | "unknown";

/** Provider 版本建议信息 */
export interface ServerProviderVersionAdvisory {
  /** 版本状态：unknown（未知）、current（最新）、behind_latest（落后于最新版本） */
  status: "unknown" | "current" | "behind_latest";
  /** 当前安装的版本号 */
  currentVersion: TrimmedNonEmptyString | null;
  /** 最新版本号 */
  latestVersion: TrimmedNonEmptyString | null;
  /** 更新命令（用于升级到最新版本） */
  updateCommand: TrimmedNonEmptyString | null;
  /** 是否可以直接更新 */
  canUpdate: boolean;
  /** 检查时间戳 */
  checkedAt: IsoDateTime | null;
  /** 附加消息（如更新提示或警告） */
  message: TrimmedNonEmptyString | null;
}

/** Provider 更新操作的状态跟踪 */
export interface ServerProviderUpdateState {
  /** 更新状态：idle（空闲）、queued（已排队）、running（运行中）、succeeded（成功）、failed（失败）、unchanged（无变化） */
  status: "idle" | "queued" | "running" | "succeeded" | "failed" | "unchanged";
  /** 更新开始时间 */
  startedAt: IsoDateTime | null;
  /** 更新完成时间 */
  finishedAt: IsoDateTime | null;
  /** 状态消息 */
  message: TrimmedNonEmptyString | null;
  /** 更新过程的输出日志 */
  output: string | null;
}

/** 单个 Provider 的完整状态信息，包括可用性、认证、版本、更新状态等 */
export interface ServerProviderStatus {
  /** Provider 类型 */
  provider: ProviderKind;
  /** Provider 状态 */
  status: ServerProviderStatusState;
  /** 是否可用 */
  available: boolean;
  /** 认证状态 */
  authStatus: ServerProviderAuthStatus;
  /** 认证类型（如 "api-key"、"oauth"） */
  authType?: TrimmedNonEmptyString;
  /** 认证标签（显示名称） */
  authLabel?: TrimmedNonEmptyString;
  /** 是否支持语音转录 */
  voiceTranscriptionAvailable?: boolean;
  /** Provider 版本号 */
  version?: TrimmedNonEmptyString | null;
  /** 状态检查时间 */
  checkedAt: IsoDateTime;
  /** 附加消息（如错误信息或警告） */
  message?: TrimmedNonEmptyString;
  /** 版本建议信息，指示是否为最新版本及更新命令 */
  versionAdvisory?: ServerProviderVersionAdvisory;
  /** Provider 更新操作的状态跟踪 */
  updateState?: ServerProviderUpdateState;
}

/** 服务器配置信息，包含工作目录、快捷键、Provider 状态、可用编辑器等 */
export interface ServerConfig {
  /** 当前工作目录（绝对路径） */
  cwd: TrimmedNonEmptyString;
  /** 用户主目录（可选） */
  homeDir?: TrimmedNonEmptyString;
  /** Worktree 目录路径 */
  worktreesDir: TrimmedNonEmptyString;
  /** 快捷键配置文件路径 */
  keybindingsConfigPath: TrimmedNonEmptyString;
  /** 解析后的快捷键配置 */
  keybindings: ResolvedKeybindingsConfig;
  /** 配置问题列表（如快捷键配置错误） */
  issues: ServerConfigIssues;
  /** 所有 Provider 的状态列表 */
  providers: ServerProviderStatus[];
  /** 可用的编辑器列表 */
  availableEditors: EditorId[];
}

/** 服务器管理的 Git Worktree 信息 */
export interface ServerManagedWorktree {
  /** Worktree 路径 */
  path: TrimmedNonEmptyString;
  /** 工作区根目录 */
  workspaceRoot: TrimmedNonEmptyString;
}

/** 列出所有 Worktree 的结果 */
export interface ServerListWorktreesResult {
  worktrees: ServerManagedWorktree[];
}

/** Provider 使用量限制信息，包含窗口、已用百分比、重置时间等 */
export interface ServerProviderUsageLimit {
  /** 限制窗口名称（如 "daily"、"monthly"） */
  window: TrimmedNonEmptyString;
  /** 已使用百分比 */
  usedPercent?: number;
  /** 限制重置时间 */
  resetsAt?: IsoDateTime;
  /** 窗口持续时间（分钟） */
  windowDurationMins?: NonNegativeInt;
}

/** Provider 使用量信息行（标签-值对） */
export interface ServerProviderUsageLine {
  /** 行标签 */
  label: TrimmedNonEmptyString;
  /** 行值 */
  value: TrimmedNonEmptyString;
  /** 行副标题 */
  subtitle?: TrimmedNonEmptyString;
}

/** Provider 使用量快照，包含限制和使用量明细 */
export interface ServerProviderUsageSnapshot {
  /** Provider 类型 */
  provider: ProviderKind;
  /** 快照更新时间 */
  updatedAt: IsoDateTime;
  /** 使用量限制列表 */
  limits: ServerProviderUsageLimit[];
  /** 使用量明细行 */
  usageLines: ServerProviderUsageLine[];
  /** 数据来源 */
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
  /** 常驻内存集大小（字节） */
  rssBytes: NonNegativeInt;
  /** 堆总大小（字节） */
  heapTotalBytes: NonNegativeInt;
  /** 堆已使用大小（字节） */
  heapUsedBytes: NonNegativeInt;
  /** 外部内存大小（字节） */
  externalBytes: NonNegativeInt;
  /** ArrayBuffer 内存大小（字节） */
  arrayBuffersBytes: NonNegativeInt;
}

/** 子进程诊断信息 */
export interface ServerDiagnosticsChildProcess {
  /** 进程 ID */
  pid: NonNegativeInt;
  /** 父进程 ID */
  ppid: NonNegativeInt;
  /** 常驻内存集大小（字节） */
  rssBytes: NonNegativeInt;
  /** 虚拟内存大小（字节） */
  virtualSizeBytes: NonNegativeInt;
  /** 命令名称 */
  command: string;
  /** 命令参数 */
  args: string;
}

/** 服务器诊断结果，包含进程信息、子进程、项目/线程统计 */
export interface ServerDiagnosticsResult {
  /** 诊断信息生成时间 */
  generatedAt: IsoDateTime;
  /** 主进程信息 */
  process: {
    /** 进程 ID */
    pid: NonNegativeInt;
    /** 运行时长（秒） */
    uptimeSeconds: NonNegativeInt;
    /** 内存使用信息 */
    memory: ServerDiagnosticsMemory;
  };
  /** 子进程列表 */
  childProcesses: ServerDiagnosticsChildProcess[];
  /** 子进程总数 */
  childProcessTotalCount: NonNegativeInt;
  /** 子进程总内存（字节） */
  childProcessTotalRssBytes: NonNegativeInt;
  /** 投影统计信息 */
  projection: {
    /** 项目数量 */
    projectCount: NonNegativeInt;
    /** 线程数量 */
    threadCount: NonNegativeInt;
  };
}

/** 语音转录请求输入，包含音频数据和元信息 */
export interface ServerVoiceTranscriptionInput {
  /** Provider 类型 */
  provider: ProviderKind;
  /** 工作目录 */
  cwd: TrimmedNonEmptyString;
  /** 线程 ID（可选） */
  threadId?: ThreadId;
  /** 音频 MIME 类型 */
  mimeType: TrimmedNonEmptyString;
  /** 音频采样率（Hz） */
  sampleRateHz: NonNegativeInt;
  /** 音频时长（毫秒） */
  durationMs: NonNegativeInt;
  /** 音频 Base64 编码数据 */
  audioBase64: TrimmedNonEmptyString;
}

/** 语音转录结果 */
export interface ServerVoiceTranscriptionResult {
  /** 转录文本 */
  text: TrimmedNonEmptyString;
}

/** 新增或更新快捷键规则的输入 */
export type ServerUpsertKeybindingInput = KeybindingRule;

/** 新增或更新快捷键规则的结果，返回更新后的配置和问题列表 */
export interface ServerUpsertKeybindingResult {
  /** 更新后的快捷键配置 */
  keybindings: ResolvedKeybindingsConfig;
  /** 配置问题列表 */
  issues: ServerConfigIssues;
}

/** 服务器配置更新事件载荷 */
export interface ServerConfigUpdatedPayload {
  /** 配置问题列表 */
  issues: ServerConfigIssues;
  /** 更新后的 Provider 状态列表 */
  providers: ServerProviderStatus[];
}

/** Provider 状态更新事件载荷 */
export interface ServerProviderStatusesUpdatedPayload {
  /** 更新后的 Provider 状态列表 */
  providers: ServerProviderStatus[];
}

/** 服务器设置更新事件载荷 */
export interface ServerSettingsUpdatedPayload {
  /** 更新后的服务器设置 */
  settings: ServerSettings;
}

/** 服务器生命周期欢迎事件载荷，包含初始项目信息 */
export interface ServerLifecycleWelcomePayload {
  /** 当前工作目录 */
  cwd: TrimmedNonEmptyString;
  /** 用户主目录（可选） */
  homeDir?: TrimmedNonEmptyString;
  /** 项目名称 */
  projectName: TrimmedNonEmptyString;
  /** 引导项目 ID（可选） */
  bootstrapProjectId?: ProjectId;
  /** 引导线程 ID（可选） */
  bootstrapThreadId?: ThreadId;
}

/** 服务器生命周期流事件：欢迎、就绪、维护任务 */
export type ServerLifecycleStreamEvent =
  | {
      /** 欢迎事件 */
      type: "welcome";
      payload: ServerLifecycleWelcomePayload;
    }
  | {
      /** 就绪事件 */
      type: "ready";
      payload: {
        /** 就绪时间 */
        at: IsoDateTime;
      };
    }
  | {
      /** 维护任务事件 */
      type: "maintenance";
      payload: {
        /** 维护任务类型 */
        task: "thread-retention";
        /** 任务状态 */
        state: "started" | "progress" | "compacting" | "completed" | "failed";
        /** 状态时间 */
        at: IsoDateTime;
        /** 已删除数量 */
        deletedCount?: number;
        /** 已清理数量 */
        purgedCount?: number;
        /** 总数量 */
        totalCount?: number;
        /** 空闲页数量 */
        freePageCount?: number;
        /** 错误信息 */
        error?: string;
      };
    };

/** 服务器配置流事件：快照、配置更新、Provider 状态更新、设置更新 */
export type ServerConfigStreamEvent =
  | {
      /** 完整配置快照 */
      type: "snapshot";
      config: ServerConfig;
    }
  | {
      /** 配置更新事件 */
      type: "configUpdated";
      payload: ServerConfigUpdatedPayload;
    }
  | {
      /** Provider 状态更新事件 */
      type: "providerStatuses";
      payload: ServerProviderStatusesUpdatedPayload;
    }
  | {
      /** 设置更新事件 */
      type: "settingsUpdated";
      payload: ServerSettingsUpdatedPayload;
    };

/** 刷新 Provider 列表的结果 */
export type ServerRefreshProvidersResult = ServerProviderStatusesUpdatedPayload;

/** 更新 Provider 的输入参数 */
export interface ServerProviderUpdateInput {
  /** 要更新的 Provider 类型 */
  provider: ProviderKind;
}

/**
 * Provider 更新失败错误
 *
 * @description 当 Provider 更新操作（如安装、升级）失败时抛出的错误类型。
 */
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

/** Provider 更新结果，返回更新后的 Provider 状态列表 */
export type ServerProviderUpdateResult = ServerProviderStatusesUpdatedPayload;

/** 获取服务器设置的结果 */
export type ServerGetSettingsResult = ServerSettings;

/** 获取执行环境描述的结果 */
export type ServerGetEnvironmentResult = ExecutionEnvironmentDescriptor;

/** 更新服务器设置的输入参数 */
export type ServerUpdateSettingsInput = ServerSettingsPatch;

/** 更新服务器设置的结果 */
export type ServerUpdateSettingsResult = ServerSettings;
