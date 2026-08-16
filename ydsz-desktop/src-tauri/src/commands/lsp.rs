//! # LSP 集成命令模块
//!
//! 提供与 Language Server Protocol 相关的 Tauri 命令，支持启动语言服务器、
//! 文本同步通知、跳转定义、查找引用、悬浮提示、重命名、补全和诊断查询。
//!
//! ## 命令清单
//!
//! | 命令 | 说明 |
//! |------|------|
//! | `lsp_start_server` | 启动指定语言的 LSP 服务器 |
//! | `lsp_goto_definition` | 跳转到定义 |
//! | `lsp_references` | 查找引用 |
//! | `lsp_hover` | 悬浮提示 |
//! | `lsp_rename` | 重命名符号 |
//! | `lsp_completion` | 代码补全 |
//! | `lsp_code_action` | 快速修复 / 重构建议 |
//! | `lsp_signature_help` | 函数参数提示 |
//! | `lsp_formatting` | 代码格式化 |
//! | `lsp_diagnostics` | 获取文件诊断 |
//! | `lsp_did_open` | 通知服务器打开文件 |
//! | `lsp_did_change` | 通知服务器文件内容变更 |
//! | `lsp_did_save` | 通知服务器文件已保存 |
//! | `lsp_list_presets` | 列出可用语言预设 |
//!
//! ## 状态管理
//!
//! LSP 客户端通过 `LspState` 在应用生命周期内管理，启动后存储在状态中
//! 供后续查询使用。

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::State;
use tracing::info;

use crate::ServerState;
use ydsz_code::lsp::{LanguagePreset, LspClient, SshLspTransport};

/// LSP 状态管理器（多语言并发）
///
/// 持有当前活跃的 LSP 客户端实例集合，按语言标识（如 "typescript" / "python" /
/// "rust" / "go"）索引，支持多语言服务器同时运行。
pub struct LspState {
    /// 活跃的 LSP 客户端（language_id → 客户端）
    clients: tokio::sync::Mutex<HashMap<String, Arc<LspClient>>>,
}

impl LspState {
    /// 创建新的 LSP 状态管理器
    pub fn new() -> Self {
        Self {
            clients: tokio::sync::Mutex::new(HashMap::new()),
        }
    }
}

/// 预设语言服务器信息
///
/// 由 `lsp_list_presets` 命令返回,用于 Composer 中 `@lsp<query>` 触发器
/// 展示可启动 / 已启动的语言服务器列表.
///
/// `active=true` 表示当前 LspState 中已持有该语言的 LspClient;
/// `active=false` 表示仅作为可启动预设出现,选中后需要先调用
/// `lsp_start_server` 才能真正用于跳转定义等查询.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LspPresetInfo {
    /// 语言标识(例如 "typescript" / "python" / "rust" / "go")
    pub language: String,
    /// 显示名(例如 "TypeScript / JavaScript")
    pub display_name: String,
    /// 该预设关联的文件扩展名(用于在 Composer 描述中提示)
    pub file_extensions: Vec<String>,
    /// 是否已启动
    pub active: bool,
}

/// Code Action DTO(快速修复 / 重构建议)
///
/// 由 `lsp_code_action` 命令返回,承载 LSP 服务器给出的代码操作建议.
/// `lsp_types::CodeActionOrCommand` 可能是 `CodeAction` 或 `Command`,
/// 此 DTO 将两种形态归一化为统一结构,前端按 `command` / `edit` 判断执行方式.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CodeActionDto {
    /// 标题(用于菜单显示)
    pub title: String,
    /// 动作类型(如 "quickfix" / "refactor" / "source.organizeImports")
    pub kind: Option<String>,
    /// 待执行的编辑操作(WorkspaceEdit 的 JSON,包含 documentChanges 等)
    pub edit: Option<serde_json::Value>,
    /// 待执行的命令(Command 的 JSON,包含 command / arguments)
    pub command: Option<serde_json::Value>,
    /// 是否为首选 action(quickfix 场景下前端可高亮展示)
    pub is_preferred: Option<bool>,
    /// 禁用原因(如存在则该 action 不可执行,仅做展示)
    pub disabled_reason: Option<String>,
}

/// Signature Help DTO(函数参数提示)
///
/// 由 `lsp_signature_help` 命令返回,承载 LSP 服务器给出的函数签名信息.
/// `signatures` 为原始 JSON 以兼容 LSP 3.17 SignatureInformation 的复杂结构
/// (label / documentation / parameters 等),前端按需解析.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SignatureHelpDto {
    /// 可选签名列表(SignatureInformation[] 的 JSON)
    pub signatures: Vec<serde_json::Value>,
    /// 当前激活的签名索引
    pub active_signature: Option<u32>,
    /// 当前激活的参数索引
    pub active_parameter: Option<u32>,
}

/// TextEdit DTO(代码格式化编辑)
///
/// 由 `lsp_formatting` 命令返回,承载 LSP 服务器给出的格式化编辑序列.
/// 前端按 range 逐条应用 newText 即可完成全文格式化.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TextEditDto {
    /// 编辑范围
    pub range: RangeDto,
    /// 替换文本
    pub new_text: String,
}

/// Range DTO(文本范围)
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct RangeDto {
    /// 起始位置
    pub start: PositionDto,
    /// 结束位置
    pub end: PositionDto,
}

/// Position DTO(文本位置)
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct PositionDto {
    /// 行号(0-based)
    pub line: u32,
    /// 列号(0-based)
    pub character: u32,
}

/// 根据语言名称获取预置配置
fn preset_for_language(language: &str) -> Option<LanguagePreset> {
    match language.to_lowercase().as_str() {
        "typescript" | "ts" | "javascript" | "js" => Some(LanguagePreset::typescript()),
        "python" | "py" => Some(LanguagePreset::python()),
        "rust" | "rs" => Some(LanguagePreset::rust()),
        "go" | "golang" => Some(LanguagePreset::go()),
        "java" => Some(LanguagePreset::java()),
        "csharp" | "cs" | "c#" => Some(LanguagePreset::csharp()),
        "cpp" | "c++" | "c" => Some(LanguagePreset::cpp()),
        _ => None,
    }
}

/// 从文件路径推断语言标识
///
/// 使用 `LanguagePreset::detect_language` 根据文件扩展名匹配预置语言.
fn language_for_file(file_path: &str) -> Option<String> {
    let path = Path::new(file_path);
    LanguagePreset::detect_language(path).map(|p| p.language)
}

/// 从 LspState 获取指定语言的客户端
///
/// 短暂持锁获取 Arc 引用后立即释放,避免长时间持锁阻塞其他命令.
async fn get_client_for_language(
    state: &State<'_, LspState>,
    language: &str,
) -> Result<Arc<LspClient>, String> {
    let guard = state.clients.lock().await;
    guard
        .get(language)
        .cloned()
        .ok_or_else(|| format!("语言 {language} 的 LSP 服务器未启动，请先调用 lsp_start_server"))
}

/// 从 LspState 获取文件对应语言的客户端
///
/// 根据文件扩展名推断语言后查找客户端,实现多语言并发路由.
async fn get_client_for_file(
    state: &State<'_, LspState>,
    file_path: &str,
) -> Result<Arc<LspClient>, String> {
    let language = language_for_file(file_path)
        .ok_or_else(|| format!("无法识别文件语言: {file_path}"))?;
    get_client_for_language(state, &language).await
}

/// 启动 LSP 服务器
///
/// 根据语言名称启动对应的 LSP 服务器，并在指定工作区根目录下初始化。
/// 启动后的客户端存储在 LspState 中，供后续查询使用。
///
/// # 参数
///
/// - `state`: LSP 状态管理器
/// - `server`: 嵌入式 ServerState（SSH 模式下用于获取 SshConnectionPool）
/// - `language`: 语言名称（支持 typescript/python/rust/go/java/csharp/cpp）
/// - `workspace_root`: 工作区根目录路径
/// - `mode`: 工作区模式（`"local"` 默认 / `"ssh"` 远端开发）
/// - `connection_id`: SSH 连接 ID（`mode == "ssh"` 时必填）
///
/// # 返回值
///
/// - `Ok(())`: 启动成功
/// - `Err(String)`: 启动失败（不支持的语言或服务器启动失败）
#[tauri::command]
#[specta::specta]
pub async fn lsp_start_server(
    state: State<'_, LspState>,
    server: State<'_, ServerState>,
    language: String,
    workspace_root: String,
    mode: Option<String>,
    connection_id: Option<String>,
) -> Result<(), String> {
    let mode = mode.unwrap_or_else(|| "local".to_string());
    info!(language = %language, workspace_root = %workspace_root, mode = %mode, "启动 LSP 服务器");

    let preset = preset_for_language(&language)
        .ok_or_else(|| format!("不支持的语言: {language}"))?;

    let client = match mode.as_str() {
        "ssh" => {
            let conn_id = connection_id
                .ok_or_else(|| "SSH 模式需要 connection_id 参数".to_string())?;
            let conn = server
                .bootstrap_result
                .services
                .ssh_pool
                .get(&conn_id)
                .await
                .map_err(|e| format!("获取 SSH 连接失败: {e}"))?;
            let transport = SshLspTransport::spawn(conn.as_ref(), &preset)
                .await
                .map_err(|e| e.to_string())?;
            LspClient::start_with_transport(
                Box::new(transport),
                preset,
                PathBuf::from(&workspace_root),
            )
            .await
            .map_err(|e| e.to_string())?
        }
        _ => {
            // 本地模式：通过 LocalLspTransport spawn 本地语言服务器子进程
            LspClient::start(preset, PathBuf::from(&workspace_root))
                .await
                .map_err(|e| e.to_string())?
        }
    };

    let mut guard = state.clients.lock().await;
    guard.insert(language.clone(), Arc::new(client));

    Ok(())
}

/// 停止指定语言的 LSP 服务器
///
/// 发送 `shutdown` + `exit` 让服务器优雅退出,然后从 LspState 中移除.
/// 若该语言未启动则无操作返回.
///
/// # 参数
///
/// - `state`: LSP 状态管理器
/// - `language`: 语言名称（与 `lsp_start_server` 一致）
#[tauri::command]
#[specta::specta]
pub async fn lsp_stop_server(
    state: State<'_, LspState>,
    language: String,
) -> Result<(), String> {
    info!(language = %language, "停止 LSP 服务器");
    let client = {
        let mut guard = state.clients.lock().await;
        guard.remove(&language)
    };
    if let Some(client) = client {
        // Arc 引用计数降到 0 时 shutdown 生效
        if let Ok(arc) = Arc::try_unwrap(client) {
            let _ = arc.shutdown().await;
        }
    }
    Ok(())
}

/// 跳转到定义
///
/// 在当前活跃的 LSP 服务器中查询指定位置的跳转定义。
///
/// # 参数
///
/// - `state`: LSP 状态管理器
/// - `file_path`: 文件路径
/// - `line`: 行号（0-based）
/// - `character`: 列号（0-based）
///
/// # 返回值
///
/// - `Ok(serde_json::Value)`: 查询成功，返回 Location 列表的 JSON 表示
/// - `Err(String)`: 查询失败（未启动服务器或查询失败）
#[tauri::command]
#[specta::specta]
pub async fn lsp_goto_definition(
    state: State<'_, LspState>,
    file_path: String,
    line: u32,
    character: u32,
) -> Result<serde_json::Value, String> {
    info!(file_path = %file_path, line, character, "LSP 跳转定义");

    let client = get_client_for_file(&state, &file_path).await?;

    let locations = client
        .goto_definition(&file_path, line, character)
        .await
        .map_err(|e| e.to_string())?;

    serde_json::to_value(&locations).map_err(|e| e.to_string())
}

/// 查找引用
///
/// 在当前活跃的 LSP 服务器中查询指定位置的所有引用。
///
/// # 参数
///
/// - `state`: LSP 状态管理器
/// - `file_path`: 文件路径
/// - `line`: 行号（0-based）
/// - `character`: 列号（0-based）
/// - `include_declaration`: 是否包含定义位置
///
/// # 返回值
///
/// - `Ok(serde_json::Value)`: 查询成功，返回 Location 列表的 JSON 表示
/// - `Err(String)`: 查询失败
#[tauri::command]
#[specta::specta]
pub async fn lsp_references(
    state: State<'_, LspState>,
    file_path: String,
    line: u32,
    character: u32,
    include_declaration: bool,
) -> Result<serde_json::Value, String> {
    info!(file_path = %file_path, line, character, include_declaration, "LSP 查找引用");

    let client = get_client_for_file(&state, &file_path).await?;

    let locations = client
        .references(&file_path, line, character, include_declaration)
        .await
        .map_err(|e| e.to_string())?;

    serde_json::to_value(&locations).map_err(|e| e.to_string())
}

/// 悬浮提示
///
/// 在当前活跃的 LSP 服务器中查询指定位置的悬浮信息。
///
/// # 参数
///
/// - `state`: LSP 状态管理器
/// - `file_path`: 文件路径
/// - `line`: 行号（0-based）
/// - `character`: 列号（0-based）
///
/// # 返回值
///
/// - `Ok(Option<serde_json::Value>)`: 查询成功，返回 Hover 的 JSON（可能为 null）
/// - `Err(String)`: 查询失败
#[tauri::command]
#[specta::specta]
pub async fn lsp_hover(
    state: State<'_, LspState>,
    file_path: String,
    line: u32,
    character: u32,
) -> Result<Option<serde_json::Value>, String> {
    info!(file_path = %file_path, line, character, "LSP 悬浮提示");

    let client = get_client_for_file(&state, &file_path).await?;

    client
        .hover(&file_path, line, character)
        .await
        .map_err(|e| e.to_string())
}

/// 重命名符号
///
/// 在当前活跃的 LSP 服务器中重命名指定位置的符号。
///
/// # 参数
///
/// - `state`: LSP 状态管理器
/// - `file_path`: 文件路径
/// - `line`: 行号（0-based）
/// - `character`: 列号（0-based）
/// - `new_name`: 新符号名
///
/// # 返回值
///
/// - `Ok(Option<serde_json::Value>)`: 查询成功，返回 WorkspaceEdit 的 JSON（可能为 null）
/// - `Err(String)`: 查询失败
#[tauri::command]
#[specta::specta]
pub async fn lsp_rename(
    state: State<'_, LspState>,
    file_path: String,
    line: u32,
    character: u32,
    new_name: String,
) -> Result<Option<serde_json::Value>, String> {
    info!(file_path = %file_path, line, character, new_name = %new_name, "LSP 重命名");

    let client = get_client_for_file(&state, &file_path).await?;

    client
        .rename(&file_path, line, character, &new_name)
        .await
        .map_err(|e| e.to_string())
}

/// 代码补全
///
/// 在当前活跃的 LSP 服务器中获取指定位置的补全建议。
///
/// # 参数
///
/// - `state`: LSP 状态管理器
/// - `file_path`: 文件路径
/// - `line`: 行号（0-based）
/// - `character`: 列号（0-based）
///
/// # 返回值
///
/// - `Ok(Option<serde_json::Value>)`: 查询成功，返回 CompletionList 或 CompletionItem[] 的 JSON
/// - `Err(String)`: 查询失败
#[tauri::command]
#[specta::specta]
pub async fn lsp_completion(
    state: State<'_, LspState>,
    file_path: String,
    line: u32,
    character: u32,
) -> Result<Option<serde_json::Value>, String> {
    info!(file_path = %file_path, line, character, "LSP 代码补全");

    let client = get_client_for_file(&state, &file_path).await?;

    client
        .completion(&file_path, line, character)
        .await
        .map_err(|e| e.to_string())
}

/// 获取文件诊断
///
/// 返回指定文件当前缓存的诊断信息列表。诊断数据由 LSP 服务器通过
/// `textDocument/publishDiagnostics` 通知推送，客户端自动缓存。
///
/// # 参数
///
/// - `state`: LSP 状态管理器
/// - `file_path`: 文件路径
///
/// # 返回值
///
/// - `Ok(serde_json::Value)`: 诊断列表的 JSON 表示
/// - `Err(String)`: 查询失败
#[tauri::command]
#[specta::specta]
pub async fn lsp_diagnostics(
    state: State<'_, LspState>,
    file_path: String,
) -> Result<serde_json::Value, String> {
    info!(file_path = %file_path, "LSP 获取诊断");

    let client = get_client_for_file(&state, &file_path).await?;

    let diagnostics = client.diagnostics(&file_path);
    serde_json::to_value(&diagnostics).map_err(|e| e.to_string())
}

/// 通知 LSP 服务器打开文件
///
/// 编辑器打开文件后调用，服务器会基于内容做初始分析并下发 diagnostics。
///
/// # 参数
///
/// - `state`: LSP 状态管理器
/// - `file_path`: 文件路径
/// - `language_id`: 语言标识（如 "typescript"、"python"、"rust"、"go"）
/// - `text`: 文件全文内容
#[tauri::command]
#[specta::specta]
pub async fn lsp_did_open(
    state: State<'_, LspState>,
    file_path: String,
    language_id: String,
    text: String,
) -> Result<(), String> {
    info!(file_path = %file_path, language_id = %language_id, "LSP didOpen");

    let client = get_client_for_file(&state, &file_path).await?;

    client
        .did_open(&file_path, &language_id, &text)
        .await
        .map_err(|e| e.to_string())
}

/// 通知 LSP 服务器文件内容变更
///
/// 编辑器内容变更后调用，发送全文替换（syncKind = Full）。
/// 服务器会重新分析并下发新 diagnostics。
///
/// # 参数
///
/// - `state`: LSP 状态管理器
/// - `file_path`: 文件路径
/// - `version`: 文档版本号（递增）
/// - `text`: 文件最新全文内容
#[tauri::command]
#[specta::specta]
pub async fn lsp_did_change(
    state: State<'_, LspState>,
    file_path: String,
    version: u32,
    text: String,
) -> Result<(), String> {
    info!(file_path = %file_path, version, "LSP didChange");

    let client = get_client_for_file(&state, &file_path).await?;

    client
        .did_change(&file_path, version, &text)
        .await
        .map_err(|e| e.to_string())
}

/// 通知 LSP 服务器文件已保存
///
/// # 参数
///
/// - `state`: LSP 状态管理器
/// - `file_path`: 文件路径
/// - `text`: 保存时的文件全文内容（可选）
#[tauri::command]
#[specta::specta]
pub async fn lsp_did_save(
    state: State<'_, LspState>,
    file_path: String,
    text: Option<String>,
) -> Result<(), String> {
    info!(file_path = %file_path, "LSP didSave");

    let client = get_client_for_file(&state, &file_path).await?;

    client
        .did_save(&file_path, text.as_deref())
        .await
        .map_err(|e| e.to_string())
}

/// 列出所有可用的 LSP 语言预设
///
/// 返回 7 个内置预设(typescript / python / rust / go / java / csharp / cpp),每条记录带
/// `active` 标记当前是否已启动. 用于 Composer 中 `@lsp<query>` 触发器
/// 给用户展示可选语言服务器列表.
///
/// # 返回值
///
/// - `Ok(Vec<LspPresetInfo>)`: 预设列表(按 typescript → python → rust → go → java → csharp → cpp 顺序)
/// - `Err(String)`: 查询失败(目前不会发生,仅为符合 Tauri async command 规约)
#[tauri::command]
#[specta::specta]
pub async fn lsp_list_presets(state: State<'_, LspState>) -> Result<Vec<LspPresetInfo>, String> {
    // 读取当前已启动的语言集合(短暂持锁)
    let active_languages: Vec<String> = {
        let guard = state.clients.lock().await;
        guard.keys().cloned().collect()
    };

    let presets = [
        LanguagePreset::typescript(),
        LanguagePreset::python(),
        LanguagePreset::rust(),
        LanguagePreset::go(),
        LanguagePreset::java(),
        LanguagePreset::csharp(),
        LanguagePreset::cpp(),
    ];
    Ok(presets
        .into_iter()
        .map(|preset| LspPresetInfo {
            language: preset.language.clone(),
            display_name: preset_language_display_name(&preset.language).to_string(),
            file_extensions: preset.file_extensions.clone(),
            active: active_languages.iter().any(|l| l == &preset.language),
        })
        .collect())
}

/// 把语言标识翻译为 Composer 中显示的友好名称
fn preset_language_display_name(language: &str) -> &'static str {
    match language {
        "typescript" => "TypeScript / JavaScript",
        "python" => "Python",
        "rust" => "Rust",
        "go" => "Go",
        "java" => "Java",
        "csharp" => "C#",
        "cpp" => "C/C++",
        _ => "Unknown",
    }
}

// ==================== Code Action / Signature Help / Formatting ====================

/// 把 `lsp_types::CodeActionOrCommand` 归一化为 `CodeActionDto`
///
/// LSP 服务器可能返回 `Command` 或 `CodeAction` 两种形态:
/// - `CodeAction`: 直接提取 title / kind / edit / command / isPreferred / disabled
/// - `Command`: 没有 kind / edit 字段,把整个 Command 序列化到 `command` 字段
fn code_action_to_dto(action: lsp_types::CodeActionOrCommand) -> CodeActionDto {
    match action {
        lsp_types::CodeActionOrCommand::CodeAction(ca) => CodeActionDto {
            title: ca.title,
            kind: ca.kind.map(|k| k.as_str().to_string()),
            edit: ca.edit.map(|e| serde_json::to_value(e).unwrap_or_default()),
            command: ca.command.map(|c| serde_json::to_value(c).unwrap_or_default()),
            is_preferred: ca.is_preferred,
            disabled_reason: ca.disabled.map(|d| d.reason),
        },
        lsp_types::CodeActionOrCommand::Command(cmd) => CodeActionDto {
            title: cmd.title.clone(),
            kind: None,
            edit: None,
            command: Some(serde_json::to_value(cmd).unwrap_or_default()),
            is_preferred: None,
            disabled_reason: None,
        },
    }
}

/// 把 `lsp_types::SignatureHelp` 转换为 `SignatureHelpDto`
///
/// `signatures` 字段为 `SignatureInformation[]`,包含 label / documentation /
/// parameters 等复杂嵌套结构,直接序列化为 JSON 由前端按需解析.
fn signature_help_to_dto(help: lsp_types::SignatureHelp) -> SignatureHelpDto {
    SignatureHelpDto {
        signatures: help
            .signatures
            .into_iter()
            .map(|s| serde_json::to_value(s).unwrap_or_default())
            .collect(),
        active_signature: help.active_signature,
        active_parameter: help.active_parameter,
    }
}

/// 把 `lsp_types::TextEdit` 转换为 `TextEditDto`
fn text_edit_to_dto(edit: lsp_types::TextEdit) -> TextEditDto {
    TextEditDto {
        range: RangeDto {
            start: PositionDto {
                line: edit.range.start.line,
                character: edit.range.start.character,
            },
            end: PositionDto {
                line: edit.range.end.line,
                character: edit.range.end.character,
            },
        },
        new_text: edit.new_text,
    }
}

/// Code Action(快速修复 / 重构建议)
///
/// 在当前活跃的 LSP 服务器中查询指定选区范围内可用的代码操作.
/// 服务器返回的 `CodeAction` / `Command` 列表会归一化为 `CodeActionDto`,
/// 前端可按 `kind` 分类展示(如 quickfix / refactor),按 `edit` / `command` 执行.
///
/// # 参数
///
/// - `state`: LSP 状态管理器
/// - `file_path`: 文件路径
/// - `start_line` / `start_char`: 选区起始位置(0-based)
/// - `end_line` / `end_char`: 选区结束位置(0-based)
///
/// # 返回值
///
/// - `Ok(Vec<CodeActionDto>)`: 代码操作列表(无可用操作时为空向量)
/// - `Err(String)`: 查询失败(未启动服务器或请求失败)
#[tauri::command]
#[specta::specta]
pub async fn lsp_code_action(
    state: State<'_, LspState>,
    file_path: String,
    start_line: u32,
    start_char: u32,
    end_line: u32,
    end_char: u32,
) -> Result<Vec<CodeActionDto>, String> {
    info!(file_path = %file_path, start_line, start_char, end_line, end_char, "LSP Code Action");

    let client = get_client_for_file(&state, &file_path).await?;

    let actions = client
        .code_action(&file_path, start_line, start_char, end_line, end_char)
        .await
        .map_err(|e| e.to_string())?;

    Ok(actions.into_iter().map(code_action_to_dto).collect())
}

/// Signature Help(函数参数提示)
///
/// 在当前活跃的 LSP 服务器中查询指定位置的函数签名信息.
/// 通常在编辑器中用户输入 `(` 后触发,用于显示参数提示浮窗.
///
/// # 参数
///
/// - `state`: LSP 状态管理器
/// - `file_path`: 文件路径
/// - `line` / `character`: 光标位置(0-based)
///
/// # 返回值
///
/// - `Ok(Option<SignatureHelpDto>)`: 签名信息(无可用签名时为 None)
/// - `Err(String)`: 查询失败(未启动服务器或请求失败)
#[tauri::command]
#[specta::specta]
pub async fn lsp_signature_help(
    state: State<'_, LspState>,
    file_path: String,
    line: u32,
    character: u32,
) -> Result<Option<SignatureHelpDto>, String> {
    info!(file_path = %file_path, line, character, "LSP Signature Help");

    let client = get_client_for_file(&state, &file_path).await?;

    let help = client
        .signature_help(&file_path, line, character)
        .await
        .map_err(|e| e.to_string())?;

    Ok(help.map(signature_help_to_dto))
}

/// Formatting(代码格式化)
///
/// 在当前活跃的 LSP 服务器中对指定文件执行全文格式化.
/// 服务器返回 `TextEdit[]` 表示需要应用的文本编辑序列,
/// 前端按 range 逐条应用 newText 即可完成格式化.
///
/// # 参数
///
/// - `state`: LSP 状态管理器
/// - `file_path`: 文件路径
/// - `tab_size`: 缩进宽度(空格数,如 2 / 4)
/// - `insert_spaces`: `true` 使用空格缩进,`false` 使用 Tab
///
/// # 返回值
///
/// - `Ok(Vec<TextEditDto>)`: 格式化编辑列表(无需格式化时为空向量)
/// - `Err(String)`: 查询失败(未启动服务器或请求失败)
#[tauri::command]
#[specta::specta]
pub async fn lsp_formatting(
    state: State<'_, LspState>,
    file_path: String,
    tab_size: u32,
    insert_spaces: bool,
) -> Result<Vec<TextEditDto>, String> {
    info!(file_path = %file_path, tab_size, insert_spaces, "LSP Formatting");

    let client = get_client_for_file(&state, &file_path).await?;

    let edits = client
        .formatting(&file_path, tab_size, insert_spaces)
        .await
        .map_err(|e| e.to_string())?;

    Ok(edits.into_iter().map(text_edit_to_dto).collect())
}
