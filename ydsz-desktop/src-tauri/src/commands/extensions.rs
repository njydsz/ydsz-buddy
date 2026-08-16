//! # Extension 命令模块
//!
//! 暴露 Extension 扩展系统能力给前端：
//!
//! | 命令 | 说明 |
//! |------|------|
//! | `extension_init` | 初始化注册表（扫描 `~/.ydsz/extensions/`） |
//! | `extension_list` | 列出已安装扩展 |
//! | `extension_get` | 获取扩展详情（含完整 contributes） |
//! | `extension_activate` | 激活扩展 |
//! | `extension_deactivate` | 停用扩展 |
//! | `extension_uninstall` | 卸载扩展（删除目录 + 注销） |
//! | `extension_install_from_path` | 从本地路径安装 |
//! | `extension_install_from_github` | 从 GitHub 仓库安装 |
//! | `extension_list_commands` | 列出已激活扩展贡献的命令 |
//! | `extension_trigger_startup` | 触发 OnStartup 激活事件 |

use std::path::PathBuf;
use std::sync::Arc;

use serde::Serialize;
use tauri::State;
use tracing::{info, warn};

use ydsz_code::extensions::{
    ExtensionActivator, ExtensionLifecycle, ExtensionRegistry, ExtensionState,
};
use ydsz_code::extensions::manifest::{ExtensionContribution, ExtensionManifest};

// ── DTO ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct ExtensionDto {
    pub name: String,
    pub version: String,
    pub display_name: String,
    pub description: String,
    pub author: String,
    pub categories: Vec<String>,
    pub install_path: String,
    pub state: String,
    pub error: Option<String>,
    pub contributes_commands: usize,
    pub contributes_settings: usize,
    pub contributes_providers: usize,
    pub contributes_languages: usize,
}

impl From<ydsz_code::extensions::ExtensionEntry> for ExtensionDto {
    fn from(e: ydsz_code::extensions::ExtensionEntry) -> Self {
        Self {
            name: e.manifest.name.clone(),
            version: e.manifest.version.clone(),
            display_name: e.manifest.display_name.clone(),
            description: e.manifest.description.clone(),
            author: e.manifest.author.clone(),
            categories: e.manifest.categories.clone(),
            install_path: e.install_path.clone(),
            state: format!("{:?}", e.state).to_lowercase(),
            error: e.error.clone(),
            contributes_commands: e.manifest.contributes.commands.len(),
            contributes_settings: e.manifest.contributes.settings.len(),
            contributes_providers: e.manifest.contributes.providers.len(),
            contributes_languages: e.manifest.contributes.languages.len(),
        }
    }
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct ExtensionDetailDto {
    pub name: String,
    pub version: String,
    pub display_name: String,
    pub description: String,
    pub author: String,
    pub categories: Vec<String>,
    pub install_path: String,
    pub state: String,
    pub error: Option<String>,
    pub contributes: ExtensionContributionDto,
    pub extension_dependencies: Vec<String>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct ExtensionContributionDto {
    pub commands: Vec<CommandContributionDto>,
    pub settings: Vec<SettingContributionDto>,
    pub providers: Vec<ProviderContributionDto>,
    pub languages: Vec<LanguageContributionDto>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct CommandContributionDto {
    pub id: String,
    pub title: String,
    pub keybinding: Option<String>,
    pub icon: Option<String>,
    pub category: Option<String>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct SettingContributionDto {
    pub key: String,
    pub default: serde_json::Value,
    pub setting_type: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct ProviderContributionDto {
    pub display_name: String,
    pub protocol: String,
    pub default_model: String,
    pub models: Vec<String>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct LanguageContributionDto {
    pub id: String,
    pub extensions: Vec<String>,
    pub syntax_path: Option<String>,
}

impl From<ExtensionContribution> for ExtensionContributionDto {
    fn from(c: ExtensionContribution) -> Self {
        Self {
            commands: c.commands.into_iter().map(|cmd| CommandContributionDto {
                id: cmd.id,
                title: cmd.title,
                keybinding: cmd.keybinding,
                icon: cmd.icon,
                category: cmd.category,
            }).collect(),
            settings: c.settings.into_iter().map(|s| SettingContributionDto {
                key: s.key,
                default: s.default,
                setting_type: s.setting_type,
                description: s.description,
            }).collect(),
            providers: c.providers.into_iter().map(|p| ProviderContributionDto {
                display_name: p.display_name,
                protocol: p.protocol,
                default_model: p.default_model,
                models: p.models,
            }).collect(),
            languages: c.languages.into_iter().map(|l| LanguageContributionDto {
                id: l.id,
                extensions: l.extensions,
                syntax_path: l.syntax_path,
            }).collect(),
        }
    }
}

// ── State ───────────────────────────────────────────────────────────────────

/// Extension 应用级状态（Arc<ExtensionRegistry> 跨命令共享）
pub struct ExtState {
    registry: Arc<ExtensionRegistry>,
}

impl Default for ExtState {
    fn default() -> Self { Self::new() }
}

impl ExtState {
    pub fn new() -> Self {
        Self { registry: Arc::new(ExtensionRegistry::new()) }
    }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/// 推导 `~/.ydsz/extensions/`
fn dirs_extensions_root() -> PathBuf {
    if let Some(home) = std::env::var_os("HOME") {
        return PathBuf::from(home).join(".ydsz").join("extensions");
    }
    if let Some(userprofile) = std::env::var_os("USERPROFILE") {
        return PathBuf::from(userprofile).join(".ydsz").join("extensions");
    }
    PathBuf::from(".ydsz/extensions")
}

/// 递归复制目录
fn copy_dir_recursive(src: &PathBuf, dst: &PathBuf) -> std::io::Result<()> {
    if !dst.exists() { std::fs::create_dir_all(dst)?; }
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let path = entry.path();
        let dest_path = dst.join(entry.file_name());
        if path.is_dir() {
            copy_dir_recursive(&path, &dest_path)?;
        } else {
            std::fs::copy(&path, &dest_path)?;
        }
    }
    Ok(())
}

/// 扫描扩展目录，加载所有 extension.json
fn scan_extensions_dir(dir: &PathBuf, registry: &ExtensionRegistry) -> usize {
    if !dir.exists() { return 0; }
    let mut count = 0;
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(e) => { warn!(dir = %dir.display(), err = %e, "读取扩展目录失败"); return 0; }
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() { continue; }
        let manifest_path = path.join("extension.json");
        if !manifest_path.exists() { continue; }
        match std::fs::read_to_string(&manifest_path) {
            Ok(raw) => match serde_json::from_str::<ExtensionManifest>(&raw) {
                Ok(manifest) => {
                    let entry = ydsz_code::extensions::ExtensionEntry {
                        manifest,
                        install_path: path.to_string_lossy().to_string(),
                        state: ExtensionState::Installed,
                        error: None,
                    };
                    registry.register(entry);
                    count += 1;
                }
                Err(e) => warn!(path = %manifest_path.display(), err = %e, "解析 extension.json 失败"),
            },
            Err(e) => warn!(path = %manifest_path.display(), err = %e, "读取 extension.json 失败"),
        }
    }
    count
}

// ── Tauri Commands ──────────────────────────────────────────────────────────

/// 初始化扩展系统（扫描 `~/.ydsz/extensions/` 目录）
#[tauri::command]
#[specta::specta]
pub async fn extension_init(state: State<'_, ExtState>) -> Result<usize, String> {
    let root = dirs_extensions_root();
    let count = scan_extensions_dir(&root, &state.registry);
    info!(root = %root.display(), count, "Extension 注册表初始化完成");
    let activator = ExtensionActivator::new(state.registry.clone());
    let activated = activator.on_startup();
    if !activated.is_empty() {
        info!(extensions = ?activated, "启动时自动激活的扩展");
    }
    Ok(count)
}

/// 列出所有已安装扩展
#[tauri::command]
#[specta::specta]
pub async fn extension_list(state: State<'_, ExtState>) -> Result<Vec<ExtensionDto>, String> {
    Ok(state.registry.list().into_iter().map(ExtensionDto::from).collect())
}

/// 获取扩展详情
#[tauri::command]
#[specta::specta]
pub async fn extension_get(
    state: State<'_, ExtState>,
    name: String,
) -> Result<Option<ExtensionDetailDto>, String> {
    let entry = state.registry.get(&name);
    match entry {
        Some(e) => Ok(Some(ExtensionDetailDto {
            name: e.manifest.name.clone(),
            version: e.manifest.version.clone(),
            display_name: e.manifest.display_name.clone(),
            description: e.manifest.description.clone(),
            author: e.manifest.author.clone(),
            categories: e.manifest.categories.clone(),
            install_path: e.install_path.clone(),
            state: format!("{:?}", e.state).to_lowercase(),
            error: e.error.clone(),
            contributes: ExtensionContributionDto::from(e.manifest.contributes.clone()),
            extension_dependencies: e.manifest.extension_dependencies.clone(),
        })),
        None => Ok(None),
    }
}

/// 激活扩展
#[tauri::command]
#[specta::specta]
pub async fn extension_activate(state: State<'_, ExtState>, name: String) -> Result<(), String> {
    info!(name = %name, "激活扩展");
    ExtensionLifecycle::new(state.registry.clone()).activate(&name).map_err(|e| e.to_string())
}

/// 停用扩展
#[tauri::command]
#[specta::specta]
pub async fn extension_deactivate(state: State<'_, ExtState>, name: String) -> Result<(), String> {
    info!(name = %name, "停用扩展");
    ExtensionLifecycle::new(state.registry.clone()).deactivate(&name).map_err(|e| e.to_string())
}

/// 卸载扩展（删除目录 + 注销注册）
#[tauri::command]
#[specta::specta]
pub async fn extension_uninstall(state: State<'_, ExtState>, name: String) -> Result<(), String> {
    info!(name = %name, "卸载扩展");
    let entry = state.registry.get(&name).ok_or("扩展未安装")?;
    let install_path = PathBuf::from(&entry.install_path);
    state.registry.unregister(&name);
    if install_path.exists() {
        std::fs::remove_dir_all(&install_path).map_err(|e| format!("删除目录失败: {e}"))?;
    }
    Ok(())
}

/// 从本地路径安装扩展
#[tauri::command]
#[specta::specta]
pub async fn extension_install_from_path(
    state: State<'_, ExtState>,
    path: String,
) -> Result<ExtensionDto, String> {
    info!(path = %path, "从本地路径安装扩展");
    let src = PathBuf::from(&path);
    let manifest_path = src.join("extension.json");
    let raw = std::fs::read_to_string(&manifest_path)
        .map_err(|e| format!("读取 extension.json 失败: {e}"))?;
    let manifest: ExtensionManifest = serde_json::from_str(&raw)
        .map_err(|e| format!("解析 extension.json 失败: {e}"))?;
    let root = dirs_extensions_root();
    let dest = root.join(&manifest.name);
    if dest.exists() { return Err(format!("扩展 {} 已存在", manifest.name)); }
    std::fs::create_dir_all(&dest).map_err(|e| format!("创建目录失败: {e}"))?;
    copy_dir_recursive(&src, &dest).map_err(|e| format!("复制文件失败: {e}"))?;
    let entry = ydsz_code::extensions::ExtensionEntry {
        manifest: manifest.clone(),
        install_path: dest.to_string_lossy().to_string(),
        state: ExtensionState::Installed,
        error: None,
    };
    state.registry.register(entry.clone());
    Ok(ExtensionDto::from(entry))
}

/// 从 GitHub 仓库安装扩展
#[tauri::command]
#[specta::specta]
pub async fn extension_install_from_github(
    state: State<'_, ExtState>,
    repo: String,
    subdir: Option<String>,
) -> Result<ExtensionDto, String> {
    info!(repo = %repo, subdir = ?subdir, "从 GitHub 安装扩展");
    let (owner, repo_name) = if repo.starts_with("https://github.com/") {
        let parts: Vec<&str> = repo.trim_end_matches('/')
            .trim_start_matches("https://github.com/")
            .split('/').collect();
        if parts.len() < 2 { return Err("无效的 GitHub URL".to_string()); }
        (parts[0].to_string(), parts[1].to_string())
    } else {
        let parts: Vec<&str> = repo.split('/').collect();
        if parts.len() < 2 { return Err("无效的仓库格式，期望 owner/repo".to_string()); }
        (parts[0].to_string(), parts[1].to_string())
    };
    let subdir_path = subdir.unwrap_or_default();
    let manifest_url = format!(
        "https://raw.githubusercontent.com/{owner}/{repo_name}/main/{subdir_path}/extension.json"
    );
    let client = reqwest::Client::new();
    let resp = client.get(&manifest_url).send().await
        .map_err(|e| format!("下载 extension.json 失败: {e}"))?;
    let raw = if resp.status().is_success() {
        resp.text().await.map_err(|e| format!("读取响应失败: {e}"))?
    } else {
        let master_url = manifest_url.replace("/main/", "/master/");
        let resp2 = client.get(&master_url).send().await
            .map_err(|e| format!("下载 extension.json 失败: {e}"))?;
        if !resp2.status().is_success() {
            return Err(format!("无法获取 extension.json (尝试 main 和 master)，HTTP {}", resp.status()));
        }
        resp2.text().await.map_err(|e| format!("读取响应失败: {e}"))?
    };
    let manifest: ExtensionManifest = serde_json::from_str(&raw)
        .map_err(|e| format!("解析 extension.json 失败: {e}"))?;

    // 创建扩展目录
    let root = dirs_extensions_root();
    let dest = root.join(&manifest.name);
    if dest.exists() { return Err(format!("扩展 {} 已存在，请先卸载", manifest.name)); }
    std::fs::create_dir_all(&dest).map_err(|e| format!("创建目录失败: {e}"))?;
    let manifest_json = serde_json::to_string_pretty(&manifest)
        .map_err(|e| format!("序列化 manifest 失败: {e}"))?;
    std::fs::write(dest.join("extension.json"), manifest_json)
        .map_err(|e| format!("写入 extension.json 失败: {e}"))?;
    let source_info = format!(
        "{{\"source\":\"github\",\"owner\":\"{owner}\",\"repo\":\"{repo_name}\",\"subdir\":\"{subdir_path}\",\"installedAt\":\"{}\"}}",
        chrono::Utc::now().to_rfc3339()
    );
    std::fs::write(dest.join(".source.json"), source_info)
        .map_err(|e| format!("写入来源信息失败: {e}"))?;
    // 下载 main 文件（如有）
    if let Some(main_file) = &manifest.main {
        let main_url = format!(
            "https://raw.githubusercontent.com/{owner}/{repo_name}/main/{subdir_path}/{main_file}"
        );
        if let Ok(resp) = client.get(&main_url).send().await {
            if resp.status().is_success() {
                if let Ok(content) = resp.text().await {
                    let _ = std::fs::write(dest.join(main_file), content);
                }
            }
        }
    }
    let entry = ydsz_code::extensions::ExtensionEntry {
        manifest: manifest.clone(),
        install_path: dest.to_string_lossy().to_string(),
        state: ExtensionState::Installed,
        error: None,
    };
    state.registry.register(entry.clone());
    info!(name = %manifest.name, "扩展安装成功");
    Ok(ExtensionDto::from(entry))
}

/// 列出所有已激活扩展贡献的命令
#[tauri::command]
#[specta::specta]
pub async fn extension_list_commands(
    state: State<'_, ExtState>,
) -> Result<Vec<CommandContributionDto>, String> {
    Ok(state.registry.list_commands().into_iter().map(|cmd| CommandContributionDto {
        id: cmd.id, title: cmd.title, keybinding: cmd.keybinding, icon: cmd.icon, category: cmd.category,
    }).collect())
}

/// 触发 OnStartup 激活事件
#[tauri::command]
#[specta::specta]
pub async fn extension_trigger_startup(state: State<'_, ExtState>) -> Result<Vec<String>, String> {
    Ok(ExtensionActivator::new(state.registry.clone()).on_startup())
}
