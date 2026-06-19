//! # 工作区管理命令模块
//!
//! 本模块提供与工作区/项目管理相关的 Tauri 命令，支持项目列表管理、文件读写等操作。
//!
//! ## 模块职责
//!
//! - 管理用户打开的项目列表
//! - 提供文件读写能力（供前端访问本地文件）
//! - 维护工作区状态
//!
//! ## 核心功能
//!
//! 1. **项目管理**：列出项目、添加项目、移除项目
//! 2. **文件操作**：读取文件内容、写入文件内容
//!
//! ## 使用场景
//!
//! - 前端需要显示项目列表时调用 `list_projects`
//! - 用户打开新文件夹时调用 `add_project` 添加到工作区
//! - 前端需要读取配置文件时调用 `read_file`
//! - 前端需要保存文件时调用 `write_file`
//!
//! ## 设计说明
//!
//! 当前实现将项目列表保存在内存中（通过 `Mutex<Vec<ProjectInfo>>`），
//! 应用重启后项目列表会丢失。后续可考虑持久化到本地文件。

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex};
use tauri::State;

/// 工作区状态管理器
///
/// 持有所有已打开项目的列表，通过互斥锁保证线程安全。
///
/// # 字段说明
///
/// - `projects`: 存储所有项目信息的向量，每个元素代表一个已打开的项目
///
/// # 使用场景
///
/// 在 `lib.rs` 中通过 `.manage(WorkspaceState::new())` 注入，
/// 各命令通过 `State<'_, WorkspaceState>` 参数获取该状态。
pub struct WorkspaceState {
    projects: Arc<Mutex<Vec<ProjectInfo>>>,
}

/// 项目信息结构
///
/// 表示一个已打开的项目的基本信息。
///
/// # 字段说明
///
/// - `id`: 项目唯一标识符（UUID 格式）
/// - `path`: 项目根目录的绝对路径
/// - `name`: 项目名称（通常取文件夹名称）
///
/// # 使用场景
///
/// 作为 `list_projects` 命令的返回值元素，用于前端渲染项目列表。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectInfo {
    /// 项目唯一标识符
    pub id: String,
    /// 项目根目录路径
    pub path: String,
    /// 项目名称
    pub name: String,
}

impl WorkspaceState {
    /// 创建新的工作区状态管理器
    ///
    /// 初始化空的项目列表。
    ///
    /// # 返回值
    ///
    /// 返回初始化后的 `WorkspaceState` 实例
    pub fn new() -> Self {
        Self {
            projects: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

/// 列出所有项目命令
///
/// 获取当前工作区中所有已打开的项目列表。
///
/// # 参数
///
/// - `state`: 工作区状态管理器（通过 Tauri State 注入）
///
/// # 返回值
///
/// - `Ok(Vec<ProjectInfo>)`: 查询成功，返回项目信息列表
/// - `Err(String)`: 查询失败（如锁获取失败）
///
/// # 使用示例
///
/// ```javascript
/// // 前端调用示例
/// const projects = await window.__TAURI__.invoke('list_projects');
/// projects.forEach(p => {
///     console.log(`项目: ${p.name}, 路径: ${p.path}`);
/// });
/// ```
#[tauri::command]
pub async fn list_projects(state: State<'_, WorkspaceState>) -> Result<Vec<ProjectInfo>, String> {
    let projects = state.projects.lock().map_err(|e| e.to_string())?;
    Ok(projects.clone())
}

/// 添加项目命令
///
/// 将指定路径的文件夹添加到工作区项目列表中。
///
/// # 参数
///
/// - `state`: 工作区状态管理器
/// - `path`: 项目根目录的绝对路径
///
/// # 返回值
///
/// - `Ok(())`: 添加成功
/// - `Err(String)`: 添加失败（如锁获取失败）
///
/// # 设计说明
///
/// - 项目名称自动从路径中提取（取最后一级文件夹名）
/// - 项目 ID 自动生成（UUID v4）
/// - 不会检查路径是否已存在于列表中
///
/// # 使用示例
///
/// ```javascript
/// // 前端调用示例
/// await window.__TAURI__.invoke('add_project', {
///     path: '/home/user/my-project'
/// });
/// ```
#[tauri::command]
pub async fn add_project(
    state: State<'_, WorkspaceState>,
    path: String,
) -> Result<(), String> {
    let mut projects = state.projects.lock().map_err(|e| e.to_string())?;
    
    // 从路径中提取项目名称（最后一级文件夹名）
    let name = Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Unknown")
        .to_string();
    
    // 创建项目信息对象
    let project = ProjectInfo {
        id: uuid::Uuid::new_v4().to_string(),
        path: path.clone(),
        name,
    };
    
    projects.push(project);
    Ok(())
}

/// 移除项目命令
///
/// 从工作区项目列表中移除指定 ID 的项目。
///
/// # 参数
///
/// - `state`: 工作区状态管理器
/// - `project_id`: 要移除的项目 ID
///
/// # 返回值
///
/// - `Ok(())`: 移除成功（即使项目不存在也返回成功）
/// - `Err(String)`: 移除失败（如锁获取失败）
///
/// # 使用示例
///
/// ```javascript
/// // 前端调用示例
/// await window.__TAURI__.invoke('remove_project', {
///     projectId: 'xxx-xxx-xxx'
/// });
/// ```
#[tauri::command]
pub async fn remove_project(
    state: State<'_, WorkspaceState>,
    project_id: String,
) -> Result<(), String> {
    let mut projects = state.projects.lock().map_err(|e| e.to_string())?;
    // 保留 ID 不匹配的项目（即移除匹配的项目）
    projects.retain(|p| p.id != project_id);
    Ok(())
}

/// 读取文件内容命令
///
/// 读取指定路径的文本文件内容。
///
/// # 参数
///
/// - `path`: 文件的绝对路径
///
/// # 返回值
///
/// - `Ok(String)`: 读取成功，返回文件内容（UTF-8 字符串）
/// - `Err(String)`: 读取失败（如文件不存在、无权限、非文本文件）
///
/// # 使用示例
///
/// ```javascript
/// // 前端调用示例
/// const content = await window.__TAURI__.invoke('read_file', {
///     path: '/path/to/file.txt'
/// });
/// console.log(content);
/// ```
///
/// # 注意事项
///
/// - 该命令仅支持读取 UTF-8 编码的文本文件
/// - 对于大文件，建议前端先检查文件大小
/// - 二进制文件读取会失败
#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// 写入文件内容命令
///
/// 将指定内容写入到文件中（覆盖原有内容）。
///
/// # 参数
///
/// - `path`: 文件的绝对路径
/// - `content`: 要写入的内容字符串
///
/// # 返回值
///
/// - `Ok(())`: 写入成功
/// - `Err(String)`: 写入失败（如无权限、磁盘空间不足）
///
/// # 使用示例
///
/// ```javascript
/// // 前端调用示例
/// await window.__TAURI__.invoke('write_file', {
///     path: '/path/to/file.txt',
///     content: 'Hello, World!'
/// });
/// ```
///
/// # 注意事项
///
/// - 如果文件不存在，会自动创建
/// - 如果文件已存在，会完全覆盖原有内容
/// - 写入前不会自动备份原文件
#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}
