// FILE: localSkillMode.ts
// Purpose: Derive a RuntimeMode (work/code) from a LocalUserSkillDescriptor so
//          the Skills view can group skills by mode. The mapping is local and
//          not in the wire schema — any unknown / future sources default to
//          "code" which is the historical default for CLI skills.
// Exports: skillRuntimeMode, labelForSkillRuntimeMode, colorClassForSkillRuntimeMode

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
