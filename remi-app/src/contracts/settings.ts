/**
 * @file 用户设置契约模块
 *
 * 本模块定义了 Remi 系统用户级别的设置（Settings）契约，涵盖主题、字体、语言、
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

import { Schema } from "effect";
import { TrimmedString } from "./baseSchemas";
import { DEFAULT_GIT_TEXT_GENERATION_MODEL } from "./model";
import { ModelSelection, ProviderKind, ThreadEnvironmentMode } from "./orchestration";

const StringSetting = TrimmedString.check(Schema.isMaxLength(4096));
const CustomModels = Schema.Array(Schema.String.check(Schema.isMaxLength(256))).pipe(
  Schema.withDecodingDefault(() => []),
);

const ProviderSettingsBase = {
  enabled: Schema.Boolean.pipe(Schema.withDecodingDefault(() => true)),
  binaryPath: StringSetting.pipe(Schema.withDecodingDefault(() => "")),
  customModels: CustomModels,
};

export const CodexServerProviderSettings = Schema.Struct({
  ...ProviderSettingsBase,
  binaryPath: StringSetting.pipe(Schema.withDecodingDefault(() => "codex")),
  homePath: StringSetting.pipe(Schema.withDecodingDefault(() => "")),
});
export type CodexServerProviderSettings = typeof CodexServerProviderSettings.Type;

export const ClaudeServerProviderSettings = Schema.Struct({
  ...ProviderSettingsBase,
  binaryPath: StringSetting.pipe(Schema.withDecodingDefault(() => "claude")),
  launchArgs: Schema.String.check(Schema.isMaxLength(4096)).pipe(
    Schema.withDecodingDefault(() => ""),
  ),
});
export type ClaudeServerProviderSettings = typeof ClaudeServerProviderSettings.Type;

export const GeminiServerProviderSettings = Schema.Struct({
  ...ProviderSettingsBase,
  binaryPath: StringSetting.pipe(Schema.withDecodingDefault(() => "gemini")),
});
export type GeminiServerProviderSettings = typeof GeminiServerProviderSettings.Type;

export const GrokServerProviderSettings = Schema.Struct({
  ...ProviderSettingsBase,
  binaryPath: StringSetting.pipe(Schema.withDecodingDefault(() => "grok")),
});
export type GrokServerProviderSettings = typeof GrokServerProviderSettings.Type;

export const CursorServerProviderSettings = Schema.Struct({
  ...ProviderSettingsBase,
  binaryPath: StringSetting.pipe(Schema.withDecodingDefault(() => "cursor-agent")),
  apiEndpoint: StringSetting.pipe(Schema.withDecodingDefault(() => "")),
});
export type CursorServerProviderSettings = typeof CursorServerProviderSettings.Type;

export const OpenCodeServerProviderSettings = Schema.Struct({
  ...ProviderSettingsBase,
  binaryPath: StringSetting.pipe(Schema.withDecodingDefault(() => "opencode")),
  serverUrl: StringSetting.pipe(Schema.withDecodingDefault(() => "")),
  serverPassword: StringSetting.pipe(Schema.withDecodingDefault(() => "")),
});
export type OpenCodeServerProviderSettings = typeof OpenCodeServerProviderSettings.Type;

export const KiloServerProviderSettings = Schema.Struct({
  ...ProviderSettingsBase,
  binaryPath: StringSetting.pipe(Schema.withDecodingDefault(() => "kilo")),
  serverUrl: StringSetting.pipe(Schema.withDecodingDefault(() => "")),
  serverPassword: StringSetting.pipe(Schema.withDecodingDefault(() => "")),
});
export type KiloServerProviderSettings = typeof KiloServerProviderSettings.Type;

export const PiServerProviderSettings = Schema.Struct({
  ...ProviderSettingsBase,
  binaryPath: StringSetting.pipe(Schema.withDecodingDefault(() => "pi")),
  agentDir: StringSetting.pipe(Schema.withDecodingDefault(() => "")),
});
export type PiServerProviderSettings = typeof PiServerProviderSettings.Type;

export const ServerSettings = Schema.Struct({
  enableAssistantStreaming: Schema.Boolean.pipe(Schema.withDecodingDefault(() => false)),
  defaultThreadEnvMode: ThreadEnvironmentMode.pipe(Schema.withDecodingDefault(() => "local")),
  addProjectBaseDirectory: StringSetting.pipe(Schema.withDecodingDefault(() => "")),
  textGenerationModelSelection: ModelSelection.pipe(
    Schema.withDecodingDefault(() => ({
      provider: "codex" as const,
      model: DEFAULT_GIT_TEXT_GENERATION_MODEL,
    })),
  ),
  providers: Schema.Struct({
    codex: CodexServerProviderSettings.pipe(Schema.withDecodingDefault(() => ({}))),
    claudeAgent: ClaudeServerProviderSettings.pipe(Schema.withDecodingDefault(() => ({}))),
    cursor: CursorServerProviderSettings.pipe(Schema.withDecodingDefault(() => ({}))),
    gemini: GeminiServerProviderSettings.pipe(Schema.withDecodingDefault(() => ({}))),
    grok: GrokServerProviderSettings.pipe(Schema.withDecodingDefault(() => ({}))),
    kilo: KiloServerProviderSettings.pipe(Schema.withDecodingDefault(() => ({}))),
    opencode: OpenCodeServerProviderSettings.pipe(Schema.withDecodingDefault(() => ({}))),
    pi: PiServerProviderSettings.pipe(Schema.withDecodingDefault(() => ({}))),
  }).pipe(Schema.withDecodingDefault(() => ({}))),
});
export type ServerSettings = typeof ServerSettings.Type;

export const DEFAULT_SERVER_SETTINGS: ServerSettings = Schema.decodeSync(ServerSettings)({});

const ModelSelectionPatch = Schema.Struct({
  provider: Schema.optionalKey(ProviderKind),
  model: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(256))),
  options: Schema.optionalKey(Schema.Unknown),
});

const ProviderSettingsBasePatch = {
  enabled: Schema.optionalKey(Schema.Boolean),
  binaryPath: Schema.optionalKey(StringSetting),
  customModels: Schema.optionalKey(CustomModels),
};

export const ServerSettingsPatch = Schema.Struct({
  enableAssistantStreaming: Schema.optionalKey(Schema.Boolean),
  defaultThreadEnvMode: Schema.optionalKey(ThreadEnvironmentMode),
  addProjectBaseDirectory: Schema.optionalKey(StringSetting),
  textGenerationModelSelection: Schema.optionalKey(ModelSelectionPatch),
  providers: Schema.optionalKey(
    Schema.Struct({
      codex: Schema.optionalKey(
        Schema.Struct({
          ...ProviderSettingsBasePatch,
          homePath: Schema.optionalKey(StringSetting),
        }),
      ),
      claudeAgent: Schema.optionalKey(
        Schema.Struct({
          ...ProviderSettingsBasePatch,
          launchArgs: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(4096))),
        }),
      ),
      cursor: Schema.optionalKey(
        Schema.Struct({
          ...ProviderSettingsBasePatch,
          apiEndpoint: Schema.optionalKey(StringSetting),
        }),
      ),
      gemini: Schema.optionalKey(Schema.Struct(ProviderSettingsBasePatch)),
      grok: Schema.optionalKey(Schema.Struct(ProviderSettingsBasePatch)),
      kilo: Schema.optionalKey(
        Schema.Struct({
          ...ProviderSettingsBasePatch,
          serverUrl: Schema.optionalKey(StringSetting),
          serverPassword: Schema.optionalKey(StringSetting),
        }),
      ),
      opencode: Schema.optionalKey(
        Schema.Struct({
          ...ProviderSettingsBasePatch,
          serverUrl: Schema.optionalKey(StringSetting),
          serverPassword: Schema.optionalKey(StringSetting),
        }),
      ),
      pi: Schema.optionalKey(
        Schema.Struct({
          ...ProviderSettingsBasePatch,
          binaryPath: Schema.optionalKey(StringSetting),
          agentDir: Schema.optionalKey(StringSetting),
        }),
      ),
    }),
  ),
});
export type ServerSettingsPatch = typeof ServerSettingsPatch.Type;

export class ServerSettingsError extends Schema.TaggedErrorClass<ServerSettingsError>()(
  "ServerSettingsError",
  {
    settingsPath: Schema.String,
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {
  override get message(): string {
    return `Server settings error at ${this.settingsPath}: ${this.detail}`;
  }
}
