/**
 * @file 本地技能运行模式模块
 * @description 从 LocalUserSkillDescriptor 派生 RuntimeMode（work/code），
 *              使技能视图可以按模式对技能进行分组。映射关系是本地的，不在 wire schema 中——
 *              任何未知/未来的来源默认回退到 "code"，这是 CLI 技能的历史默认值。
 */

import type { LocalUserSkillDescriptor, LocalUserSkillSource, RuntimeMode } from "~/contracts";

const SOURCE_TO_RUNTIME_MODE: Record<LocalUserSkillSource, RuntimeMode> = {
  // 既有 CLI Provider skills 视为 Code 域。
  claude: "code",
  codex: "code",
  openclaw: "code",
  // 通用 agents / 未知来源视为 Work 域（Office / 调度 / 浏览器等）。
  agents: "work",
  unknown: "code",
};

export function skillRuntimeMode(
  source: LocalUserSkillSource | string,
): RuntimeMode {
  if (source in SOURCE_TO_RUNTIME_MODE) {
    return SOURCE_TO_RUNTIME_MODE[source as LocalUserSkillSource];
  }
  return "code";
}

export function skillRuntimeModeFor(
  skill: Pick<LocalUserSkillDescriptor, "source">,
): RuntimeMode {
  return skillRuntimeMode(skill.source);
}

export function labelForSkillRuntimeMode(mode: RuntimeMode): string {
  return mode === "work" ? "Work" : "Code";
}

export function colorClassForSkillRuntimeMode(mode: RuntimeMode): string {
  return mode === "work"
    ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
    : "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300";
}
