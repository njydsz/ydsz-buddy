//! # 应用设置管理命令模块
//!
//! 本模块提供与应用设置持久化相关的 Tauri 命令，支持读取和保存用户配置。
//!
//! ## 模块职责
//!
//! - 管理应用设置的内存缓存
//! - 将设置持久化到本地 JSON 文件
//! - 提供前端可调用的设置读写命令
//!
//! ## 核心功能
//!
//! 1. **获取设置**：从内存缓存读取当前配置
//! 2. **保存设置**：将配置写入内存并持久化到磁盘
//!
//! ## 使用场景
//!
//! - 前端初始化时调用 `get_settings` 获取用户配置
//! - 用户修改设置后调用 `save_settings` 保存更改
//!
//! ## 存储位置
//!
//! 设置文件存储在系统配置目录下：
//! - Windows: `%APPDATA%\remi-code\settings.json`
//! - macOS: `~/Library/Application Support/remi-code/settings.json`
//! - Linux: `~/.config/remi-code/settings.json`
//!
//! ## 设计说明
//!
//! - 设置以 JSON 格式存储，支持任意键值对
//! - 使用 `Mutex` 保证多线程安全
//! - 首次启动时如果配置文件不存在，会创建空配置

use serde_json::Value;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::State;

/// 设置状态管理器
///
/// 持有应用设置的内存缓存和配置文件路径。
///
/// # 字段说明
///
/// - `settings`: 设置值的内存缓存（JSON 格式），通过互斥锁保证线程安全
/// - `settings_path`: 设置文件的绝对路径
///
/// # 使用场景
///
/// 在 `lib.rs` 中通过 `.manage(SettingsState::new())` 注入，
/// 各命令通过 `State<'_, SettingsState>` 参数获取该状态。
pub struct SettingsState {
    settings: Arc<Mutex<Value>>,
    settings_path: PathBuf,
}

impl SettingsState {
    /// 创建新的设置状态管理器
    ///
    /// 初始化设置缓存并尝试从磁盘加载已有配置。
    ///
    /// # 返回值
    ///
    /// 返回初始化后的 `SettingsState` 实例
    ///
    /// # 设计说明
    ///
    /// - 如果配置文件存在且格式正确，会加载到内存
    /// - 如果配置文件不存在或格式错误，会使用空对象作为默认值
    /// - 不会在此处创建配置文件，首次保存时才会创建
    pub fn new() -> Self {
        // 确定配置文件路径
        let settings_path = dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("remi-code")
            .join("settings.json");
        
        // 尝试从文件加载设置
        let settings = std::fs::read_to_string(&settings_path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_else(|| Value::Object(serde_json::Map::new()));
        
        Self {
            settings: Arc::new(Mutex::new(settings)),
            settings_path,
        }
    }
}

/// 获取应用设置命令
///
/// 从内存缓存中读取当前的应用配置。
///
/// # 参数
///
/// - `state`: 设置状态管理器（通过 Tauri State 注入）
///
/// # 返回值
///
/// - `Ok(Value)`: 读取成功，返回 JSON 格式的设置对象
/// - `Err(String)`: 读取失败（如锁获取失败）
///
/// # 使用示例
///
/// ```javascript
/// // 前端调用示例
/// const settings = await window.__TAURI__.invoke('get_settings');
/// console.log('主题:', settings.theme);
/// console.log('语言:', settings.language);
/// ```
///
/// # 设计说明
///
/// - 该命令直接从内存读取，不会访问磁盘
/// - 返回的是设置的副本，修改返回值不会影响内部状态
#[tauri::command]
pub async fn get_settings(state: State<'_, SettingsState>) -> Result<Value, String> {
    let settings = state.settings.lock().map_err(|e| e.to_string())?;
    Ok(settings.clone())
}

/// 保存应用设置命令
///
/// 将新的配置写入内存缓存并持久化到磁盘文件。
///
/// # 参数
///
/// - `state`: 设置状态管理器
/// - `settings`: 新的设置对象（JSON 格式）
///
/// # 返回值
///
/// - `Ok(())`: 保存成功
/// - `Err(String)`: 保存失败（如锁获取失败、目录创建失败、文件写入失败）
///
/// # 使用示例
///
/// ```javascript
/// // 前端调用示例
/// await window.__TAURI__.invoke('save_settings', {
///     settings: {
///         theme: 'dark',
///         language: 'zh-CN',
///         fontSize: 14
///     }
/// });
/// ```
///
/// # 设计说明
///
/// - 该命令会完全替换原有设置，而不是合并
/// - 如果配置文件不存在，会自动创建父目录和文件
/// - 使用格式化（pretty）JSON 写入，便于人工查看
/// - 写入操作是同步的，大配置可能阻塞
#[tauri::command]
pub async fn save_settings(
    state: State<'_, SettingsState>,
    settings: Value,
) -> Result<(), String> {
    // 更新内存缓存
    let mut current = state.settings.lock().map_err(|e| e.to_string())?;
    *current = settings;
    
    // 确保父目录存在
    if let Some(parent) = state.settings_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    
    // 序列化为格式化的 JSON 并写入文件
    let json = serde_json::to_string_pretty(&*current).map_err(|e| e.to_string())?;
    std::fs::write(&state.settings_path, json).map_err(|e| e.to_string())?;
    
    Ok(())
}
