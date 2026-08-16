//! # Repo Wiki 命令模块
//!
//! 提供项目 Wiki 生成功能，支持 AST 解析和结构化知识沉淀。
//!
//! ## 命令清单
//!
//! | 命令 | 说明 |
//! |------|------|
//! | `repo_wiki_generate` | 生成项目 Wiki |
//! | `repo_wiki_generate_incremental` | 增量生成 Wiki |
//! | `repo_wiki_search` | 搜索 Wiki 条目 |
//! | `repo_wiki_list` | 列出所有 Wiki 条目 |
//! | `repo_wiki_stats` | 获取 Wiki 统计信息 |
//! | `repo_wiki_export` | 导出全量 Wiki 为单个 Markdown |
//! | `repo_wiki_outline` | 获取模块文档大纲 (TOC) |
//! | `repo_wiki_dependencies` | 获取模块依赖图 |
//!
//! ## 使用场景
//!
//! - Composer 中 `@wiki` 提及触发 Wiki 检索
//! - 项目级知识沉淀与检索
//! - AI 任务中按需调用项目文档

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tracing::info;

use ydsz_code::repo_wiki::{WikiGenerator, WikiService, WikiStats, OutlineNode};

/// Wiki 生成参数
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct WikiGenerateParams {
    /// 项目根目录
    pub root: String,
}

/// Wiki 生成结果
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct WikiGenerateResult {
    /// 生成的模块数量
    pub module_count: usize,
    /// Wiki 目录路径
    pub wiki_dir: String,
    /// 生成时间
    pub generated_at: String,
}

/// Wiki 搜索参数
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct WikiSearchParams {
    /// 项目根目录
    pub root: String,
    /// 搜索查询
    pub query: String,
}

/// Wiki 获取参数(按模块名)
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct WikiGetParams {
    /// 项目根目录
    pub root: String,
    /// 模块名
    pub module: String,
}

/// Wiki 条目（前端展示用）
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct WikiEntryDto {
    /// 模块名
    pub module: String,
    /// 标题
    pub title: String,
    /// 内容
    pub content: String,
    /// 符号列表
    pub symbols: Vec<String>,
    /// 更新时间
    pub updated_at: String,
}

/// Wiki 搜索结果
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct WikiSearchResult {
    /// 匹配的条目数量
    pub count: usize,
    /// 匹配的条目列表
    pub entries: Vec<WikiEntryDto>,
}

/// 生成项目 Wiki
///
/// 使用 AST 解析器解析项目代码，提取符号定义，
/// 按模块组织并生成 Markdown 文档。
///
/// # 参数
///
/// - `params`: 生成参数（项目根目录）
///
/// # 返回值
///
/// - `Ok(WikiGenerateResult)`: 生成成功，返回模块数量和 Wiki 目录
/// - `Err(String)`: 生成失败
#[tauri::command]
#[specta::specta]
pub async fn repo_wiki_generate(
    params: WikiGenerateParams,
) -> Result<WikiGenerateResult, String> {
    let root = PathBuf::from(&params.root);
    
    info!(root = %params.root, "开始生成项目 Wiki");
    
    let generator = WikiGenerator::new(root);
    let module_count = generator.generate()?;
    
    let wiki_dir = generator.wiki_service().wiki_dir().to_string_lossy().to_string();
    
    info!(module_count, wiki_dir = %wiki_dir, "项目 Wiki 生成完成");
    
    Ok(WikiGenerateResult {
        module_count,
        wiki_dir,
        generated_at: chrono::Utc::now().to_rfc3339(),
    })
}

/// 搜索 Wiki 条目
///
/// 在已生成的 Wiki 中搜索匹配的条目，
/// 支持模块名、标题、内容和符号名搜索。
///
/// # 参数
///
/// - `params`: 搜索参数（项目根目录、查询字符串）
///
/// # 返回值
///
/// - `Ok(WikiSearchResult)`: 搜索成功，返回匹配的条目列表
/// - `Err(String)`: 搜索失败
#[tauri::command]
#[specta::specta]
pub async fn repo_wiki_search(
    params: WikiSearchParams,
) -> Result<WikiSearchResult, String> {
    let root = PathBuf::from(&params.root);
    
    info!(root = %params.root, query = %params.query, "搜索 Wiki");
    
    let service = WikiService::new(root);
    service.load()?;
    
    let entries = service.search(&params.query);
    let count = entries.len();
    
    let dtos = entries
        .into_iter()
        .map(|e| WikiEntryDto {
            module: e.module,
            title: e.title,
            content: e.content,
            symbols: e.symbols,
            updated_at: e.updated_at.to_rfc3339(),
        })
        .collect();
    
    Ok(WikiSearchResult {
        count,
        entries: dtos,
    })
}

/// 列出所有 Wiki 条目
///
/// 加载并返回项目中的所有 Wiki 条目。
///
/// # 参数
///
/// - `params`: 参数（项目根目录）
///
/// # 返回值
///
/// - `Ok(WikiSearchResult)`: 成功，返回所有条目
/// - `Err(String)`: 失败
#[tauri::command]
#[specta::specta]
pub async fn repo_wiki_list(
    params: WikiGenerateParams,
) -> Result<WikiSearchResult, String> {
    let root = PathBuf::from(&params.root);
    
    info!(root = %params.root, "列出所有 Wiki 条目");
    
    let service = WikiService::new(root);
    let count = service.load()?;
    
    let entries = service.get_entries();
    
    let dtos = entries
        .into_iter()
        .map(|e| WikiEntryDto {
            module: e.module,
            title: e.title,
            content: e.content,
            symbols: e.symbols,
            updated_at: e.updated_at.to_rfc3339(),
        })
        .collect();
    
    Ok(WikiSearchResult {
        count,
        entries: dtos,
    })
}

/// 按模块名获取 Wiki 条目
///
/// 在已加载的 Wiki 中按模块名精确查找并返回单个条目。
/// 找不到时返回 `Ok(None)`,由前端决定如何降级。
///
/// # 参数
///
/// - `params`: 获取参数（项目根目录、模块名）
///
/// # 返回值
///
/// - `Ok(Some(WikiEntryDto))`: 找到对应条目
/// - `Ok(None)`: 未找到对应模块
/// - `Err(String)`: 加载失败
#[tauri::command]
#[specta::specta]
pub async fn repo_wiki_get(
    params: WikiGetParams,
) -> Result<Option<WikiEntryDto>, String> {
    let root = PathBuf::from(&params.root);

    info!(
        root = %params.root,
        module = %params.module,
        "按模块名获取 Wiki 条目"
    );

    let service = WikiService::new(root);
    service.load()?;

    let entry = service
        .get_by_module(&params.module)
        .map(|e| WikiEntryDto {
            module: e.module,
            title: e.title,
            content: e.content,
            symbols: e.symbols,
            updated_at: e.updated_at.to_rfc3339(),
        });

    Ok(entry)
}

/// Wiki 元数据状态
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct WikiStatusDto {
    /// Wiki 目录绝对路径
    pub wiki_dir: String,
    /// Wiki 是否存在(目录是否存在 .md 文件)
    pub exists: bool,
    /// 模块数量
    pub module_count: usize,
    /// 最后一次生成时间(从 index.json 读取;None 表示从未生成)
    pub last_generated_at: Option<String>,
}

/// 获取 Wiki 元数据(目录路径 + 最后生成时间)
///
/// 用于在 WikiView 顶部展示项目知识库的状态。
/// 当 Wiki 目录不存在或没有 .md 文件时返回 `exists: false`。
///
/// # 参数
///
/// - `params`: 参数(项目根目录)
///
/// # 返回值
///
/// - `Ok(WikiStatusDto)`: 状态查询成功
/// - `Err(String)`: 查询失败
#[tauri::command]
#[specta::specta]
pub async fn repo_wiki_status(
    params: WikiGenerateParams,
) -> Result<WikiStatusDto, String> {
    let root = PathBuf::from(&params.root);
    let service = WikiService::new(root);
    let wiki_dir = service.wiki_dir().to_string_lossy().to_string();

    // 尝试读取 .ydsz/wiki/.meta.json
    let meta_path = service.wiki_dir().join(".meta.json");
    let last_generated_at = std::fs::read_to_string(&meta_path)
        .ok()
        .and_then(|content| {
            serde_json::from_str::<serde_json::Value>(&content).ok()
        })
        .and_then(|v| {
            v.get("last_generated_at")
                .and_then(|t| t.as_str())
                .map(|s| s.to_string())
        });

    let count = service.load().unwrap_or(0);
    let exists = count > 0;

    Ok(WikiStatusDto {
        wiki_dir,
        exists,
        module_count: count,
        last_generated_at,
    })
}

// =========================================================================
// Wiki 2.0 新增命令
// =========================================================================

/// Wiki 统计信息 DTO
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct WikiStatsDto {
    /// 模块总数
    pub module_count: usize,
    /// 符号总数（去重后）
    pub total_symbols: usize,
    /// 每个模块的符号数 (module, count)
    pub symbols_per_module: Vec<(String, usize)>,
    /// 最近更新的模块 (module, ISO 时间)
    pub recently_updated: Vec<(String, String)>,
}

/// 文档大纲节点 DTO
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct OutlineNodeDto {
    /// 标题级别 (1-6)
    pub level: u8,
    /// 标题文本
    pub text: String,
    /// 锚点 ID
    pub anchor: String,
}

/// 依赖图 DTO
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct DependencyGraphDto {
    /// 模块 -> 被依赖的模块列表
    pub edges: Vec<(String, Vec<String>)>,
}

/// 获取 Wiki 统计信息
///
/// 返回模块数、符号数、每模块符号分布、最近更新模块。
#[tauri::command]
#[specta::specta]
pub async fn repo_wiki_stats(
    params: WikiGenerateParams,
) -> Result<WikiStatsDto, String> {
    let root = PathBuf::from(&params.root);
    info!(root = %params.root, "获取 Wiki 统计信息");

    let service = WikiService::new(root);
    service.load()?;

    let stats: WikiStats = service.get_stats();

    Ok(WikiStatsDto {
        module_count: stats.module_count,
        total_symbols: stats.total_symbols,
        symbols_per_module: stats.symbols_per_module,
        recently_updated: stats
            .recently_updated
            .into_iter()
            .map(|(m, t)| (m, t.to_rfc3339()))
            .collect(),
    })
}

/// 导出全量 Wiki 为单个 Markdown 文档
///
/// 将所有模块的 Wiki 内容合并为一个 Markdown 字符串返回。
#[tauri::command]
#[specta::specta]
pub async fn repo_wiki_export(
    params: WikiGenerateParams,
) -> Result<String, String> {
    let root = PathBuf::from(&params.root);
    info!(root = %params.root, "导出全量 Wiki");

    let service = WikiService::new(root);
    service.load()?;

    Ok(service.export_all())
}

/// 获取模块文档大纲 (TOC)
///
/// 从指定模块的 Markdown 内容提取标题层级，返回大纲节点列表。
#[tauri::command]
#[specta::specta]
pub async fn repo_wiki_outline(
    params: WikiGetParams,
) -> Result<Vec<OutlineNodeDto>, String> {
    let root = PathBuf::from(&params.root);
    info!(root = %params.root, module = %params.module, "获取 Wiki 文档大纲");

    let service = WikiService::new(root);
    service.load()?;

    let entry = service.get_by_module(&params.module);
    let outline: Vec<OutlineNode> = match entry {
        Some(e) => WikiService::get_outline(&e.module, &e.content),
        None => Vec::new(),
    };

    Ok(outline
        .into_iter()
        .map(|n| OutlineNodeDto {
            level: n.level,
            text: n.text,
            anchor: n.anchor,
        })
        .collect())
}

/// 获取模块依赖图
///
/// 返回模块间的依赖关系，用于可视化模块依赖结构。
#[tauri::command]
#[specta::specta]
pub async fn repo_wiki_dependencies(
    params: WikiGenerateParams,
) -> Result<DependencyGraphDto, String> {
    let root = PathBuf::from(&params.root);
    info!(root = %params.root, "获取模块依赖图");

    let generator = WikiGenerator::new(root);
    match generator.load_dependency_graph() {
        Ok(graph) => Ok(DependencyGraphDto {
            edges: graph.edges.into_iter().collect(),
        }),
        Err(_) => {
            // 依赖图不存在，返回空
            Ok(DependencyGraphDto { edges: Vec::new() })
        }
    }
}

/// 增量生成 Wiki
///
/// 基于文件 mtime 跳过未变文件，仅在有变化时重新生成。
/// 返回 0 表示跳过（无变化），>0 表示生成的模块数。
#[tauri::command]
#[specta::specta]
pub async fn repo_wiki_generate_incremental(
    params: WikiGenerateParams,
) -> Result<WikiGenerateResult, String> {
    let root = PathBuf::from(&params.root);
    info!(root = %params.root, "增量生成 Wiki");

    let generator = WikiGenerator::new(root);
    let module_count = generator.generate_incremental()?;

    let wiki_dir = generator.wiki_service().wiki_dir().to_string_lossy().to_string();

    info!(module_count, wiki_dir = %wiki_dir, "增量 Wiki 生成完成");

    Ok(WikiGenerateResult {
        module_count,
        wiki_dir,
        generated_at: chrono::Utc::now().to_rfc3339(),
    })
}
