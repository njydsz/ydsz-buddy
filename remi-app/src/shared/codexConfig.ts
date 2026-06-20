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
 * @packageDocumentation
 *
 * @example 完整使用流程
 * ```ts
 * import {
 *   resolveCodexHome,
 *   readCodexConfigContent,
 *   parseCodexConfigModelProvider,
 *   readActiveCodexProviderEnvKey
 * } from './codexConfig';
 *
 * // 1. 获取 Codex 配置目录
 * const codexHome = resolveCodexHome();
 * console.log(`Codex 配置目录: ${codexHome}`);
 *
 * // 2. 读取配置文件内容
 * const configContent = readCodexConfigContent();
 * if (!configContent) {
 *   console.log('配置文件不存在');
 *   process.exit(1);
 * }
 *
 * // 3. 解析当前激活的模型提供商
 * const provider = parseCodexConfigModelProvider(configContent);
 * console.log(`当前提供商: ${provider ?? '未配置'}`);
 *
 * // 4. 获取提供商对应的环境变量密钥名
 * const envKey = readActiveCodexProviderEnvKey();
 * if (envKey) {
 *   console.log(`API 密钥环境变量: ${envKey}`);
 * }
 * ```
 *
 * @see {@link resolveCodexHome} - 解析配置目录
 * @see {@link readCodexConfigContent} - 读取配置内容
 * @see {@link parseCodexConfigModelProvider} - 解析提供商
 * @see {@link readActiveCodexProviderEnvKey} - 获取环境变量密钥
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
 * **正则表达式说明：**
 * ```regex
 * ^${key}\s*=\s*(?:"([^"]+)"|'([^']+)')
 * ```
 * - `^${key}` - 匹配行首的键名
 * - `\s*=\s*` - 匹配等号及其前后的空白字符
 * - `(?:"([^"]+)"|'([^']+)')` - 非捕获组，匹配双引号或单引号包裹的值
 *   - `"([^"]+)"` - 双引号格式，捕获组 1 提取值
 *   - `'([^']+)` - 单引号格式，捕获组 2 提取值
 *
 * @param trimmedLine - 已去除首尾空白的配置行
 * @param key - 要匹配的键名（必须是合法的正则表达式字符）
 * @returns 匹配到的值，未匹配则返回 undefined
 *
 * @private 此函数为内部实现细节，不应直接调用
 *
 * @example
 * ```ts
 * readQuotedAssignmentValue('model_provider = "anthropic"', 'model_provider');
 * // 返回: "anthropic"
 *
 * readQuotedAssignmentValue("env_key = 'ANTHROPIC_API_KEY'", 'env_key');
 * // 返回: "ANTHROPIC_API_KEY"
 *
 * readQuotedAssignmentValue('invalid_line', 'key');
 * // 返回: undefined
 * ```
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
 * **正则表达式说明：**
 * ```regex
 * ^\[\s*model_providers\.(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_-]+))\s*\]$
 * ```
 * - `^\[` - 匹配行首的左方括号
 * - `\s*` - 匹配可选的空白字符
 * - `model_providers\.` - 匹配固定的 "model_providers." 前缀
 * - `(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_-]+))` - 非捕获组，匹配三种提供商名称格式
 *   - `"([^"]+)"` - 双引号格式，捕获组 1
 *   - `'([^']+)'` - 单引号格式，捕获组 2
 *   - `([A-Za-z0-9_-]+)` - 无引号格式（仅允许字母、数字、下划线、连字符），捕获组 3
 * - `\s*\]$` - 匹配可选空白和右方括号
 *
 * @param trimmedLine - 已去除首尾空白的配置行
 * @returns 提供商名称，未匹配则返回 undefined
 *
 * @private 此函数为内部实现细节，不应直接调用
 *
 * @example
 * ```ts
 * readModelProviderSectionName('[model_providers.anthropic]');
 * // 返回: "anthropic"
 *
 * readModelProviderSectionName('[model_providers."my-provider"]');
 * // 返回: "my-provider"
 *
 * readModelProviderSectionName('[other_section]');
 * // 返回: undefined
 * ```
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
 * **解析规则：**
 * 1. 逐行扫描配置文件内容
 * 2. 跳过空行和注释行（以 `#` 开头）
 * 3. 遇到节区头（以 `[` 开头）时停止扫描
 * 4. 在顶层区域查找 `model_provider = "value"` 格式的赋值语句
 * 5. 返回第一个匹配到的值
 *
 * @param content - TOML 配置文件内容（UTF-8 编码的字符串）
 * @returns 当前配置的模型提供商名称，未找到则返回 undefined
 *
 * @throws 此函数不会抛出异常，但传入无效内容可能返回 undefined
 *
 * @example
 * ```ts
 * const content = `model_provider = "anthropic"
 * [model_providers.openai]
 * env_key = "OPENAI_API_KEY"`;
 *
 * parseCodexConfigModelProvider(content);
 * // 返回: "anthropic"
 * ```
 *
 * @example 未配置提供商的情况
 * ```ts
 * const content = `[model_providers.anthropic]
 * env_key = "ANTHROPIC_API_KEY"`;
 *
 * parseCodexConfigModelProvider(content);
 * // 返回: undefined
 * ```
 *
 * @see {@link parseCodexConfigProviderEnvKey} - 解析指定提供商的环境变量密钥
 * @see {@link parseCodexConfigActiveProviderEnvKey} - 解析当前激活提供商的环境变量密钥
 */
export function parseCodexConfigModelProvider(content: string): string | undefined {
  let inTopLevel = true;
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    // 跳过空行和注释行
    if (!trimmed || trimmed.startsWith("#")) continue;
    // 遇到节区头后，不再处于顶层，停止扫描
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
 * **解析规则：**
 * 1. 逐行扫描配置文件内容
 * 2. 跳过空行和注释行
 * 3. 识别节区头，记录当前所处的提供商节区名称
 * 4. 当处于目标提供商节区时，查找 `env_key = "value"` 格式的赋值语句
 * 5. 返回第一个匹配到的值
 *
 * **注意事项：**
 * - 如果配置文件中存在多个同名提供商节区，仅解析第一个匹配项
 * - 提供商名称匹配是区分大小写的
 * - 如果目标提供商节区不存在，返回 undefined
 *
 * @param content - TOML 配置文件内容（UTF-8 编码的字符串）
 * @param provider - 目标提供商名称（必须与节区头中的名称完全匹配）
 * @returns 环境变量密钥名称，未找到则返回 undefined
 *
 * @throws 此函数不会抛出异常，但传入无效内容可能返回 undefined
 *
 * @example
 * ```ts
 * const content = `[model_providers.anthropic]
 * env_key = "ANTHROPIC_API_KEY"
 * base_url = "https://api.anthropic.com"
 *
 * [model_providers.openai]
 * env_key = "OPENAI_API_KEY"`;
 *
 * parseCodexConfigProviderEnvKey(content, "anthropic");
 * // 返回: "ANTHROPIC_API_KEY"
 *
 * parseCodexConfigProviderEnvKey(content, "openai");
 * // 返回: "OPENAI_API_KEY"
 *
 * parseCodexConfigProviderEnvKey(content, "nonexistent");
 * // 返回: undefined
 * ```
 *
 * @see {@link parseCodexConfigModelProvider} - 解析当前模型提供商
 * @see {@link parseCodexConfigActiveProviderEnvKey} - 解析当前激活提供商的环境变量密钥
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
 *
 * **特殊处理：**
 * - 如果提供商是 "openai"（默认提供商），返回 undefined
 *   因为 OpenAI 使用默认的 `OPENAI_API_KEY` 环境变量，无需额外配置
 * - 如果未配置 `model_provider` 字段，返回 undefined
 * - 如果配置的提供商没有对应的 `env_key` 设置，返回 undefined
 *
 * **调用链：**
 * ```
 * parseCodexConfigActiveProviderEnvKey
 *   ├─ parseCodexConfigModelProvider (获取当前提供商)
 *   └─ parseCodexConfigProviderEnvKey (获取该提供商的 env_key)
 * ```
 *
 * @param content - TOML 配置文件内容（UTF-8 编码的字符串）
 * @returns 当前激活提供商的环境变量密钥名称，未找到或为 openai 时返回 undefined
 *
 * @throws 此函数不会抛出异常，但传入无效内容可能返回 undefined
 *
 * @example 配置了第三方提供商
 * ```ts
 * const content = `model_provider = "anthropic"
 *
 * [model_providers.anthropic]
 * env_key = "ANTHROPIC_API_KEY"`;
 *
 * parseCodexConfigActiveProviderEnvKey(content);
 * // 返回: "ANTHROPIC_API_KEY"
 * ```
 *
 * @example 使用默认 OpenAI 提供商
 * ```ts
 * const content = `model_provider = "openai"
 *
 * [model_providers.openai]
 * env_key = "OPENAI_API_KEY"`;
 *
 * parseCodexConfigActiveProviderEnvKey(content);
 * // 返回: undefined (OpenAI 使用默认环境变量)
 * ```
 *
 * @example 未配置提供商
 * ```ts
 * const content = `[model_providers.anthropic]
 * env_key = "ANTHROPIC_API_KEY"`;
 *
 * parseCodexConfigActiveProviderEnvKey(content);
 * // 返回: undefined
 * ```
 *
 * @see {@link parseCodexConfigModelProvider} - 解析当前模型提供商
 * @see {@link parseCodexConfigProviderEnvKey} - 解析指定提供商的环境变量密钥
 * @see {@link readActiveCodexProviderEnvKey} - 从文件读取当前激活提供商的环境变量密钥
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
 * **路径解析优先级：**
 * 1. 环境变量 `CODEX_HOME`（如果存在且非空）
 * 2. 默认路径：`<用户主目录>/.codex`
 *
 * **路径处理：**
 * - 自动去除环境变量值的首尾空白字符
 * - 使用 `path.join` 确保路径分隔符的正确性（跨平台兼容）
 * - 返回的路径可能是相对路径或绝对路径，取决于环境变量的值
 *
 * @param env - 环境变量对象，默认为 `process.env`
 *                主要用于测试时注入自定义环境变量
 * @returns CODEX_HOME 目录的路径（字符串格式）
 *
 * @throws 此函数不会抛出异常
 *
 * @example 使用默认路径
 * ```ts
 * // 假设用户主目录为 /home/user
 * resolveCodexHome();
 * // 返回: "/home/user/.codex"
 * ```
 *
 * @example 使用自定义环境变量
 * ```ts
 * resolveCodexHome({ CODEX_HOME: "/custom/path" });
 * // 返回: "/custom/path"
 * ```
 *
 * @example 环境变量为空字符串
 * ```ts
 * resolveCodexHome({ CODEX_HOME: "  " });
 * // 返回: "/home/user/.codex" (回退到默认路径)
 * ```
 *
 * @see {@link readCodexConfigContent} - 读取配置文件内容（依赖此函数确定路径）
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
 * **文件读取流程：**
 * 1. 调用 `resolveCodexHome` 获取配置目录路径
 * 2. 拼接配置文件完整路径：`<CODEX_HOME>/config.toml`
 * 3. 检查文件是否存在
 * 4. 如果存在，以 UTF-8 编码读取文件内容
 * 5. 如果不存在，返回 undefined
 *
 * **注意事项：**
 * - 文件必须以 UTF-8 编码保存
 * - 如果文件不存在，不会抛出异常，而是返回 undefined
 * - 如果文件存在但无法读取（权限问题），会抛出异常
 * - 不会缓存文件内容，每次调用都会重新读取
 *
 * @param env - 环境变量对象，默认为 `process.env`
 *                主要用于测试时注入自定义环境变量
 * @returns 配置文件内容（UTF-8 字符串），文件不存在时返回 undefined
 *
 * @throws {Error} 当文件存在但无法读取时（如权限不足）
 *
 * @example 配置文件存在
 * ```ts
 * // 假设 ~/.codex/config.toml 存在且内容为：
 * // model_provider = "anthropic"
 *
 * const content = readCodexConfigContent();
 * console.log(content);
 * // 输出: 'model_provider = "anthropic"\n...'
 * ```
 *
 * @example 配置文件不存在
 * ```ts
 * const content = readCodexConfigContent();
 * console.log(content);
 * // 输出: undefined
 * ```
 *
 * @see {@link resolveCodexHome} - 解析配置目录路径
 * @see {@link parseCodexConfigActiveProviderEnvKey} - 解析配置文件内容
 * @see {@link readActiveCodexProviderEnvKey} - 一站式读取并解析配置
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
 * **完整调用链：**
 * ```
 * readActiveCodexProviderEnvKey
 *   ├─ readCodexConfigContent (读取配置文件)
 *   │   ├─ resolveCodexHome (获取配置目录)
 *   │   └─ readFileSync (读取文件)
 *   └─ parseCodexConfigActiveProviderEnvKey (解析配置内容)
 *       ├─ parseCodexConfigModelProvider (获取当前提供商)
 *       └─ parseCodexConfigProviderEnvKey (获取 env_key)
 * ```
 *
 * **返回值说明：**
 * - 配置文件不存在：返回 undefined
 * - 未配置 `model_provider`：返回 undefined
 * - 提供商为 "openai"：返回 undefined（使用默认环境变量）
 * - 提供商存在但未配置 `env_key`：返回 undefined
 * - 正常配置：返回环境变量名称字符串
 *
 * **使用建议：**
 * - 这是最常用的顶层接口，适合大多数使用场景
 * - 如果需要批量解析多个配置项，建议分别调用底层函数以避免重复读取文件
 * - 如果需要解析配置文件的其他内容，建议先调用 `readCodexConfigContent` 获取内容
 *
 * @param env - 环境变量对象，默认为 `process.env`
 *                主要用于测试时注入自定义环境变量
 * @returns 当前激活提供商的环境变量密钥名称，配置文件不存在或未配置时返回 undefined
 *
 * @throws {Error} 当配置文件存在但无法读取时（如权限不足）
 *
 * @example 完整使用示例
 * ```ts
 * // 获取当前激活提供商的环境变量密钥名
 * const envKey = readActiveCodexProviderEnvKey();
 *
 * if (envKey) {
 *   // 从环境变量中获取 API 密钥
 *   const apiKey = process.env[envKey];
 *
 *   if (!apiKey) {
 *     console.error(`环境变量 ${envKey} 未设置`);
 *     process.exit(1);
 *   }
 *
 *   console.log(`使用提供商: ${envKey}`);
 *   // 初始化 API 客户端...
 * } else {
 *   console.log('使用默认 OpenAI 提供商');
 *   // 使用默认的 OPENAI_API_KEY...
 * }
 * ```
 *
 * @example 测试时注入自定义环境变量
 * ```ts
 * const testEnv = {
 *   CODEX_HOME: '/tmp/test-codex'
 * };
 *
 * const envKey = readActiveCodexProviderEnvKey(testEnv);
 * ```
 *
 * @see {@link resolveCodexHome} - 解析配置目录路径
 * @see {@link readCodexConfigContent} - 读取配置文件内容
 * @see {@link parseCodexConfigActiveProviderEnvKey} - 解析配置文件内容
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
