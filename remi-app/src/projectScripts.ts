/**
 * @file 项目脚本工具模块
 * @description 提供项目脚本的 ID 生成、命令映射、工作目录解析和环境变量构建等工具函数。
 */

import {
  MAX_SCRIPT_ID_LENGTH,
  SCRIPT_RUN_COMMAND_PATTERN,
  type KeybindingCommand,
  type ProjectScript,
} from "@remi-code/contracts";

/**
 * 归一化脚本 ID：转小写、替换非法字符为连字符、去除首尾连字符、截断至最大长度
 * @param value - 原始脚本名称
 * @returns 归一化后的脚本 ID
 */
function normalizeScriptId(value: string): string {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (cleaned.length === 0) {
    return "script";
  }
  if (cleaned.length <= MAX_SCRIPT_ID_LENGTH) {
    return cleaned;
  }
  return cleaned.slice(0, MAX_SCRIPT_ID_LENGTH).replace(/-+$/g, "") || "script";
}

/**
 * 根据脚本 ID 生成快捷键命令标识
 * @param scriptId - 脚本 ID
 * @returns 快捷键命令
 */
export const commandForProjectScript = (scriptId: string): KeybindingCommand =>
  SCRIPT_RUN_COMMAND_PATTERN.makeUnsafe(`script.${scriptId}.run`);

/**
 * 从快捷键命令中提取脚本 ID
 * @param command - 快捷键命令字符串
 * @returns 脚本 ID，非脚本命令返回 null
 */
export function projectScriptIdFromCommand(command: string): string | null {
  const trimmed = command.trim();
  if (!SCRIPT_RUN_COMMAND_PATTERN.is(trimmed)) {
    return null;
  }
  const [prefix, , suffix] = SCRIPT_RUN_COMMAND_PATTERN.parts;
  return trimmed.slice(prefix.literal.length, -suffix.literal.length);
}

/**
 * 生成下一个可用的项目脚本 ID
 * 基于脚本名称生成 ID，若已存在则添加数字后缀，直到找到可用 ID
 * @param name - 脚本名称
 * @param existingIds - 已存在的脚本 ID 集合
 * @returns 唯一的脚本 ID
 */
export function nextProjectScriptId(name: string, existingIds: Iterable<string>): string {
  const taken = new Set(Array.from(existingIds));
  const baseId = normalizeScriptId(name);
  if (!taken.has(baseId)) return baseId;

  let suffix = 2;
  while (suffix < 10_000) {
    const candidate = `${baseId}-${suffix}`;
    const safeCandidate =
      candidate.length <= MAX_SCRIPT_ID_LENGTH
        ? candidate
        : `${baseId.slice(0, Math.max(1, MAX_SCRIPT_ID_LENGTH - String(suffix).length - 1))}-${suffix}`;
    if (!taken.has(safeCandidate)) {
      return safeCandidate;
    }
    suffix += 1;
  }

  // 兜底方案：仅在数千个后缀都耗尽时触发
  return `${baseId}-${Date.now()}`.slice(0, MAX_SCRIPT_ID_LENGTH);
}

/**
 * 项目脚本运行时环境变量输入
 * @property project.cwd - 项目根目录
 * @property worktreePath - 工作树路径（可选）
 * @property extraEnv - 额外环境变量（可选）
 */
interface ProjectScriptRuntimeEnvInput {
  project: {
    cwd: string;
  };
  worktreePath?: string | null;
  extraEnv?: Record<string, string>;
}

/**
 * 解析项目脚本的工作目录
 * 优先使用工作树路径，否则使用项目根目录
 * @param input - 包含项目和工作树路径的输入
 * @returns 脚本运行的工作目录
 */
export function projectScriptCwd(input: {
  project: {
    cwd: string;
  };
  worktreePath?: string | null;
}): string {
  return input.worktreePath ?? input.project.cwd;
}

/**
 * 构建项目脚本的运行时环境变量
 * 包含项目根目录、工作树路径等标准变量，可与额外环境变量合并
 * @param input - 运行时环境变量输入
 * @returns 环境变量键值对
 */
export function projectScriptRuntimeEnv(
  input: ProjectScriptRuntimeEnvInput,
): Record<string, string> {
  const env: Record<string, string> = {
    REMICODE_PROJECT_ROOT: input.project.cwd,
  };
  if (input.worktreePath) {
    env.REMICODE_WORKTREE_PATH = input.worktreePath;
  }
  if (input.extraEnv) {
    return { ...env, ...input.extraEnv };
  }
  return env;
}

/**
 * 获取主要的项目脚本（非工作树创建时运行的脚本）
 * 优先返回第一个非 runOnWorktreeCreate 的脚本
 * @param scripts - 项目脚本列表
 * @returns 主要脚本，无匹配时返回第一个脚本或 null
 */
export function primaryProjectScript(scripts: ProjectScript[]): ProjectScript | null {
  const regular = scripts.find((script) => !script.runOnWorktreeCreate);
  return regular ?? scripts[0] ?? null;
}

/**
 * 获取工作树创建时的设置脚本
 * @param scripts - 项目脚本列表
 * @returns 设置脚本，无匹配时返回 null
 */
export function setupProjectScript(scripts: ProjectScript[]): ProjectScript | null {
  return scripts.find((script) => script.runOnWorktreeCreate) ?? null;
}
