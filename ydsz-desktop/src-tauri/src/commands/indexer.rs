//! # 仓库语义检索命令模块
//!
//! 提供与代码索引和语义检索相关的 Tauri 命令，支持构建索引、
//! 搜索符号和全文本检索，以及 AST-Grep 结构化搜索 / Hashline 锚点编辑。
//!
//! ## 命令清单
//!
//! | 命令 | 说明 |
//! |------|------|
//! | `indexer_build` | 构建指定工作区的代码索引 |
//! | `indexer_search_symbols` | 搜索符号（函数/类/接口等） |
//! | `indexer_search_text` | 全文本搜索 |
//! | `indexer_ast_grep_search` | AST-Grep 结构化搜索（pattern / node-kind / preset） |
//! | `indexer_ast_grep_rewrite` | AST-Grep 结构化重写（pattern → rewrite template） |
//! | `indexer_hashline_annotate` | 为文件生成 hashline 标注 |
//! | `indexer_hashline_apply_edits` | 应用 hashline 锚点编辑（带 hash 校验） |
//! | `indexer_hashline_apply_block` | 应用 hashline 块替换 |
//!
//! ## 状态管理
//!
//! 索引服务通过 `IndexerState` 在应用生命周期内管理，构建后存储在状态中
//! 供后续查询使用。

use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::State;
use tracing::info;

use ydsz_code::indexer::{
    annotate_file as hashline_annotate_file, apply_and_write as hashline_apply_and_write,
    apply_block_edit as hashline_apply_block, apply_line_edits as hashline_apply_line_edits,
    compile_pattern as ast_grep_compile_pattern, find_calls_to_refs as ast_grep_find_calls_to,
    find_references_refs as ast_grep_find_references, rewrite_with_pattern,
    verify_line as hashline_verify_line, AnnotatedFile, BlockEdit as HashlineBlockEdit,
    CompiledPattern, EditResult as HashlineEditResult, LineEdit as HashlineLineEdit,
    MatchResult, RewriteResult,
};
use ydsz_code::indexer::{AstGrepSearcher, IndexerService, Preset, SearchResult, SymbolEntry};
use ydsz_code::indexer::Language;

/// 索引状态管理器
///
/// 持有当前已构建的索引服务实例，通过互斥锁保证线程安全。
pub struct IndexerState {
    /// 当前已构建的索引服务（构建后存储）
    service: Mutex<Option<IndexerService>>,
}

impl Default for IndexerState {
    fn default() -> Self {
        Self::new()
    }
}

impl IndexerState {
    /// 创建新的索引状态管理器
    pub fn new() -> Self {
        Self {
            service: Mutex::new(None),
        }
    }
}

/// AST-Grep 搜索模式
#[derive(Debug, Clone, Deserialize, specta::Type)]
#[serde(tag = "mode", rename_all = "snake_case")]
pub enum AstGrepSearchMode {
    /// 节点类型模式（`call_expression` / `try_statement` 等）
    NodeKind { kind: String },
    /// 用户友好的模式（含 meta-var 编译）
    Pattern { pattern: String },
    /// 调用特定函数（`name` / `obj.name`）
    CallsTo { name: String },
    /// 找所有引用
    References { name: String },
    /// 命名预设
    Preset { name: String },
}

/// AST-Grep 搜索请求
#[derive(Debug, Clone, Deserialize, specta::Type)]
pub struct AstGrepSearchRequest {
    pub workspace_root: String,
    #[serde(flatten)]
    pub mode: AstGrepSearchMode,
}

/// AST-Grep 编译结果（前端可预览）
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct AstGrepCompileResult {
    pub s_expression: String,
    pub captures: Vec<String>,
}

/// 构建代码索引
///
/// 遍历指定工作区根目录下的所有代码文件，提取函数/类/接口/类型等符号定义，
/// 构建内存倒排索引。构建后的索引存储在 IndexerState 中供后续查询使用。
///
/// # 参数
///
/// - `state`: 索引状态管理器
/// - `workspace_root`: 工作区根目录路径
///
/// # 返回值
///
/// - `Ok(usize)`: 构建成功，返回索引到的文件数量
/// - `Err(String)`: 构建失败
#[tauri::command]
#[specta::specta]
pub async fn indexer_build(
    state: State<'_, IndexerState>,
    workspace_root: String,
) -> Result<usize, String> {
    info!(workspace_root = %workspace_root, "构建代码索引");

    let service = IndexerService::new(PathBuf::from(&workspace_root));
    let stats = service.build().await.map_err(|e| e.to_string())?;
    let count = stats.ast_files + stats.regex_files + stats.fallback_files;

    let mut guard = state
        .service
        .lock()
        .map_err(|e| format!("索引状态锁获取失败: {e}"))?;
    *guard = Some(service);

    Ok(count)
}

/// 搜索符号
///
/// 在已构建的索引中搜索匹配的符号定义（函数/类/接口/类型等）。
///
/// # 参数
///
/// - `state`: 索引状态管理器
/// - `query`: 搜索查询字符串
///
/// # 返回值
///
/// - `Ok(Vec<SymbolEntry>)`: 搜索成功，返回匹配的符号列表
/// - `Err(String)`: 搜索失败（未构建索引或查询失败）
#[tauri::command]
#[specta::specta]
pub async fn indexer_search_symbols(
    state: State<'_, IndexerState>,
    query: String,
) -> Result<Vec<SymbolEntry>, String> {
    info!(query = %query, "搜索符号");

    let guard = state
        .service
        .lock()
        .map_err(|e| format!("索引状态锁获取失败: {e}"))?;

    let service = guard
        .as_ref()
        .ok_or_else(|| "索引未构建，请先调用 indexer_build".to_string())?;

    Ok(service.search(&query))
}

/// 全文本搜索
///
/// 在工作区中进行全文本搜索（基于 walkdir + 字符串匹配）。
///
/// # 参数
///
/// - `state`: 索引状态管理器
/// - `query`: 搜索查询字符串
///
/// # 返回值
///
/// - `Ok(Vec<SearchResult>)`: 搜索成功，返回匹配结果列表
/// - `Err(String)`: 搜索失败（未构建索引或查询失败）
#[tauri::command]
#[specta::specta]
pub async fn indexer_search_text(
    state: State<'_, IndexerState>,
    query: String,
) -> Result<Vec<SearchResult>, String> {
    info!(query = %query, "全文本搜索");

    let guard = state
        .service
        .lock()
        .map_err(|e| format!("索引状态锁获取失败: {e}"))?;

    let service = guard
        .as_ref()
        .ok_or_else(|| "索引未构建，请先调用 indexer_build".to_string())?;

    service.search_text(&query).map_err(|e| e.to_string())
}

// ========== AST-Grep + Hashline 扩展（W2-P1 补完） ==========

/// 把 Preset 名（snake_case）解析为枚举
fn parse_preset(name: &str) -> Option<Preset> {
    match name {
        "console_log" => Some(Preset::ConsoleLog),
        "console_error" => Some(Preset::ConsoleError),
        "await_fetch" => Some(Preset::AwaitFetch),
        "try_catch" => Some(Preset::TryCatch),
        "todo_comment" => Some(Preset::TodoComment),
        "rust_unwrap" => Some(Preset::RustUnwrap),
        "rust_expect" => Some(Preset::RustExpect),
        "py_print" => Some(Preset::PyPrint),
        "py_except" => Some(Preset::PyExcept),
        _ => None,
    }
}

/// AST-Grep 结构化搜索
///
/// 5 种模式：
/// - `node_kind`: 按节点类型搜索（如 `"call_expression"` / `"try_statement"`）
/// - `pattern`: 用户友好模式（自动编译为 S-expression，支持 `$NAME` / `$$$BODY`）
/// - `calls_to`: 找 `name(...)` 调用
/// - `references`: 找标识符所有出现位置
/// - `preset`: 命名预设（`console_log` / `rust_unwrap` / `py_print` 等）
#[tauri::command]
#[specta::specta]
pub async fn indexer_ast_grep_search(
    request: AstGrepSearchRequest,
) -> Result<Vec<MatchResult>, String> {
    info!(?request.mode, "AST-Grep 搜索");
    let searcher = AstGrepSearcher::new(PathBuf::from(&request.workspace_root));
    match request.mode {
        AstGrepSearchMode::NodeKind { kind } => searcher
            .find_by_node_kind(&kind)
            .map_err(|e| e.to_string()),
        AstGrepSearchMode::Pattern { pattern } => {
            // 自动探测语言：优先用 TS 模式（因为 TS 同时覆盖 JS/TS/TSX）
            // 更精细的方式：传 language 字段；这里先用 TS 兜底
            let lang = Language::TypeScript;
            let compiled = ast_grep_compile_pattern(&pattern, lang)
                .map_err(|e| e.to_string())?;
            searcher
                .find_by_query(lang, &compiled.query)
                .map_err(|e| e.to_string())
        }
        AstGrepSearchMode::CallsTo { name } => ast_grep_find_calls_to(
            &PathBuf::from(&request.workspace_root),
            &name,
        )
        .map_err(|e| e.to_string()),
        AstGrepSearchMode::References { name } => ast_grep_find_references(
            &PathBuf::from(&request.workspace_root),
            &name,
        )
        .map_err(|e| e.to_string()),
        AstGrepSearchMode::Preset { name } => {
            let preset = parse_preset(&name)
                .ok_or_else(|| format!("未知 preset: {name}"))?;
            let lang = *preset
                .supported_languages()
                .first()
                .ok_or_else(|| format!("preset {name} 无支持语言"))?;
            let query = preset
                .query_for(lang)
                .ok_or_else(|| format!("preset {name} 在 {lang:?} 下无 query"))?;
            searcher
                .find_by_query(lang, &query)
                .map_err(|e| e.to_string())
        }
    }
}

/// AST-Grep 结构化重写
///
/// 在单个文件内执行"模式 → 替换模板"批量重写。
/// 模板中的 `$NAME` / `$$$BODY` 会从原匹配节点的 capture 中取值。
#[tauri::command]
#[specta::specta]
pub async fn indexer_ast_grep_rewrite(
    file_path: String,
    pattern: String,
    rewrite: String,
    language: String,
) -> Result<RewriteResult, String> {
    info!(file = %file_path, pattern = %pattern, "AST-Grep 重写");
    let lang = match language.as_str() {
        "typescript" | "ts" | "tsx" => Language::TypeScript,
        "javascript" | "js" | "jsx" => Language::JavaScript,
        "rust" | "rs" => Language::Rust,
        "python" | "py" => Language::Python,
        other => return Err(format!("不支持的语言: {other}")),
    };
    let source = std::fs::read_to_string(&file_path).map_err(|e| e.to_string())?;
    rewrite_with_pattern(&source, lang, &pattern, &rewrite).map_err(|e| e.to_string())
}

/// 把用户模式编译为 S-expression（前端可预览）
#[tauri::command]
#[specta::specta]
pub async fn indexer_ast_grep_compile(
    pattern: String,
    language: String,
) -> Result<AstGrepCompileResult, String> {
    let lang = match language.as_str() {
        "typescript" | "ts" | "tsx" => Language::TypeScript,
        "javascript" | "js" | "jsx" => Language::JavaScript,
        "rust" | "rs" => Language::Rust,
        "python" | "py" => Language::Python,
        other => return Err(format!("不支持的语言: {other}")),
    };
    let compiled: CompiledPattern =
        ast_grep_compile_pattern(&pattern, lang).map_err(|e| e.to_string())?;
    Ok(AstGrepCompileResult {
        s_expression: compiled.query,
        captures: compiled.captures,
    })
}

/// Hashline 标注：把文件每行加 `lineNo#hash|text` 标注
///
/// 返回完整标注文件，前端可直接渲染为"AI 可读代码视图"。
#[tauri::command]
#[specta::specta]
pub async fn indexer_hashline_annotate(file_path: String) -> Result<AnnotatedFile, String> {
    info!(file = %file_path, "Hashline 标注");
    hashline_annotate_file(&PathBuf::from(file_path)).map_err(|e| e.to_string())
}

/// Hashline 单行编辑：原子地应用一组 `LineEdit`（带 hash 校验）
#[tauri::command]
#[specta::specta]
pub async fn indexer_hashline_apply_edits(
    file_path: String,
    annotated: AnnotatedFile,
    edits: Vec<HashlineLineEdit>,
    write_to_disk: bool,
) -> Result<HashlineEditResult, String> {
    info!(file = %file_path, edits = edits.len(), "Hashline 应用编辑");
    if write_to_disk {
        hashline_apply_and_write(&PathBuf::from(&file_path), &annotated, &edits)
            .map_err(|e| e.to_string())
    } else {
        hashline_apply_line_edits(&annotated, &edits).map_err(|e| e.to_string())
    }
}

/// Hashline 块替换
#[tauri::command]
#[specta::specta]
pub async fn indexer_hashline_apply_block(
    annotated: AnnotatedFile,
    edit: HashlineBlockEdit,
) -> Result<HashlineEditResult, String> {
    info!("Hashline 块替换");
    hashline_apply_block(&annotated, &edit).map_err(|e| e.to_string())
}

/// Hashline 单点校验：给定 `line#hash` 是否仍匹配
#[tauri::command]
#[specta::specta]
pub async fn indexer_hashline_verify(
    annotated: AnnotatedFile,
    anchor: String,
) -> Result<bool, String> {
    hashline_verify_line(&annotated, &anchor).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::Arc;

    fn make_workspace() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ydsz-indexer-test-{}", uuid::Uuid::new_v4()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        // 写一个最小 Rust 文件，让 IndexerService 能解析
        fs::write(
            dir.join("lib.rs"),
            r#"
pub fn hello() -> &'static str { "hi" }

pub struct Greeter { name: String }
impl Greeter {
    pub fn greet(&self) -> String { format!("Hello, {}", self.name) }
}
"#,
        )
        .unwrap();
        dir
    }

    #[test]
    fn new_indexer_state_is_empty() {
        let state = IndexerState::new();
        let guard = state.service.lock().unwrap();
        assert!(guard.is_none());
    }

    #[test]
    fn default_trait_works() {
        // 互联网大厂基线：构造器不依赖任何参数，Default 必须可用
        let state = IndexerState::default();
        let guard = state.service.lock().unwrap();
        assert!(guard.is_none());
    }

    #[tokio::test(flavor = "current_thread")]
    async fn service_builds_and_finds_symbols() {
        // 直接调用底层 IndexerService 验证服务逻辑
        // （不通过 Tauri State，仅验证业务能力）
        let dir = make_workspace();
        let mut service = IndexerService::new(dir);
        let count = service.build().await.expect("build ok");
        assert!(count.ast_files + count.regex_files > 0, "应索引到至少一个符号");
        let symbols = service.search("hello");
        assert!(!symbols.is_empty(), "应能找到 hello 符号");
    }

    #[test]
    fn concurrent_state_lock_safe() {
        // 互联网大厂基线：多线程并发访问不应 panic
        let state = Arc::new(IndexerState::new());
        let mut handles = vec![];
        for _ in 0..8 {
            let state = state.clone();
            handles.push(std::thread::spawn(move || {
                let g = state.service.lock().unwrap();
                assert!(g.is_none());
            }));
        }
        for h in handles {
            h.join().unwrap();
        }
    }
}
