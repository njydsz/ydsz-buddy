/**
 * Codex 配置文件解析工具模块
 *
 * 本模块提供对 `CODEX_HOME/config.toml` 配置文件的轻量级解析能力，
 * 用于发现模型提供商（provider）信息，无需引入完整的 TOML 解析依赖。
 *
 * 主要功能：
 * - 解析当前激活的模型提供商配置
 * - 提取指定提供商的环境变量密钥名称
 * - 解析 CODEX_HOME 目录路径
 * - 读取配置文件内容
 *
 * @module codexConfig
 */
import OS from "node:os";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 从 TOML 配置行中读取带引号的赋值语句值
 *
 * 支持双引号和单引号两种格式，例如：
 * - `key = "value"` -> 返回 "value"
 * - `key = 'value'` -> 返回 "value"
 *
 * @param trimmedLine - 已去除首尾空白的配置行
 * @param key - 要匹配的键名
 * @returns 匹配到的值，未匹配则返回 undefined
 */
function readQuotedAssignmentValue(trimmedLine: string, key: string): string | undefined {
  const match = trimmedLine.match(new RegExp(`^${key}\\s*=\\s*(?:"([^"]+)"|'([^']+)')`));
  return match?.[1] ?? match?.[2];
}

/**
 * 从 TOML 配置行中解析 model_providers 节区名称
 *
 * 支持以下三种节区格式：
 * - `[model_providers.provider_name]`
 * - `[model_providers."provider_name"]`
 * - `[model_providers.'provider_name']`
 *
 * @param trimmedLine - 已去除首尾空白的配置行
 * @returns 提供商名称，未匹配则返回 undefined
 */
function readModelProviderSectionName(trimmedLine: string): string | undefined {
  const match = trimmedLine.match(
    /^\[\s*model_providers\.(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_-]+))\s*\]$/,
  );
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

/**
 * 解析配置文件中的当前模型提供商名称
 *
 * 从 TOML 配置内容的顶层（非节区内）查找 `model_provider` 字段的值。
 * 仅解析第一个匹配项，遇到节区头（`[...]`）后停止扫描。
 *
 * @param content - TOML 配置文件内容
 * @returns 当前配置的模型提供商名称，未找到则返回 undefined
 *
 * @example
 * ```ts
 * const content = `model_provider = "anthropic"\n[model_providers.openai]`;
 * parseCodexConfigModelProvider(content); // 返回 "anthropic"
 * ```
 */
export function parseCodexConfigModelProvider(content: string): string | undefined {
  let inTopLevel = true;
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    // 跳过空行和注释行
    if (!trimmed || trimmed.startsWith("#")) continue;
    // 遇到节区头后，不再处于顶层
    if (trimmed.startsWith("[")) {
      inTopLevel = false;
      continue;
    }
    if (!inTopLevel) continue;

    const provider = readQuotedAssignmentValue(trimmed, "model_provider");
    if (provider) return provider;
  }

  return undefined;
}

/**
 * 解析指定提供商的环境变量密钥名称
 *
 * 在 `[model_providers.<provider>]` 节区内查找 `env_key` 字段的值，
 * 用于获取该提供商对应的 API 密钥环境变量名。
 *
 * @param content - TOML 配置文件内容
 * @param provider - 目标提供商名称
 * @returns 环境变量密钥名称，未找到则返回 undefined
 *
 * @example
 * ```ts
 * const content = `[model_providers.anthropic]\nenv_key = "ANTHROPIC_API_KEY"`;
 * parseCodexConfigProviderEnvKey(content, "anthropic"); // 返回 "ANTHROPIC_API_KEY"
 * ```
 */
export function parseCodexConfigProviderEnvKey(
  content: string,
  provider: string,
): string | undefined {
  let currentProviderSection: string | undefined;

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    // 跳过空行和注释行
    if (!trimmed || trimmed.startsWith("#")) continue;

    // 检测节区头，更新当前提供商节区名称
    if (trimmed.startsWith("[")) {
      currentProviderSection = readModelProviderSectionName(trimmed);
      continue;
    }

    // 仅处理目标提供商节区内的配置
    if (currentProviderSection !== provider) continue;

    const envKey = readQuotedAssignmentValue(trimmed, "env_key");
    if (envKey) return envKey;
  }

  return undefined;
}

/**
 * 解析当前激活提供商的环境变量密钥名称
 *
 * 组合调用 `parseCodexConfigModelProvider` 和 `parseCodexConfigProviderEnvKey`，
 * 获取当前配置中激活的模型提供商对应的环境变量密钥名。
 * 注意：如果提供商是 "openai"（默认），则返回 undefined，因为 OpenAI 使用默认的 `OPENAI_API_KEY`。
 *
 * @param content - TOML 配置文件内容
 * @returns 当前激活提供商的环境变量密钥名称，未找到或为 openai 时返回 undefined
 */
export function parseCodexConfigActiveProviderEnvKey(content: string): string | undefined {
  const provider = parseCodexConfigModelProvider(content);
  // openai 是默认提供商，无需额外配置环境变量密钥
  if (!provider || provider === "openai") {
    return undefined;
  }

  return parseCodexConfigProviderEnvKey(content, provider);
}

/**
 * 解析 CODEX_HOME 目录路径
 *
 * 优先使用环境变量 `CODEX_HOME` 的值，如果未设置或为空，
 * 则返回默认路径 `~/.codex`（用户主目录下的 .codex 文件夹）。
 *
 * @param env - 环境变量对象，默认为 `process.env`
 * @returns CODEX_HOME 目录的绝对路径
 *
 * @example
 * ```ts
 * resolveCodexHome(); // 返回 "/Users/username/.codex" 或环境变量指定的路径
 * resolveCodexHome({ CODEX_HOME: "/custom/path" }); // 返回 "/custom/path"
 * ```
 */
export function resolveCodexHome(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.CODEX_HOME?.trim();
  return configured && configured.length > 0 ? configured : join(OS.homedir(), ".codex");
}

/**
 * 读取 Codex 配置文件内容
 *
 * 根据 CODEX_HOME 路径拼接 `config.toml` 文件名，
 * 读取并返回配置文件的完整文本内容。
 *
 * @param env - 环境变量对象，默认为 `process.env`
 * @returns 配置文件内容，文件不存在时返回 undefined
 */
export function readCodexConfigContent(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const configPath = join(resolveCodexHome(env), "config.toml");
  if (!existsSync(configPath)) {
    return undefined;
  }

  return readFileSync(configPath, "utf8");
}

/**
 * 读取当前激活提供商的环境变量密钥名称
 *
 * 组合调用 `readCodexConfigContent` 和 `parseCodexConfigActiveProviderEnvKey`，
 * 提供一站式接口：读取配置文件并解析当前激活提供商的环境变量密钥名。
 *
 * @param env - 环境变量对象，默认为 `process.env`
 * @returns 当前激活提供商的环境变量密钥名称，配置文件不存在或未配置时返回 undefined
 *
 * @example
 * ```ts
 * const envKey = readActiveCodexProviderEnvKey();
 * if (envKey) {
 *   const apiKey = process.env[envKey];
 * }
 * ```
 */
export function readActiveCodexProviderEnvKey(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const content = readCodexConfigContent(env);
  if (content === undefined) {
    return undefined;
  }

  return parseCodexConfigActiveProviderEnvKey(content);
}
