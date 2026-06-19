/**
 * 服务器设置 Schema 定义。
 * 包含各 Provider（Codex、Claude、Gemini、Grok、Cursor、OpenCode、Kilo、Pi）的配置 Schema，
 * 以及服务器全局设置、设置补丁（部分更新）和设置错误类型。
 */
import { Schema } from "effect";
import { TrimmedString } from "./baseSchemas";
import { DEFAULT_GIT_TEXT_GENERATION_MODEL } from "./model";
import { ModelSelection, ProviderKind, ThreadEnvironmentMode } from "./orchestration";

/** 字符串设置项，最大长度 4096 */
const StringSetting = TrimmedString.check(Schema.isMaxLength(4096));
/** 自定义模型列表，默认为空数组 */
const CustomModels = Schema.Array(Schema.String.check(Schema.isMaxLength(256))).pipe(
  Schema.withDecodingDefault(() => []),
);

/** Provider 设置基础字段：启用状态、二进制路径、自定义模型 */
const ProviderSettingsBase = {
  enabled: Schema.Boolean.pipe(Schema.withDecodingDefault(() => true)),
  binaryPath: StringSetting.pipe(Schema.withDecodingDefault(() => "")),
  customModels: CustomModels,
};

/** Codex Provider 设置，默认二进制路径为 "codex"，支持 homePath */
export const CodexServerProviderSettings = Schema.Struct({
  ...ProviderSettingsBase,
  binaryPath: StringSetting.pipe(Schema.withDecodingDefault(() => "codex")),
  homePath: StringSetting.pipe(Schema.withDecodingDefault(() => "")),
});
export type CodexServerProviderSettings = typeof CodexServerProviderSettings.Type;

/** Claude Agent Provider 设置，默认二进制路径为 "claude"，支持启动参数 */
export const ClaudeServerProviderSettings = Schema.Struct({
  ...ProviderSettingsBase,
  binaryPath: StringSetting.pipe(Schema.withDecodingDefault(() => "claude")),
  launchArgs: Schema.String.check(Schema.isMaxLength(4096)).pipe(
    Schema.withDecodingDefault(() => ""),
  ),
});
export type ClaudeServerProviderSettings = typeof ClaudeServerProviderSettings.Type;

/** Gemini Provider 设置，默认二进制路径为 "gemini" */
export const GeminiServerProviderSettings = Schema.Struct({
  ...ProviderSettingsBase,
  binaryPath: StringSetting.pipe(Schema.withDecodingDefault(() => "gemini")),
});
export type GeminiServerProviderSettings = typeof GeminiServerProviderSettings.Type;

/** Grok Provider 设置，默认二进制路径为 "grok" */
export const GrokServerProviderSettings = Schema.Struct({
  ...ProviderSettingsBase,
  binaryPath: StringSetting.pipe(Schema.withDecodingDefault(() => "grok")),
});
export type GrokServerProviderSettings = typeof GrokServerProviderSettings.Type;

/** Cursor Provider 设置，默认二进制路径为 "cursor-agent"，支持 API 端点 */
export const CursorServerProviderSettings = Schema.Struct({
  ...ProviderSettingsBase,
  binaryPath: StringSetting.pipe(Schema.withDecodingDefault(() => "cursor-agent")),
  apiEndpoint: StringSetting.pipe(Schema.withDecodingDefault(() => "")),
});
export type CursorServerProviderSettings = typeof CursorServerProviderSettings.Type;

/** OpenCode Provider 设置，默认二进制路径为 "opencode"，支持服务器 URL 和密码 */
export const OpenCodeServerProviderSettings = Schema.Struct({
  ...ProviderSettingsBase,
  binaryPath: StringSetting.pipe(Schema.withDecodingDefault(() => "opencode")),
  serverUrl: StringSetting.pipe(Schema.withDecodingDefault(() => "")),
  serverPassword: StringSetting.pipe(Schema.withDecodingDefault(() => "")),
});
export type OpenCodeServerProviderSettings = typeof OpenCodeServerProviderSettings.Type;

/** Kilo Provider 设置，默认二进制路径为 "kilo"，支持服务器 URL 和密码 */
export const KiloServerProviderSettings = Schema.Struct({
  ...ProviderSettingsBase,
  binaryPath: StringSetting.pipe(Schema.withDecodingDefault(() => "kilo")),
  serverUrl: StringSetting.pipe(Schema.withDecodingDefault(() => "")),
  serverPassword: StringSetting.pipe(Schema.withDecodingDefault(() => "")),
});
export type KiloServerProviderSettings = typeof KiloServerProviderSettings.Type;

/** Pi Provider 设置，默认二进制路径为 "pi"，支持 Agent 目录 */
export const PiServerProviderSettings = Schema.Struct({
  ...ProviderSettingsBase,
  binaryPath: StringSetting.pipe(Schema.withDecodingDefault(() => "pi")),
  agentDir: StringSetting.pipe(Schema.withDecodingDefault(() => "")),
});
export type PiServerProviderSettings = typeof PiServerProviderSettings.Type;

/** 服务器全局设置，包含流式输出、环境模式、模型选择及各 Provider 配置 */
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

/** 服务器默认设置（所有字段使用默认值） */
export const DEFAULT_SERVER_SETTINGS: ServerSettings = Schema.decodeSync(ServerSettings)({});

/** 模型选择的部分更新 Schema */
const ModelSelectionPatch = Schema.Struct({
  provider: Schema.optionalKey(ProviderKind),
  model: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(256))),
  options: Schema.optionalKey(Schema.Unknown),
});

/** Provider 设置的基础部分更新字段 */
const ProviderSettingsBasePatch = {
  enabled: Schema.optionalKey(Schema.Boolean),
  binaryPath: Schema.optionalKey(StringSetting),
  customModels: Schema.optionalKey(CustomModels),
};

/** 服务器设置的部分更新（Patch）Schema，用于增量更新设置 */
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

/** 服务器设置操作错误，包含设置路径和详细错误信息 */
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
