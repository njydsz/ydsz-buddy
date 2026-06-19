/**
 * @file 登录 Shell 环境探测工具模块
 *
 * @description
 * 提供安全探测用户登录 Shell 环境变量的工具函数，用于获取 PATH 和其他环境变量。
 * 主要解决 GUI 应用程序（如 IDE、桌面应用）无法继承用户 Shell 环境的问题。
 *
 * 核心功能：
 * - 登录 Shell 候选列表解析（`listLoginShellCandidates`）
 * - 从登录 Shell 读取环境变量（`readEnvironmentFromLoginShell`）
 * - 从登录 Shell 读取 PATH（`readPathFromLoginShell`）
 * - 从 macOS launchctl 读取 PATH（`readPathFromLaunchctl`）
 * - PATH 条目合并（`mergePathEntries`）
 * - 从 Shell 输出中提取 PATH（`extractPathFromShellOutput`）
 *
 * 使用场景：
 * - IDE 启动时需要继承用户的 Shell 环境变量
 * - 子进程执行时需要正确的 PATH 配置
 * - 跨平台环境兼容性处理
 *
 * 技术实现：
 * - 使用标记符（`__REMICODE_PATH_START__` / `__REMICODE_PATH_END__`）包裹输出，
 *   避免 Shell 启动脚本的其他输出干扰
 * - 使用 `-ilc` 参数启动交互式登录 Shell，确保加载完整的环境配置
 * - 支持超时控制（默认 5 秒），防止 Shell 启动脚本卡死
 *
 * @module shell
 * @layer 共享工具层
 *
 * @example
 * ```ts
 * import { readPathFromLoginShell, mergePathEntries } from './shell';
 *
 * // 从登录 Shell 读取 PATH
 * const shellPath = readPathFromLoginShell('/bin/zsh');
 * console.log(shellPath); // '/usr/local/bin:/usr/bin:/bin:...'
 *
 * // 合并多个 PATH
 * const mergedPath = mergePathEntries(shellPath, process.env.PATH, 'darwin');
 * console.log(mergedPath); // 合并后的 PATH
 * ```
 */
import * as OS from "node:os";
import { execFileSync } from "node:child_process";

/** PATH 捕获起始标记符，用于从 Shell 输出中精确定位 PATH 值 */
const PATH_CAPTURE_START = "__REMICODE_PATH_START__";
/** PATH 捕获结束标记符 */
const PATH_CAPTURE_END = "__REMICODE_PATH_END__";
/** 环境变量名称的合法字符模式（仅允许大写字母、数字和下划线） */
const SHELL_ENV_NAME_PATTERN = /^[A-Z0-9_]+$/;

/**
 * execFileSync 函数的类型定义
 *
 * 用于依赖注入，支持测试时替换为 mock 实现。
 *
 * @param file - 要执行的文件路径
 * @param args - 命令参数数组
 * @param options - 执行选项（编码和超时）
 * @returns 命令的标准输出字符串
 */
type ExecFileSyncLike = (
  file: string,
  args: ReadonlyArray<string>,
  options: { encoding: "utf8"; timeout: number },
) => string;

/**
 * 修剪字符串并返回非空结果
 *
 * 去除首尾空白字符，如果结果为空字符串则返回 undefined。
 *
 * @param value - 待修剪的字符串
 * @returns 修剪后的非空字符串，或 undefined
 *
 * @private 此函数为内部实现细节，不应直接调用
 */
function trimNonEmpty(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

/**
 * 读取用户配置的默认登录 Shell
 *
 * 通过 `OS.userInfo().shell` 获取系统配置的用户登录 Shell。
 * 在某些环境下（如 Windows 或权限受限环境）可能失败，此时返回 undefined。
 *
 * @returns 用户的登录 Shell 路径，获取失败返回 undefined
 *
 * @private 此函数为内部实现细节，不应直接调用
 */
function readUserLoginShell(): string | undefined {
  try {
    return trimNonEmpty(OS.userInfo().shell);
  } catch {
    return undefined;
  }
}

/**
 * 列出所有候选的登录 Shell
 *
 * 按优先级收集多个可能的登录 Shell 路径，去重后返回。
 * 优先级顺序：
 * 1. 显式传入的 `shell` 参数（最高优先级）
 * 2. 系统配置的用户登录 Shell（`readUserLoginShell()`）
 * 3. 平台默认 Shell（macOS 为 `/bin/zsh`，Linux 为 `/bin/bash`，其他为 undefined）
 *
 * @param platform - 当前操作系统平台（如 'darwin'、'linux'、'win32'）
 * @param shell - 显式指定的 Shell 路径（可选）
 * @param userShell - 用户配置的登录 Shell，默认为 `readUserLoginShell()` 的返回值
 * @returns 去重后的候选 Shell 路径数组，按优先级排序
 *
 * @throws 此函数不会抛出异常
 *
 * @example
 * ```ts
 * listLoginShellCandidates('darwin', '/bin/bash');
 * // 返回: ['/bin/bash', '/bin/zsh']（假设用户 Shell 为 /bin/zsh）
 *
 * listLoginShellCandidates('linux', undefined);
 * // 返回: ['/bin/bash']（假设用户 Shell 未配置，使用平台默认）
 * ```
 */
export function listLoginShellCandidates(
  platform: NodeJS.Platform,
  shell: string | undefined,
  userShell = readUserLoginShell(),
): ReadonlyArray<string> {
  const fallbackShell =
    platform === "darwin" ? "/bin/zsh" : platform === "linux" ? "/bin/bash" : undefined;
  const seen = new Set<string>();
  const candidates: string[] = [];

  for (const candidate of [trimNonEmpty(shell), trimNonEmpty(userShell), fallbackShell]) {
    if (!candidate || seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    candidates.push(candidate);
  }

  return candidates;
}

/**
 * 解析最终的登录 Shell
 *
 * 从候选 Shell 列表中选择第一个可用的 Shell。
 * 是 `listLoginShellCandidates` 的便捷封装。
 *
 * @param platform - 当前操作系统平台
 * @param shell - 显式指定的 Shell 路径（可选）
 * @returns 解析出的登录 Shell 路径，无法确定时返回 undefined
 *
 * @throws 此函数不会抛出异常
 *
 * @example
 * ```ts
 * resolveLoginShell('darwin', '/bin/bash');
 * // 返回: '/bin/bash'
 *
 * resolveLoginShell('linux', undefined);
 * // 返回: '/bin/bash'（平台默认）
 * ```
 *
 * @see {@link listLoginShellCandidates} - 列出所有候选 Shell
 */
export function resolveLoginShell(
  platform: NodeJS.Platform,
  shell: string | undefined,
): string | undefined {
  return listLoginShellCandidates(platform, shell)[0];
}

/**
 * 从 Shell 输出中提取 PATH 值
 *
 * 使用预定义的标记符（`__REMICODE_PATH_START__` 和 `__REMICODE_PATH_END__`）
 * 从 Shell 命令的输出中精确提取 PATH 环境变量的值。
 *
 * 提取算法：
 * 1. 查找起始标记符的位置
 * 2. 从起始标记符后查找结束标记符的位置
 * 3. 提取两个标记符之间的内容并修剪空白
 * 4. 如果内容为空或标记符不存在，返回 null
 *
 * @param output - Shell 命令的完整输出字符串
 * @returns 提取到的 PATH 值，提取失败返回 null
 *
 * @throws 此函数不会抛出异常
 *
 * @example
 * ```ts
 * const output = 'some output\n__REMICODE_PATH_START__\n/usr/local/bin:/usr/bin\n__REMICODE_PATH_END__\nmore output';
 * extractPathFromShellOutput(output);
 * // 返回: '/usr/local/bin:/usr/bin'
 *
 * extractPathFromShellOutput('no markers here');
 * // 返回: null
 * ```
 */
export function extractPathFromShellOutput(output: string): string | null {
  const startIndex = output.indexOf(PATH_CAPTURE_START);
  if (startIndex === -1) return null;

  const valueStartIndex = startIndex + PATH_CAPTURE_START.length;
  const endIndex = output.indexOf(PATH_CAPTURE_END, valueStartIndex);
  if (endIndex === -1) return null;

  const pathValue = output.slice(valueStartIndex, endIndex).trim();
  return pathValue.length > 0 ? pathValue : null;
}

/**
 * 从登录 Shell 中读取 PATH 环境变量
 *
 * 是 `readEnvironmentFromLoginShell` 的便捷封装，专门用于读取 PATH 变量。
 *
 * @param shell - 要使用的 Shell 路径（如 '/bin/zsh'）
 * @param execFile - 可选的 execFileSync 替代实现，用于测试注入
 * @returns 读取到的 PATH 值，读取失败返回 undefined
 *
 * @throws 当 Shell 执行超时或失败时可能抛出异常
 *
 * @example
 * ```ts
 * const path = readPathFromLoginShell('/bin/zsh');
 * console.log(path); // '/usr/local/bin:/usr/bin:/bin:...'
 * ```
 *
 * @see {@link readEnvironmentFromLoginShell} - 读取多个环境变量
 */
export function readPathFromLoginShell(
  shell: string,
  execFile: ExecFileSyncLike = execFileSync,
): string | undefined {
  return readEnvironmentFromLoginShell(shell, ["PATH"], execFile).PATH;
}

/**
 * 从 macOS launchctl 中读取 PATH 环境变量
 *
 * 在 macOS 上，GUI 应用程序可能无法通过登录 Shell 获取 PATH，
 * 此时可以尝试从 launchctl 获取系统级的 PATH 配置。
 *
 * 执行命令：`/bin/launchctl getenv PATH`
 * 超时时间：2 秒
 *
 * @param execFile - 可选的 execFileSync 替代实现，用于测试注入
 * @returns 读取到的 PATH 值，读取失败返回 undefined
 *
 * @throws 此函数不会抛出异常（内部捕获所有错误）
 *
 * @example
 * ```ts
 * const path = readPathFromLaunchctl();
 * console.log(path); // '/usr/local/bin:/usr/bin:/bin:...'
 * ```
 */
export function readPathFromLaunchctl(
  execFile: ExecFileSyncLike = execFileSync,
): string | undefined {
  try {
    return trimNonEmpty(
      execFile("/bin/launchctl", ["getenv", "PATH"], {
        encoding: "utf8",
        timeout: 2000,
      }),
    );
  } catch {
    return undefined;
  }
}

/**
 * 合并多个 PATH 条目
 *
 * 将首选 PATH 和继承的 PATH 合并为一个，去除重复条目并保持顺序。
 * 首选 PATH 中的条目优先级更高，排在合并结果的前面。
 *
 * 合并算法：
 * 1. 根据平台确定路径分隔符（Windows 为 `;`，其他为 `:`）
 * 2. 按顺序遍历首选 PATH 和继承 PATH 的所有条目
 * 3. 使用 Set 去重，保留首次出现的条目
 * 4. 使用分隔符重新连接所有条目
 *
 * @param preferredPath - 首选 PATH（优先级更高）
 * @param inheritedPath - 继承的 PATH（优先级较低）
 * @param platform - 当前操作系统平台，用于确定路径分隔符
 * @returns 合并后的 PATH 字符串，无有效条目时返回 undefined
 *
 * @throws 此函数不会抛出异常
 *
 * @example
 * ```ts
 * mergePathEntries('/usr/local/bin:/usr/bin', '/usr/bin:/bin', 'darwin');
 * // 返回: '/usr/local/bin:/usr/bin:/bin'（/usr/bin 去重）
 *
 * mergePathEntries('C:\\tools;C:\\bin', 'C:\\bin;C:\\windows', 'win32');
 * // 返回: 'C:\\tools;C:\\bin;C:\\windows'（使用分号分隔）
 * ```
 */
export function mergePathEntries(
  preferredPath: string | undefined,
  inheritedPath: string | undefined,
  platform: NodeJS.Platform,
): string | undefined {
  const delimiter = platform === "win32" ? ";" : ":";
  const merged: string[] = [];
  const seen = new Set<string>();

  for (const pathValue of [preferredPath, inheritedPath]) {
    if (!pathValue) continue;
    for (const entry of pathValue.split(delimiter)) {
      const trimmedEntry = entry.trim();
      if (!trimmedEntry || seen.has(trimmedEntry)) {
        continue;
      }
      seen.add(trimmedEntry);
      merged.push(trimmedEntry);
    }
  }

  return merged.length > 0 ? merged.join(delimiter) : undefined;
}

/**
 * 生成环境变量捕获的起始标记符
 *
 * 格式为 `__REMICODE_ENV_<变量名>_START__`，用于从 Shell 输出中定位环境变量值。
 *
 * @param name - 环境变量名称
 * @returns 起始标记符字符串
 *
 * @private 此函数为内部实现细节，不应直接调用
 */
function envCaptureStart(name: string): string {
  return `__REMICODE_ENV_${name}_START__`;
}

/**
 * 生成环境变量捕获的结束标记符
 *
 * 格式为 `__REMICODE_ENV_<变量名>_END__`，用于从 Shell 输出中定位环境变量值。
 *
 * @param name - 环境变量名称
 * @returns 结束标记符字符串
 *
 * @private 此函数为内部实现细节，不应直接调用
 */
function envCaptureEnd(name: string): string {
  return `__REMICODE_ENV_${name}_END__`;
}

/**
 * 构建环境变量捕获命令
 *
 * 为每个指定的环境变量生成 Shell 命令，使用 `printf` 输出标记符，
 * 使用 `printenv` 输出环境变量值。所有命令用分号连接。
 *
 * 生成的命令格式：
 * ```sh
 * printf '%s\n' '__REMICODE_ENV_PATH_START__'; printenv PATH || true; printf '%s\n' '__REMICODE_ENV_PATH_END__'
 * ```
 *
 * @param names - 要捕获的环境变量名称数组
 * @returns 完整的 Shell 命令字符串
 * @throws {Error} 当环境变量名称包含非法字符时抛出异常
 *
 * @private 此函数为内部实现细节，不应直接调用
 */
function buildEnvironmentCaptureCommand(names: ReadonlyArray<string>): string {
  return names
    .map((name) => {
      if (!SHELL_ENV_NAME_PATTERN.test(name)) {
        throw new Error(`Unsupported environment variable name: ${name}`);
      }

      return [
        `printf '%s\\n' '${envCaptureStart(name)}'`,
        `printenv ${name} || true`,
        `printf '%s\\n' '${envCaptureEnd(name)}'`,
      ].join("; ");
    })
    .join("; ");
}

/**
 * 从 Shell 输出中提取指定环境变量的值
 *
 * 使用标记符定位环境变量值在输出中的位置，并提取其内容。
 * 会自动去除值开头和结尾的换行符。
 *
 * @param output - Shell 命令的完整输出字符串
 * @param name - 要提取的环境变量名称
 * @returns 提取到的环境变量值，未找到或为空时返回 undefined
 *
 * @private 此函数为内部实现细节，不应直接调用
 */
function extractEnvironmentValue(output: string, name: string): string | undefined {
  const startMarker = envCaptureStart(name);
  const endMarker = envCaptureEnd(name);
  const startIndex = output.indexOf(startMarker);
  if (startIndex === -1) return undefined;

  const valueStartIndex = startIndex + startMarker.length;
  const endIndex = output.indexOf(endMarker, valueStartIndex);
  if (endIndex === -1) return undefined;

  let value = output.slice(valueStartIndex, endIndex);
  if (value.startsWith("\n")) {
    value = value.slice(1);
  }
  if (value.endsWith("\n")) {
    value = value.slice(0, -1);
  }

  return value.length > 0 ? value : undefined;
}

/**
 * Shell 环境变量读取器函数类型
 *
 * 定义从登录 Shell 读取环境变量的函数签名。
 *
 * @param shell - 要使用的 Shell 路径
 * @param names - 要读取的环境变量名称数组
 * @param execFile - 可选的 execFileSync 替代实现
 * @returns 包含环境变量键值对的部分记录对象
 */
export type ShellEnvironmentReader = (
  shell: string,
  names: ReadonlyArray<string>,
  execFile?: ExecFileSyncLike,
) => Partial<Record<string, string>>;

/**
 * 从登录 Shell 中读取指定的环境变量
 *
 * 通过启动交互式登录 Shell（`-ilc` 参数）执行环境变量捕获命令，
 * 从输出中提取指定环境变量的值。此方法确保加载用户的完整 Shell 配置
 * （如 `.zshrc`、`.bash_profile` 等），获取与终端一致的环境变量。
 *
 * 工作流程：
 * 1. 构建环境变量捕获命令（`buildEnvironmentCaptureCommand`）
 * 2. 使用 `shell -ilc <command>` 启动交互式登录 Shell
 * 3. 从输出中提取每个环境变量的值（`extractEnvironmentValue`）
 * 4. 返回包含所有成功读取的环境变量的对象
 *
 * 注意事项：
 * - 超时时间为 5 秒，防止 Shell 启动脚本卡死
 * - 使用 `printenv || true` 确保即使变量未定义也不会导致命令失败
 * - 仅支持大写字母、数字和下划线组成的环境变量名
 *
 * @param shell - 要使用的 Shell 路径（如 '/bin/zsh'、'/bin/bash'）
 * @param names - 要读取的环境变量名称数组（如 ['PATH', 'NODE_PATH']）
 * @param execFile - 可选的 execFileSync 替代实现，用于测试注入
 * @returns 包含环境变量键值对的部分记录对象，未读取到的变量不包含在内
 *
 * @throws {Error} 当环境变量名称包含非法字符时抛出异常
 * @throws 当 Shell 执行超时（5 秒）或失败时可能抛出异常
 *
 * @example
 * ```ts
 * const env = readEnvironmentFromLoginShell('/bin/zsh', ['PATH', 'NODE_PATH']);
 * console.log(env.PATH);       // '/usr/local/bin:/usr/bin:...'
 * console.log(env.NODE_PATH);  // '/usr/local/lib/node_modules'
 * ```
 */
export const readEnvironmentFromLoginShell: ShellEnvironmentReader = (
  shell,
  names,
  execFile = execFileSync,
) => {
  if (names.length === 0) {
    return {};
  }

  const output = execFile(shell, ["-ilc", buildEnvironmentCaptureCommand(names)], {
    encoding: "utf8",
    timeout: 5000,
  });

  const environment: Partial<Record<string, string>> = {};
  for (const name of names) {
    const value = extractEnvironmentValue(output, name);
    if (value !== undefined) {
      environment[name] = value;
    }
  }

  return environment;
};
