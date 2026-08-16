/**
 * @file 用户设置契约模块
 *
 * 本模块定义了 ydsz 工作区用户级别的设置（Settings）契约，涵盖主题、字体、语言、
 * 终端行为、Git 行为、隐私等所有可自定义选项。
 *
 * ## 核心契约
 *
 * - `UserSettings`：用户完整设置
 * - `ThemePreference`：主题偏好（light / dark / system）
 * - `FontFamilyConfig`：字体族配置
 * - `TerminalSettings`：终端相关设置
 * - `GitSettings`：Git 相关设置
 * - `PrivacySettings`：隐私相关设置
 * - `NotificationsSettings`：通知相关设置
 * - `SettingsUpdateInput`：设置变更输入
 *
 * ## 协议设计
 *
 * - **持久化**：用户设置存储在 `settings.json`，与服务端配置分离
 * - **实时同步**：设置变更通过 WebSocket 广播到所有打开的窗口
 * - **默认值**：每个字段都有合理默认值，无需用户配置即可使用
 *
 * ## 使用场景
 *
 * - 偏好设置面板
 * - 启动时加载用户设置
 * - 跨设备同步（未来扩展）
 *
 * ## 注意事项
 *
 * - 设置变更立即生效，无需重启
 * - 敏感字段（如 API Key）走独立的 Provider 配置
 */

import { Data, Schema } from "effect";
import { TrimmedString } from "./baseSchemas";
import { DEFAULT_GIT_TEXT_GENERATION_MODEL } from "./model";
import { ProviderKind } from "./baseSchemas";
import { ModelSelection, ThreadEnvironmentMode } from "./orchestration";

const StringSetting = TrimmedString.pipe(Schema.maxLength(4096));
const CustomModels = Schema.optional(Schema.Array(Schema.String.pipe(Schema.maxLength(256)))).pipe(
  Schema.withDecodingDefault(() => []),
);

const ProviderSettingsBase = {
  enabled: Schema.optional(Schema.Boolean).pipe(Schema.withDecodingDefault(() => true)),
  binaryPath: Schema.optional(StringSetting).pipe(Schema.withDecodingDefault(() => "")),
  customModels: CustomModels,
};

export const CodexServerProviderSettings = Schema.Struct({
  ...ProviderSettingsBase,
  binaryPath: Schema.optional(StringSetting).pipe(Schema.withDecodingDefault(() => "codex")),
  homePath: Schema.optional(StringSetting).pipe(Schema.withDecodingDefault(() => "")),
});
export type CodexServerProviderSettings = typeof CodexServerProviderSettings.Type;

export const ClaudeServerProviderSettings = Schema.Struct({
  ...ProviderSettingsBase,
  binaryPath: Schema.optional(StringSetting).pipe(Schema.withDecodingDefault(() => "claude")),
  launchArgs: Schema.optional(Schema.String.pipe(Schema.maxLength(4096))).pipe(Schema.withDecodingDefault(() => "")),
});
export type ClaudeServerProviderSettings = typeof ClaudeServerProviderSettings.Type;

export const GeminiServerProviderSettings = Schema.Struct({
  ...ProviderSettingsBase,
  binaryPath: Schema.optional(StringSetting).pipe(Schema.withDecodingDefault(() => "gemini")),
});
export type GeminiServerProviderSettings = typeof GeminiServerProviderSettings.Type;

export const GrokServerProviderSettings = Schema.Struct({
  ...ProviderSettingsBase,
  binaryPath: Schema.optional(StringSetting).pipe(Schema.withDecodingDefault(() => "grok")),
});
export type GrokServerProviderSettings = typeof GrokServerProviderSettings.Type;

export const CursorServerProviderSettings = Schema.Struct({
  ...ProviderSettingsBase,
  binaryPath: Schema.optional(StringSetting).pipe(Schema.withDecodingDefault(() => "cursor-agent")),
  apiEndpoint: Schema.optional(StringSetting).pipe(Schema.withDecodingDefault(() => "")),
});
export type CursorServerProviderSettings = typeof CursorServerProviderSettings.Type;

export const OpenCodeServerProviderSettings = Schema.Struct({
  ...ProviderSettingsBase,
  binaryPath: Schema.optional(StringSetting).pipe(Schema.withDecodingDefault(() => "opencode")),
  serverUrl: Schema.optional(StringSetting).pipe(Schema.withDecodingDefault(() => "")),
  serverPassword: Schema.optional(StringSetting).pipe(Schema.withDecodingDefault(() => "")),
});
export type OpenCodeServerProviderSettings = typeof OpenCodeServerProviderSettings.Type;

export const KiloServerProviderSettings = Schema.Struct({
  ...ProviderSettingsBase,
  binaryPath: Schema.optional(StringSetting).pipe(Schema.withDecodingDefault(() => "kilo")),
  serverUrl: Schema.optional(StringSetting).pipe(Schema.withDecodingDefault(() => "")),
  serverPassword: Schema.optional(StringSetting).pipe(Schema.withDecodingDefault(() => "")),
});
export type KiloServerProviderSettings = typeof KiloServerProviderSettings.Type;

export const PiServerProviderSettings = Schema.Struct({
  ...ProviderSettingsBase,
  binaryPath: Schema.optional(StringSetting).pipe(Schema.withDecodingDefault(() => "pi")),
  agentDir: Schema.optional(StringSetting).pipe(Schema.withDecodingDefault(() => "")),
});
export type PiServerProviderSettings = typeof PiServerProviderSettings.Type;

export const ServerSettings = Schema.Struct({
  enableAssistantStreaming: Schema.optional(Schema.Boolean).pipe(Schema.withDecodingDefault(() => false)),
  defaultThreadEnvMode: Schema.optional(ThreadEnvironmentMode).pipe(Schema.withDecodingDefault(() => "local")),
  addProjectBaseDirectory: Schema.optional(StringSetting).pipe(Schema.withDecodingDefault(() => "")),
  textGenerationModelSelection: Schema.optional(ModelSelection).pipe(
    Schema.withDecodingDefault(() => ({
      provider: "codex" as const,
      model: DEFAULT_GIT_TEXT_GENERATION_MODEL,
    })),
  ),
  providers: Schema.optional(Schema.Struct({
    codex: Schema.optional(CodexServerProviderSettings).pipe(Schema.withDecodingDefault(() => ({ enabled: true, binaryPath: "codex", homePath: "", customModels: [] }))),
    claudeAgent: Schema.optional(ClaudeServerProviderSettings).pipe(Schema.withDecodingDefault(() => ({ enabled: true, binaryPath: "claude", launchArgs: "", customModels: [] }))),
    cursor: Schema.optional(CursorServerProviderSettings).pipe(Schema.withDecodingDefault(() => ({ enabled: true, binaryPath: "cursor-agent", apiEndpoint: "", customModels: [] }))),
    gemini: Schema.optional(GeminiServerProviderSettings).pipe(Schema.withDecodingDefault(() => ({ enabled: true, binaryPath: "gemini", customModels: [] }))),
    grok: Schema.optional(GrokServerProviderSettings).pipe(Schema.withDecodingDefault(() => ({ enabled: true, binaryPath: "grok", customModels: [] }))),
    kilo: Schema.optional(KiloServerProviderSettings).pipe(Schema.withDecodingDefault(() => ({ enabled: true, binaryPath: "kilo", serverUrl: "", serverPassword: "", customModels: [] }))),
    opencode: Schema.optional(OpenCodeServerProviderSettings).pipe(Schema.withDecodingDefault(() => ({ enabled: true, binaryPath: "opencode", serverUrl: "", serverPassword: "", customModels: [] }))),
    pi: Schema.optional(PiServerProviderSettings).pipe(Schema.withDecodingDefault(() => ({ enabled: true, binaryPath: "pi", agentDir: "", customModels: [] }))),
  })).pipe(Schema.withDecodingDefault(() => ({
    codex: { enabled: true, binaryPath: "codex", homePath: "", customModels: [] },
    claudeAgent: { enabled: true, binaryPath: "claude", launchArgs: "", customModels: [] },
    cursor: { enabled: true, binaryPath: "cursor-agent", apiEndpoint: "", customModels: [] },
    gemini: { enabled: true, binaryPath: "gemini", customModels: [] },
    grok: { enabled: true, binaryPath: "grok", customModels: [] },
    kilo: { enabled: true, binaryPath: "kilo", serverUrl: "", serverPassword: "", customModels: [] },
    opencode: { enabled: true, binaryPath: "opencode", serverUrl: "", serverPassword: "", customModels: [] },
    pi: { enabled: true, binaryPath: "pi", agentDir: "", customModels: [] },
  }))),
});
export type ServerSettings = typeof ServerSettings.Type;

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
} satisfies ServerSettings;

const ModelSelectionPatch = Schema.Struct({
  provider: Schema.optional(ProviderKind),
  model: Schema.optional(Schema.String.pipe(Schema.maxLength(256))),
  options: Schema.optional(Schema.Unknown),
});

const CustomModelsPatch = Schema.optional(Schema.Array(Schema.String.pipe(Schema.maxLength(256))));

const ProviderSettingsBasePatch = {
  enabled: Schema.optional(Schema.Boolean),
  binaryPath: Schema.optional(StringSetting),
  customModels: CustomModelsPatch,
};

export const ServerSettingsPatch = Schema.Struct({
  enableAssistantStreaming: Schema.optional(Schema.Boolean),
  defaultThreadEnvMode: Schema.optional(ThreadEnvironmentMode),
  addProjectBaseDirectory: Schema.optional(StringSetting),
  textGenerationModelSelection: Schema.optional(ModelSelectionPatch),
  providers: Schema.optional(
    Schema.Struct({
      codex: Schema.optional(
        Schema.Struct({
          ...ProviderSettingsBasePatch,
          homePath: Schema.optional(StringSetting),
        }),
      ),
      claudeAgent: Schema.optional(
        Schema.Struct({
          ...ProviderSettingsBasePatch,
          launchArgs: Schema.optional(Schema.String.pipe(Schema.maxLength(4096))),
        }),
      ),
      cursor: Schema.optional(
        Schema.Struct({
          ...ProviderSettingsBasePatch,
          apiEndpoint: Schema.optional(StringSetting),
        }),
      ),
      gemini: Schema.optional(Schema.Struct(ProviderSettingsBasePatch)),
      grok: Schema.optional(Schema.Struct(ProviderSettingsBasePatch)),
      kilo: Schema.optional(
        Schema.Struct({
          ...ProviderSettingsBasePatch,
          serverUrl: Schema.optional(StringSetting),
          serverPassword: Schema.optional(StringSetting),
        }),
      ),
      opencode: Schema.optional(
        Schema.Struct({
          ...ProviderSettingsBasePatch,
          serverUrl: Schema.optional(StringSetting),
          serverPassword: Schema.optional(StringSetting),
        }),
      ),
      pi: Schema.optional(
        Schema.Struct({
          ...ProviderSettingsBasePatch,
          binaryPath: Schema.optional(StringSetting),
          agentDir: Schema.optional(StringSetting),
        }),
      ),
    }),
  ),
});
export type ServerSettingsPatch = typeof ServerSettingsPatch.Type;

export class ServerSettingsError extends Data.TaggedError("ServerSettingsError")<{
  readonly settingsPath: string;
  readonly detail: string;
  readonly cause?: unknown;
}> {
  override get message(): string {
    return `Server settings error at ${this.settingsPath}: ${this.detail}`;
  }
}
