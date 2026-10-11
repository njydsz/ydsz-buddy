//! # MBTI 人格模板 Tauri 命令（G12-P2）
//!
//! 提供 Agent 人格模板查询能力，让前端可以按照 MBTI 类型
//! 为 Agent 赋予特定的对话风格与性格特征。

use ydsz_core::persona::PersonaTemplate;

/// 列出全部 16 种内置 MBTI 人格模板
#[tauri::command]
#[specta::specta]
pub async fn preset_personas_list() -> Result<Vec<PersonaTemplate>, String> {
    Ok(PersonaTemplate::builtin_personas())
}

/// 根据 MBTI ID 获取单个人格模板
#[tauri::command]
#[specta::specta]
pub async fn preset_personas_get(id: String) -> Result<Option<PersonaTemplate>, String> {
    Ok(PersonaTemplate::find_by_id(&id))
}
