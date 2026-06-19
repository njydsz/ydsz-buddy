/**
 * 服务器设置类型定义。
 * 包含各 Provider（Codex、Claude、Gemini、Grok、Cursor、OpenCode、Kilo、Pi）的配置类型，
 * 以及服务器全局设置、设置补丁（部分更新）和设置错误类型。
 */
import type { ModelSelection, ProviderKind, ThreadEnvironmentMode } from "./orchestration";
import { DEFAULT_GIT_TEXT_GENERATION_MODEL } from "./model";

/** 字符串设置项，最大长度 4096 */
type StringSetting = string;
/** 自定义模型列表，默认为空数组 */
type CustomModels = string[];

/** Provider 设置基础字段：启用状态、二进制路径、自定义模型 */
interface ProviderSettingsBase {
  /** 是否启用该 Provider */
  enabled: boolean;
  /** Provider 二进制文件路径 */
  binaryPath: StringSetting;
  /** 自定义模型列表 */
  customModels: CustomModels;
}

/** Codex Provider 设置，默认二进制路径为 "codex"，支持 homePath */
export interface CodexServerProviderSettings extends ProviderSettingsBase {
  /** 二进制文件路径 */
  binaryPath: string;
  /** Codex 主目录路径 */
  homePath: string;
}

/** Claude Agent Provider 设置，默认二进制路径为 "claude"，支持启动参数 */
export interface ClaudeServerProviderSettings extends ProviderSettingsBase {
  /** 二进制文件路径 */
  binaryPath: string;
  /** 启动参数 */
  launchArgs: string;
}

/** Gemini Provider 设置，默认二进制路径为 "gemini" */
export interface GeminiServerProviderSettings extends ProviderSettingsBase {
  /** 二进制文件路径 */
  binaryPath: string;
}

/** Grok Provider 设置，默认二进制路径为 "grok" */
export interface GrokServerProviderSettings extends ProviderSettingsBase {
  /** 二进制文件路径 */
  binaryPath: string;
}

/** Cursor Provider 设置，默认二进制路径为 "cursor-agent"，支持 API 端点 */
export interface CursorServerProviderSettings extends ProviderSettingsBase {
  /** 二进制文件路径 */
  binaryPath: string;
  /** API 端点 URL */
  apiEndpoint: string;
}

/** OpenCode Provider 设置，默认二进制路径为 "opencode"，支持服务器 URL 和密码 */
export interface OpenCodeServerProviderSettings extends ProviderSettingsBase {
  /** 二进制文件路径 */
  binaryPath: string;
  /** 服务器 URL */
  serverUrl: string;
  /** 服务器密码 */
  serverPassword: string;
}

/** Kilo Provider 设置，默认二进制路径为 "kilo"，支持服务器 URL 和密码 */
export interface KiloServerProviderSettings extends ProviderSettingsBase {
  /** 二进制文件路径 */
  binaryPath: string;
  /** 服务器 URL */
  serverUrl: string;
  /** 服务器密码 */
  serverPassword: string;
}

/** Pi Provider 设置，默认二进制路径为 "pi"，支持 Agent 目录 */
export interface PiServerProviderSettings extends ProviderSettingsBase {
  /** 二进制文件路径 */
  binaryPath: string;
  /** Agent 目录路径 */
  agentDir: string;
}

/** 服务器全局设置，包含流式输出、环境模式、模型选择及各 Provider 配置 */
export interface ServerSettings {
  /** 是否启用助手流式输出 */
  enableAssistantStreaming: boolean;
  /** 默认线程环境模式（local 或 worktree） */
  defaultThreadEnvMode: ThreadEnvironmentMode;
  /** 添加项目时的基础目录 */
  addProjectBaseDirectory: string;
  /** 文本生成模型选择 */
  textGenerationModelSelection: ModelSelection;
  /** 各 Provider 的配置 */
  providers: {
    codex: CodexServerProviderSettings;
    claudeAgent: ClaudeServerProviderSettings;
    cursor: CursorServerProviderSettings;
    gemini: GeminiServerProviderSettings;
    grok: GrokServerProviderSettings;
    kilo: KiloServerProviderSettings;
    opencode: OpenCodeServerProviderSettings;
    pi: PiServerProviderSettings;
  };
}

/** 服务器默认设置（所有字段使用默认值） */
export const DEFAULT_SERVER_SETTINGS: ServerSettings = {
  enableAssistantStreaming: false,
  defaultThreadEnvMode: "local",
  addProjectBaseDirectory: "",
  textGenerationModelSelection: {
    provider: "codex" as const,
    model: DEFAULT_GIT_TEXT_GENERATION_MODEL,
  },
  providers: {
    codex: { enabled: true, binaryPath: "codex", homePath: "", customModels: [] },
    claudeAgent: { enabled: true, binaryPath: "claude", launchArgs: "", customModels: [] },
    cursor: { enabled: true, binaryPath: "cursor-agent", apiEndpoint: "", customModels: [] },
    gemini: { enabled: true, binaryPath: "gemini", customModels: [] },
    grok: { enabled: true, binaryPath: "grok", customModels: [] },
    kilo: { enabled: true, binaryPath: "kilo", serverUrl: "", serverPassword: "", customModels: [] },
    opencode: { enabled: true, binaryPath: "opencode", serverUrl: "", serverPassword: "", customModels: [] },
    pi: { enabled: true, binaryPath: "pi", agentDir: "", customModels: [] },
  },
};

/** 模型选择的部分更新类型 */
interface ModelSelectionPatch {
  provider?: ProviderKind;
  model?: string;
  options?: unknown;
}

/** Provider 设置的基础部分更新字段 */
interface ProviderSettingsBasePatch {
  enabled?: boolean;
  binaryPath?: StringSetting;
  customModels?: CustomModels;
}

/** 服务器设置的部分更新（Patch）类型，用于增量更新设置 */
export interface ServerSettingsPatch {
  enableAssistantStreaming?: boolean;
  defaultThreadEnvMode?: ThreadEnvironmentMode;
  addProjectBaseDirectory?: string;
  textGenerationModelSelection?: ModelSelectionPatch;
  providers?: {
    codex?: ProviderSettingsBasePatch & {
      homePath?: string;
    };
    claudeAgent?: ProviderSettingsBasePatch & {
      launchArgs?: string;
    };
    cursor?: ProviderSettingsBasePatch & {
      apiEndpoint?: string;
    };
    gemini?: ProviderSettingsBasePatch;
    grok?: ProviderSettingsBasePatch;
    kilo?: ProviderSettingsBasePatch & {
      serverUrl?: string;
      serverPassword?: string;
    };
    opencode?: ProviderSettingsBasePatch & {
      serverUrl?: string;
      serverPassword?: string;
    };
    pi?: ProviderSettingsBasePatch & {
      binaryPath?: string;
      agentDir?: string;
    };
  };
}

/** 服务器设置操作错误，包含设置路径和详细错误信息 */
export class ServerSettingsError extends Error {
  override readonly name = "ServerSettingsError";
  readonly settingsPath: string;
  readonly detail: string;
  readonly cause?: unknown;

  constructor(settingsPath: string, detail: string, cause?: unknown) {
    super(`Server settings error at ${settingsPath}: ${detail}`);
    this.settingsPath = settingsPath;
    this.detail = detail;
    this.cause = cause;
  }

  override get message(): string {
    return `Server settings error at ${this.settingsPath}: ${this.detail}`;
  }
}
