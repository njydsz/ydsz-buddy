/**
 * @file Shell 环境工具模块
 *
 * 本模块提供安全探测 login-shell 环境值的辅助工具：
 *
 * - **Shell 候选解析**：通过 `listLoginShellCandidates` 获取候选 shell 列表
 * - **Shell 解析**：通过 `resolveLoginShell` 获取最优 shell 路径
 * - **环境变量读取**：从 login-shell 中读取 PATH 等环境变量
 * - **PATH 合并**：将多个 PATH 来源合并为去重有序的字符串
 *
 * ## 核心导出
 *
 * - `listLoginShellCandidates`：列出所有候选 login shell
 * - `resolveLoginShell`：解析最优 login shell 路径
 * - `readPathFromLoginShell`：从 login shell 读取 PATH 环境变量
 * - `readPathFromLaunchctl`：从 launchctl 读取 PATH（macOS）
 * - `mergePathEntries`：合并多个 PATH 条目
 * - `readEnvironmentFromLoginShell`：从 login shell 读取指定环境变量
 *
 * ## 使用场景
 *
 * - 跨平台 shell 环境检测
 * - 获取用户默认 shell 的 PATH
 * - macOS 上通过 launchctl 获取系统 PATH
 * - 环境变量采集用于子进程执行
 *
 * ## 注意事项
 *
 * - 所有操作均为同步阻塞，调用时注意性能
 * - 超时时间：login shell 读取 5000ms，launchctl 读取 2000ms
 * - 返回的环境变量可能包含特殊字符，已做 trim 处理
 */

import * as OS from "node:os";
import { execFileSync } from "node:child_process";

const PATH_CAPTURE_START = "__YDSZ_CLAW_PATH_START__";
const PATH_CAPTURE_END = "__YDSZ_BUDDY_PATH_END__";
const SHELL_ENV_NAME_PATTERN = /^[A-Z0-9_]+$/;

type ExecFileSyncLike = (
  file: string,
  args: ReadonlyArray<string>,
  options: { encoding: "utf8"; timeout: number },
) => string;

function trimNonEmpty(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function readUserLoginShell(): string | undefined {
  try {
    return trimNonEmpty(OS.userInfo().shell);
  } catch {
    return undefined;
  }
}

/**
 * 列出所有候选的 login shell 路径。
 *
 * 按照优先级顺序返回 shell 候选列表（去重）：
 * 1. 用户显式指定的 `shell` 参数
 * 2. 系统用户信息中的 login shell
 * 3. 平台默认 shell（macOS: `/bin/zsh`，Linux: `/bin/bash`）
 *
 * @param platform - 操作系统平台（如 `darwin`、`linux`、`win32`）
 * @param shell - 用户显式指定的 shell 路径
 * @param userShell - 系统用户信息中的 login shell（可选）
 * @returns 去重后的 shell 路径数组，按优先级排序
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
 * 解析最优的 login shell 路径。
 *
 * 返回候选列表中的第一个元素，即最高优先级的可用 shell。
 *
 * @param platform - 操作系统平台
 * @param shell - 用户显式指定的 shell 路径
 * @returns 最优 shell 路径，若无候选则返回 undefined
 * @see listLoginShellCandidates
 */
export function resolveLoginShell(
  platform: NodeJS.Platform,
  shell: string | undefined,
): string | undefined {
  return listLoginShellCandidates(platform, shell)[0];
}

/**
 * 从 shell 输出中提取 PATH 值。
 *
 * 输出格式需包含标记：`__YDSZ_CLAW_PATH_START__` 和 `__YDSZ_BUDDY_PATH_END__`。
 *
 * @param output - shell 命令的输出字符串
 * @returns 提取的 PATH 值，若未找到标记则返回 null
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
 * 从 login shell 读取 PATH 环境变量。
 *
 * 通过执行 `shell -ilc "printf ...; printenv PATH; printf ..."` 获取。
 *
 * @param shell - Login shell 路径（如 `/bin/zsh`）
 * @param execFile - 文件执行函数（默认为 `execFileSync`，用于测试注入）
 * @returns PATH 环境变量值，若读取失败则返回 undefined
 */
export function readPathFromLoginShell(
  shell: string,
  execFile: ExecFileSyncLike = execFileSync,
): string | undefined {
  return readEnvironmentFromLoginShell(shell, ["PATH"], execFile).PATH;
}

/**
 * 从 launchctl 读取 PATH 环境变量（macOS 专用）。
 *
 * 通过 `/bin/launchctl getenv PATH` 命令获取系统级 PATH。
 *
 * @param execFile - 文件执行函数（默认为 `execFileSync`，用于测试注入）
 * @returns PATH 环境变量值，若读取失败则返回 undefined
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
 * 合并多个 PATH 条目为去重有序字符串。
 *
 * Windows 上使用 `;` 作为分隔符，Unix 系统使用 `:`。
 * 合并时保持顺序，前面的 PATH 条目优先级更高。
 *
 * @param preferredPath - 优先使用的 PATH 字符串
 * @param inheritedPath - 继承的 PATH 字符串
 * @param platform - 操作系统平台
 * @returns 合并后的 PATH 字符串，若全部为空则返回 undefined
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

function envCaptureStart(name: string): string {
  return `__YDSZ_CLAW_ENV_${name}_START__`;
}

function envCaptureEnd(name: string): string {
  return `__YDSZ_CLAW_ENV_${name}_END__`;
}

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
 * 从 login shell 读取指定环境变量的函数类型。
 *
 * @param shell - Login shell 路径
 * @param names - 要读取的环境变量名数组
 * @param execFile - 可注入的文件执行函数（用于测试）
 * @returns 包含指定环境变量的部分字典
 */
export type ShellEnvironmentReader = (
  shell: string,
  names: ReadonlyArray<string>,
  execFile?: ExecFileSyncLike,
) => Partial<Record<string, string>>;

/**
 * 从 login shell 读取指定的环境变量。
 *
 * 通过执行 `shell -ilc <command>` 以 login shell 模式运行命令，
 * 并提取命令输出中标记的环境变量值。
 *
 * @param shell - Login shell 路径（如 `/bin/zsh`、`/bin/bash`）
 * @param names - 要读取的环境变量名数组
 * @param execFile - 文件执行函数（默认为 `execFileSync`，用于测试注入）
 * @returns 包含读取到的环境变量的对象
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
