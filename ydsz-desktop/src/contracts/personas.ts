// MBTI 人格模板契约（G12-P2）：与 ydsz-core/src/persona.rs 对齐。
//
// 后端单源：ydsz-core/src/persona.rs
// Tauri 命令：ydsz-desktop/src-tauri/src/commands/personas.rs

import { invoke } from "@tauri-apps/api/core";

/** MBTI 人格模板 */
export interface PersonaTemplate {
  /** MBTI 类型标识，如 "ENFJ"、"INTP" */
  id: string;
  /** 中文名称，如 "主人公"、"逻辑学家" */
  name: string;
  /** MBTI 类型（与 id 相同） */
  mbtiType: string;
  /** 性格描述 */
  description: string;
  /** 追加到系统提示词的内容 */
  systemPromptSuffix: string;
  /** 代表性 emoji */
  avatarEmoji: string;
  /** 主题色（hex） */
  color: string;
}

/** 列出全部 16 种 MBTI 人格模板 */
export function presetPersonasList(): Promise<PersonaTemplate[]> {
  return invoke<PersonaTemplate[]>("preset_personas_list");
}

/** 根据 MBTI ID 获取单个人格模板 */
export function presetPersonasGet(id: string): Promise<PersonaTemplate | null> {
  return invoke<PersonaTemplate | null>("preset_personas_get", { id });
}
