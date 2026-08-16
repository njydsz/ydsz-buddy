//! # Skill 命令模块
//!
//! 暴露 Skill 能力给前端：
//!
//! | 命令 | 说明 |
//! |------|------|
//! | `skill_list` | 列出已安装 skill |
//! | `skill_get` | 按名查询已安装 skill |
//! | `skill_install` | 安装（local/github/marketplace URI） |
//! | `skill_uninstall` | 卸载 |
//! | `skill_search_marketplace` | 搜索市场索引 |
//! | `skill_marketplace_lookup` | 查 marketplace 单条 |
//! | `skill_marketplace_refresh` | 重新加载 marketplace 索引 |
//! | `skill_validate_deps` | 校验已安装 skill 的依赖完整性 |
//! | `skill_load_body` | 加载 skill 的 prompt body（注入到 LLM 上下文） |
//!
//! ## 状态
//!
//! 通过 `SkillState` 在应用生命周期内管理注册表实例。

use std::path::PathBuf;
use std::sync::Mutex;

use serde::Serialize;
use tauri::State;
use tracing::info;

use ydsz_code::skills::{
    parse_skill_md_file, InstalledSkill, Marketplace, MarketplaceEntry, SkillError,
    SkillInstaller, SkillRegistry, SkillSource, MARKETPLACE_INDEX,
};

/// Skill 状态
pub struct SkillState {
    /// 已安装 skill 注册表
    registry: Mutex<Option<SkillRegistry>>,
    /// Marketplace 索引（启动时加载内置，可被远端覆盖）
    marketplace: Mutex<Marketplace>,
    /// 注册表根目录（由前端传入，默认 `~/.ydsz/skills/`）
    root: Mutex<PathBuf>,
}

impl Default for SkillState {
    fn default() -> Self {
        Self::new()
    }
}

impl SkillState {
    pub fn new() -> Self {
        // 默认根：~/.ydsz/skills
        let default_root = dirs_skills_root();
        let mp = Marketplace::from_json(MARKETPLACE_INDEX).unwrap_or_default();
        Self {
            registry: Mutex::new(None),
            marketplace: Mutex::new(mp),
            root: Mutex::new(default_root),
        }
    }
}

/// 推导 `~/.ydsz/skills/`
fn dirs_skills_root() -> PathBuf {
    if let Some(home) = std::env::var_os("HOME") {
        return PathBuf::from(home).join(".ydsz").join("skills");
    }
    if let Some(userprofile) = std::env::var_os("USERPROFILE") {
        return PathBuf::from(userprofile).join(".ydsz").join("skills");
    }
    PathBuf::from(".ydsz/skills")
}

/// 用 mutex guard 获取注册表
fn with_registry<F, R>(state: &State<'_, SkillState>, f: F) -> Result<R, String>
where
    F: FnOnce(&SkillRegistry) -> Result<R, String>,
{
    let guard = state
        .registry
        .lock()
        .map_err(|e| format!("registry lock: {e}"))?;
    let registry = guard
        .as_ref()
        .ok_or_else(|| "registry 未初始化，请先调用 skill_init".to_string())?;
    f(registry)
}

/// 初始化注册表（指定根目录）
#[tauri::command]
#[specta::specta]
pub async fn skill_init(
    state: State<'_, SkillState>,
    root: Option<String>,
) -> Result<String, String> {
    let root_path = root
        .map(PathBuf::from)
        .unwrap_or_else(dirs_skills_root);
    {
        let mut r = state.root.lock().map_err(|e| format!("lock: {e}"))?;
        *r = root_path.clone();
    }
    let registry = SkillRegistry::open(root_path.clone()).map_err(|e| e.to_string())?;
    {
        let mut g = state.registry.lock().map_err(|e| format!("lock: {e}"))?;
        *g = Some(registry);
    }
    info!(root = %root_path.display(), "SkillRegistry 初始化完成");
    Ok(root_path.to_string_lossy().to_string())
}

/// 列出已安装 skill
#[tauri::command]
#[specta::specta]
pub async fn skill_list(state: State<'_, SkillState>) -> Result<Vec<InstalledSkill>, String> {
    with_registry(&state, |r| Ok(r.list()))
}

/// 按名查询已安装 skill
#[tauri::command]
#[specta::specta]
pub async fn skill_get(
    state: State<'_, SkillState>,
    name: String,
) -> Result<Option<InstalledSkill>, String> {
    with_registry(&state, |r| Ok(r.get(&name)))
}

/// 安装 skill
#[tauri::command]
#[specta::specta]
pub async fn skill_install(
    state: State<'_, SkillState>,
    source_uri: String,
) -> Result<InstalledSkill, String> {
    info!(source = %source_uri, "安装 skill");
    let source = SkillSource::parse(&source_uri).map_err(|e| e.to_string())?;
    let mp = state
        .marketplace
        .lock()
        .map_err(|e| format!("marketplace lock: {e}"))?
        .clone();
    with_registry(&state, |registry| {
        let installer = SkillInstaller::new(registry).with_marketplace(&mp);
        installer
            .install(&source)
            .map_err(|e: SkillError| e.to_string())
    })
}

/// 卸载 skill
#[tauri::command]
#[specta::specta]
pub async fn skill_uninstall(
    state: State<'_, SkillState>,
    name: String,
) -> Result<(), String> {
    info!(name = %name, "卸载 skill");
    with_registry(&state, |registry| {
        SkillInstaller::new(registry)
            .uninstall(&name)
            .map_err(|e| e.to_string())
    })
}

/// 搜索 marketplace
#[tauri::command]
#[specta::specta]
pub async fn skill_search_marketplace(
    state: State<'_, SkillState>,
    query: String,
) -> Result<Vec<MarketplaceEntry>, String> {
    let mp = state
        .marketplace
        .lock()
        .map_err(|e| format!("marketplace lock: {e}"))?;
    Ok(mp.search(&query).into_iter().cloned().collect())
}

/// 查 marketplace 单条
#[tauri::command]
#[specta::specta]
pub async fn skill_marketplace_lookup(
    state: State<'_, SkillState>,
    slug: String,
) -> Result<Option<MarketplaceEntry>, String> {
    let mp = state
        .marketplace
        .lock()
        .map_err(|e| format!("marketplace lock: {e}"))?;
    Ok(mp.lookup(&slug).cloned())
}

/// 重新加载 marketplace（接受 JSON 字符串覆盖）
#[tauri::command]
#[specta::specta]
pub async fn skill_marketplace_refresh(
    state: State<'_, SkillState>,
    json: Option<String>,
) -> Result<usize, String> {
    let new_mp = match json {
        Some(s) => Marketplace::from_json(&s).map_err(|e| format!("JSON 解析失败: {e}"))?,
        None => Marketplace::from_json(MARKETPLACE_INDEX).map_err(|e| e.to_string())?,
    };
    let count = new_mp.skills.len();
    {
        let mut g = state
            .marketplace
            .lock()
            .map_err(|e| format!("marketplace lock: {e}"))?;
        *g = new_mp;
    }
    Ok(count)
}

/// 校验已安装 skill 的依赖完整性
#[tauri::command]
#[specta::specta]
pub async fn skill_validate_deps(state: State<'_, SkillState>) -> Result<Vec<String>, String> {
    with_registry(&state, |r| Ok(r.validate_dependencies()))
}

/// 加载 skill 的 prompt body（用于注入 LLM 上下文）
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct SkillBody {
    pub name: String,
    pub body: String,
    pub description: String,
    pub tags: Vec<String>,
}

/// 加载 skill 的 prompt body
#[tauri::command]
#[specta::specta]
pub async fn skill_load_body(
    state: State<'_, SkillState>,
    name: String,
) -> Result<Option<SkillBody>, String> {
    with_registry(&state, |registry| {
        let entry = registry.get(&name);
        let Some(entry) = entry else { return Ok(None) };
        let path = std::path::PathBuf::from(&entry.install_dir).join("SKILL.md");
        match parse_skill_md_file(&path) {
            Ok(manifest) => Ok(Some(SkillBody {
                name: manifest.name,
                body: manifest.body,
                description: manifest.description,
                tags: manifest.tags,
            })),
            Err(e) => Err(e.to_string()),
        }
    })
}
