/**
 * @file Codex 配置解析工具模块
 *
 * 本模块提供解析 `CODEX_HOME/config.toml` 中一小部分配置的工具，
 * 用于 Provider 发现，无需引入完整的 TOML 依赖库：
 *
 * - **Provider 解析**：从顶层配置读取 `model_provider`
 * - **Provider Section 解析**：读取特定 Provider Section 中的 `env_key`
 * - **环境变量读取**：从进程环境变量解析 Codex 路径
 *
 * ## 核心导出
 *
 * - `parseCodexConfigModelProvider`：解析当前 model_provider
 * - `parseCodexConfigProviderEnvKey`：解析特定 Provider 的 env_key
 * - `parseCodexConfigActiveProviderEnvKey`：解析当前激活 Provider 的 env_key
 * - `resolveCodexHome`：解析 CODEX_HOME 路径
 * - `readCodexConfigContent`：读取配置文件内容
 * - `readActiveCodexProviderEnvKey`：读取激活 Provider 的环境变量键
 *
 * ## 使用场景
 *
 * - 发现用户配置的 Codex Provider
 * - 获取 Provider 相关的环境变量键
 * - Provider 发现时读取本地配置
 *
 * ## 注意事项
 *
 * - 不解析完整的 TOML 语法，仅提取所需字段
 * - 配置文件可能不存在，返回 undefined
 * - 仅支持顶级配置和 `[model_providers.<name>]` 格式的 Section
 */
import OS from "node:os";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function readQuotedAssignmentValue(trimmedLine: string, key: string): string | undefined {
  const match = trimmedLine.match(new RegExp(`^${key}\\s*=\\s*(?:"([^"]+)"|'([^']+)')`));
  return match?.[1] ?? match?.[2];
}

function readModelProviderSectionName(trimmedLine: string): string | undefined {
  const match = trimmedLine.match(
    /^\[\s*model_providers\.(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_-]+))\s*\]$/,
  );
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

/**
 * 解析 Codex 配置中的 model_provider。
 *
 * 仅扫描顶级配置（不在任何 `[...]` Section 内）的 `model_provider` 字段。
 *
 * @param content - 配置文件内容
 * @returns model_provider 值，若未找到则返回 undefined
 */
export function parseCodexConfigModelProvider(content: string): string | undefined {
  let inTopLevel = true;
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
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
 * 解析 Codex 配置中特定 Provider Section 的 env_key。
 *
 * 扫描 `[model_providers.<provider>]` Section 中的 `env_key` 字段。
 *
 * @param content - 配置文件内容
 * @param provider - Provider 名称
 * @returns env_key 值，若未找到则返回 undefined
 */
export function parseCodexConfigProviderEnvKey(
  content: string,
  provider: string,
): string | undefined {
  let currentProviderSection: string | undefined;

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (trimmed.startsWith("[")) {
      currentProviderSection = readModelProviderSectionName(trimmed);
      continue;
    }

    if (currentProviderSection !== provider) continue;

    const envKey = readQuotedAssignmentValue(trimmed, "env_key");
    if (envKey) return envKey;
  }

  return undefined;
}

/**
 * 解析 Codex 配置中当前激活 Provider 的 env_key。
 *
 * 若 `model_provider` 为 `openai` 或未配置，则返回 undefined。
 *
 * @param content - 配置文件内容
 * @returns 当前激活 Provider 的 env_key，若无则返回 undefined
 */
export function parseCodexConfigActiveProviderEnvKey(content: string): string | undefined {
  const provider = parseCodexConfigModelProvider(content);
  if (!provider || provider === "openai") {
    return undefined;
  }

  return parseCodexConfigProviderEnvKey(content, provider);
}

/**
 * 解析 CODEX_HOME 路径。
 *
 * 优先使用环境变量 `CODEX_HOME`，若未设置则使用 `~/.codex`。
 *
 * @param env - 进程环境变量对象（默认为 `process.env`）
 * @returns CODEX_HOME 路径
 */
export function resolveCodexHome(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.CODEX_HOME?.trim();
  return configured && configured.length > 0 ? configured : join(OS.homedir(), ".codex");
}

/**
 * 读取 Codex 配置文件内容。
 *
 * @param env - 进程环境变量对象（默认为 `process.env`）
 * @returns 配置文件内容，若文件不存在则返回 undefined
 */
export function readCodexConfigContent(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const configPath = join(resolveCodexHome(env), "config.toml");
  if (!existsSync(configPath)) {
    return undefined;
  }

  return readFileSync(configPath, "utf8");
}

/**
 * 读取当前激活 Codex Provider 的环境变量键。
 *
 * 组合调用 `readCodexConfigContent` 和 `parseCodexConfigActiveProviderEnvKey`。
 *
 * @param env - 进程环境变量对象（默认为 `process.env`）
 * @returns 激活 Provider 的 env_key，若无则返回 undefined
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
