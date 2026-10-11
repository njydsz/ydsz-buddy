//! # CUA (Computer Use Agent) 命令模块
//!
//! 本模块提供 Computer Use Agent 相关的 Tauri 命令 stub，为后续 Rust 后端扩展预留接口。
//!
//! ## 模块职责
//!
//! - 获取当前屏幕可交互元素列表（前端截图 + Rust 端解析元素）
//! - 在指定坐标执行操作（click/type/hover/scroll 等）
//! - 获取屏幕截图
//! - 屏幕录制（开始/停止）
//! - 权限管理（屏幕录制、辅助功能）
//!
//! ## 核心功能
//!
//! 1. **`cua_get_screen_elements`**：获取屏幕可交互元素列表（stub: 返回空数组）
//! 2. **`cua_execute_action`**：在指定坐标执行操作（stub: 返回未实现）
//! 3. **`cua_get_screenshot`**：获取屏幕截图（stub: 返回占位图数据）
//! 4. **`cua_start_recording`**：开始屏幕录制（stub: 返回占位结果）
//! 5. **`cua_stop_recording`**：停止屏幕录制（stub: 返回占位结果）
//! 6. **`cua_toggle_permission`**：切换权限状态（stub: 返回未实现）
//! 7. **`cua_set_mode`**：设置 CUA 模式 safe/yolo（stub: 返回未实现）
//!
//! ## 使用场景
//!
//! - CUA 权限面板调用 `cua_toggle_permission` / `cua_set_mode`
//! - CUA 截图查看器调用 `cua_get_screenshot` / `cua_get_screen_elements`
//! - CUA 坐标叠加层调用 `cua_execute_action`
//! - CUA 录制指示器调用 `cua_start_recording` / `cua_stop_recording`
//!
//! ## 实现说明
//!
//! 当前所有命令均为 stub 实现，返回 `Err("NOT_IMPLEMENTED")`。实际实现需要：
//!
//! - macOS: 使用 `core_graphics` / `accessibility` AX API
//! - Windows: 使用 `windows` crate 的 `UIAutomation` / `ScreenCapture` API
//! - Linux: 使用 AT-SPI / X11 / Wayland 接口
//!
//! ## 后续扩展
//!
//! 1. 接入平台原生屏幕录制 API
//! 2. 集成 accessibility framework 获取 UI 元素
//! 3. 实现鼠标/键盘模拟（需平台原生支持）
//! 4. 截图编码与压缩
//! 5. 录制文件写入与格式封装
use serde::{Deserialize, Serialize};

// ============================================================================
// 请求/响应类型（与前端 contracts/cua.ts 对齐）
// ============================================================================

/// 获取屏幕元素请求
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CuaGetScreenElementsRequest {
    /// 截图 ID（可选，空则重新截取）
    pub screenshot_id: Option<String>,
}

/// 获取屏幕元素响应
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CuaGetScreenElementsResponse {
    pub elements: Vec<ScreenElementDto>,
    pub screenshot_id: String,
}

/// 屏幕元素 DTO
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenElementDto {
    pub id: String,
    pub tag_name: String,
    pub text: Option<String>,
    pub bounds: BoundsDto,
    pub interactive: bool,
    pub role: Option<String>,
}

/// 边界框 DTO
#[derive(Debug, Clone, Serialize)]
pub struct BoundsDto {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

/// 执行动作请求
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CuaExecuteActionRequest {
    pub action_type: String,
    pub coordinates: Option<CoordinatesDto>,
    pub text: Option<String>,
    pub duration_ms: Option<u64>,
    pub target_element: Option<String>,
    pub session_id: Option<String>,
}

/// 坐标 DTO
#[derive(Debug, Clone, Deserialize)]
pub struct CoordinatesDto {
    pub x: i32,
    pub y: i32,
}

/// 执行动作响应
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CuaExecuteActionResponse {
    pub success: bool,
    pub duration_ms: u64,
    pub error: Option<String>,
    pub screenshot: Option<String>,
}

/// 获取截图请求
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CuaGetScreenshotRequest {
    pub screen_index: Option<u32>,
    pub region: Option<RegionDto>,
}

/// 区域 DTO
#[derive(Debug, Clone, Deserialize)]
pub struct RegionDto {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// 获取截图响应
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CuaGetScreenshotResponse {
    pub base64: String,
    pub width: i32,
    pub height: i32,
    pub screenshot_id: String,
}

/// 开始录制请求
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CuaStartRecordingRequest {
    pub fps: Option<u32>,
    pub include_audio: Option<bool>,
    pub screen_index: Option<u32>,
}

/// 开始录制响应
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CuaStartRecordingResponse {
    pub success: bool,
    pub recording_id: String,
}

/// 停止录制请求
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CuaStopRecordingRequest {
    pub recording_id: String,
}

/// 停止录制响应
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CuaStopRecordingResponse {
    pub success: bool,
    pub file_path: Option<String>,
    pub duration_ms: u64,
    pub frame_count: u32,
}

/// 权限切换请求
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CuaTogglePermissionRequest {
    pub name: String,
    pub granted: bool,
}

/// CUA 模式设置请求
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CuaSetModeRequest {
    pub mode: String,
}

// ============================================================================
// Stub 错误常量
// ============================================================================

const NOT_IMPLEMENTED: &str = "NOT_IMPLEMENTED: CUA 后端功能尚未实现";

// ============================================================================
// Tauri 命令（stub 实现）
// ============================================================================

/// 获取当前可交互元素列表
///
/// stub: 返回未实现错误
#[tauri::command]
#[specta::specta]
#[allow(dead_code)]
pub async fn cua_get_screen_elements(
    _request: Option<CuaGetScreenElementsRequest>,
) -> Result<CuaGetScreenElementsResponse, String> {
    Err(NOT_IMPLEMENTED.to_string())
}

/// 在指定坐标执行操作
///
/// stub: 返回未实现错误
#[tauri::command]
#[specta::specta]
#[allow(dead_code)]
pub async fn cua_execute_action(
    _request: CuaExecuteActionRequest,
) -> Result<CuaExecuteActionResponse, String> {
    Err(NOT_IMPLEMENTED.to_string())
}

/// 获取屏幕截图
///
/// stub: 返回未实现错误
#[tauri::command]
#[specta::specta]
#[allow(dead_code)]
pub async fn cua_get_screenshot(
    _request: Option<CuaGetScreenshotRequest>,
) -> Result<CuaGetScreenshotResponse, String> {
    Err(NOT_IMPLEMENTED.to_string())
}

/// 开始屏幕录制
///
/// stub: 返回未实现错误
#[tauri::command]
#[specta::specta]
#[allow(dead_code)]
pub async fn cua_start_recording(
    _request: Option<CuaStartRecordingRequest>,
) -> Result<CuaStartRecordingResponse, String> {
    Err(NOT_IMPLEMENTED.to_string())
}

/// 停止屏幕录制
///
/// stub: 返回未实现错误
#[tauri::command]
#[specta::specta]
#[allow(dead_code)]
pub async fn cua_stop_recording(
    _request: CuaStopRecordingRequest,
) -> Result<CuaStopRecordingResponse, String> {
    Err(NOT_IMPLEMENTED.to_string())
}

/// 切换 CUA 权限状态
///
/// stub: 返回未实现错误
#[tauri::command]
#[specta::specta]
#[allow(dead_code)]
pub async fn cua_toggle_permission(
    _request: CuaTogglePermissionRequest,
) -> Result<(), String> {
    Err(NOT_IMPLEMENTED.to_string())
}

/// 设置 CUA 操作模式
///
/// stub: 返回未实现错误
#[tauri::command]
#[specta::specta]
#[allow(dead_code)]
pub async fn cua_set_mode(
    _request: CuaSetModeRequest,
) -> Result<(), String> {
    Err(NOT_IMPLEMENTED.to_string())
}
