//! # 桌面端移动推送命令模块
//!
//! 提供桌面端触发移动端推送、查看已绑定设备、撤销设备等 Tauri 命令。
//! 底层复用嵌入式 ydsz-server 的 `MobilePushDispatcher`，通过同进程 IPC 访问。
//!
//! ## 命令清单
//!
//! | 命令 | 说明 |
//! |------|------|
//! | `push_dispatch_approval` | 推送"待审批"提醒到某 alias 的所有设备 |
//! | `push_dispatch_task_update` | 推送任务状态变化 |
//! | `push_list_mobile_devices` | 列出某 alias 已绑定的所有移动设备 |
//! | `push_unregister_mobile_device` | 撤销某设备（设备遗失/重置） |
//! | `push_cleanup_expired_devices` | 清理心跳 > 30 天的过期设备 |
//! | `push_get_dry_run_status` | 查询当前 dry_run 模式状态（CI/演示用） |
//!
//! ## 端到端链路
//!
//! ```text
//! 桌面端 Tauri command
//!        ↓
//! embedded ydsz-server (MobilePushDispatcher)
//!        ↓
//! JPush/Umeng REST API → 移动端
//! ```

use std::sync::Arc;

use serde::Serialize;
use tauri::State;
use tracing::info;

use ydsz_server::push::mobile_devices::MobileDevice;
use ydsz_server::push::{
    MobilePushDispatcher, PushConfigStatus, PushDispatchResult, PushMessage,
};

use crate::ServerState;

/// 审批推送参数
#[derive(Debug, Clone, serde::Deserialize, specta::Type)]
pub struct DispatchApprovalParams {
    /// ydsz 用户标识（alias）
    pub alias: String,
    /// 标题
    pub title: String,
    /// 内容
    pub body: String,
    /// 跳转深链接
    #[serde(default)]
    pub deep_link: Option<String>,
    /// 关联的审批 ID
    #[serde(default)]
    pub approval_id: Option<String>,
}

/// 任务状态推送参数
#[derive(Debug, Clone, serde::Deserialize, specta::Type)]
pub struct DispatchTaskUpdateParams {
    /// ydsz 用户标识
    pub alias: String,
    /// 任务 ID
    pub task_id: String,
    /// 状态字符串
    pub status: String,
    /// 描述信息
    pub message: String,
}

/// 设备撤销参数
#[derive(Debug, Clone, serde::Deserialize, specta::Type)]
pub struct UnregisterParams {
    pub alias: String,
    pub device_token: String,
}

/// Dry-run 状态响应
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct DryRunStatus {
    pub is_dry_run: bool,
    pub note: &'static str,
}

/// 获取底层 dispatcher 的引用
fn dispatcher(state: &State<'_, ServerState>) -> Arc<MobilePushDispatcher> {
    state.bootstrap_result.services.mobile_push_dispatcher.clone()
}

/// 推送"待审批"提醒到指定 alias 的所有设备
#[tauri::command]
pub async fn push_dispatch_approval(
    state: State<'_, ServerState>,
    params: DispatchApprovalParams,
) -> Result<PushDispatchResult, String> {
    info!(
        alias = %params.alias,
        title = %params.title,
        "桌面端触发待审批推送"
    );
    let mut payload = std::collections::HashMap::new();
    if let Some(id) = params.approval_id.clone() {
        payload.insert("approval_id".into(), serde_json::Value::String(id));
    }
    payload.insert(
        "kind".into(),
        serde_json::Value::String("approval".into()),
    );
    let message = PushMessage {
        title: params.title,
        subtitle: None,
        body: params.body,
        deep_link: params.deep_link,
        payload,
        badge: 1,
    };
    Ok(dispatcher(&state).dispatch(&params.alias, &message).await)
}

/// 推送任务状态更新
#[tauri::command]
pub async fn push_dispatch_task_update(
    state: State<'_, ServerState>,
    params: DispatchTaskUpdateParams,
) -> Result<PushDispatchResult, String> {
    info!(
        alias = %params.alias,
        task_id = %params.task_id,
        status = %params.status,
        "桌面端触发任务状态推送"
    );
    let mut payload = std::collections::HashMap::new();
    payload.insert(
        "task_id".into(),
        serde_json::Value::String(params.task_id.clone()),
    );
    payload.insert(
        "status".into(),
        serde_json::Value::String(params.status),
    );
    payload.insert(
        "kind".into(),
        serde_json::Value::String("task_update".into()),
    );
    let message = PushMessage {
        title: "任务状态更新".into(),
        subtitle: None,
        body: params.message,
        deep_link: Some("ydsz://tasks".into()),
        payload,
        badge: 0,
    };
    Ok(dispatcher(&state).dispatch(&params.alias, &message).await)
}

/// 列出某 alias 已绑定的所有移动设备
#[tauri::command]
pub async fn push_list_mobile_devices(
    state: State<'_, ServerState>,
    alias: String,
) -> Result<Vec<MobileDevice>, String> {
    let disp = dispatcher(&state);
    let store = disp.store();
    Ok(store.list_for_alias(&alias).await)
}

/// 撤销某设备
#[tauri::command]
#[specta::specta]
pub async fn push_unregister_mobile_device(
    state: State<'_, ServerState>,
    params: UnregisterParams,
) -> Result<bool, String> {
    let disp = dispatcher(&state);
    let store = disp.store();
    Ok(store.remove(&params.alias, &params.device_token).await)
}

/// 清理过期设备（默认 30 天）
#[tauri::command]
#[specta::specta]
pub async fn push_cleanup_expired_devices(state: State<'_, ServerState>) -> Result<usize, String> {
    let disp = dispatcher(&state);
    let store = disp.store();
    let max_age_ms = 30_i64 * 24 * 60 * 60 * 1000;
    Ok(store.cleanup_expired(max_age_ms).await)
}

/// 获取 dry_run 模式状态
#[tauri::command]
#[specta::specta]
pub async fn push_get_dry_run_status(
    state: State<'_, ServerState>,
) -> Result<DryRunStatus, String> {
    Ok(DryRunStatus {
        is_dry_run: dispatcher(&state).is_dry_run(),
        note: "dry_run=true 时仅打印日志不真发；生产环境应设置 JIGUANG/UMENG 凭证并取消 YDSZ_PUSH_DRY_RUN",
    })
}

/// 获取推送通道配置状态（P2-4: 实际对接联调）
#[tauri::command]
pub async fn push_get_config_status(
    state: State<'_, ServerState>,
) -> Result<PushConfigStatus, String> {
    Ok(dispatcher(&state).config_status())
}

/// 测试极光推送连接（P2-4: 实际对接联调）
#[tauri::command]
#[specta::specta]
pub async fn push_test_jpush_connection(
    state: State<'_, ServerState>,
) -> Result<(), String> {
    dispatcher(&state).test_jpush_connection().await
}

/// 测试友盟推送连接（P2-4: 实际对接联调）
#[tauri::command]
#[specta::specta]
pub async fn push_test_umeng_connection(
    state: State<'_, ServerState>,
) -> Result<(), String> {
    dispatcher(&state).test_umeng_connection().await
}

/// 推送凭证更新参数（P1-2: 桌面端推送配置 UI 联调用）
///
/// 所有字段都是 `Option<String>`:
/// - `None`: 保留原配置中的对应字段不变
/// - `Some(String)`: 覆盖
/// - `Some("")`: 视为"清空"（设为 `None`），可用于在 UI 上删除凭证
///
/// `dry_run` 字段除外，它是 `Option<bool>`:
/// - `None`: 保留原 `dry_run`
/// - `Some(b)`: 设置为 `b`
#[derive(Debug, Clone, serde::Deserialize, specta::Type)]
pub struct PushCredentialsInput {
    /// 极光 App Key（None=保留，Some("")=清空，Some(value)=覆盖）
    #[serde(default)]
    pub jpush_app_key: Option<String>,
    /// 极光 Master Secret
    #[serde(default)]
    pub jpush_master_secret: Option<String>,
    /// 友盟 App Key
    #[serde(default)]
    pub umeng_app_key: Option<String>,
    /// 友盟 App Master Secret
    #[serde(default)]
    pub umeng_app_master_secret: Option<String>,
    /// dry_run 开关
    #[serde(default)]
    pub dry_run: Option<bool>,
}

/// 应用合并规则: None=保留，Some("")=清空（None），Some(value)=覆盖
fn merge_field(current: &Option<String>, incoming: Option<String>) -> Option<String> {
    match incoming {
        None => current.clone(),
        Some(value) if value.is_empty() => None,
        Some(value) => Some(value),
    }
}

/// 运行时更新推送通道凭证（P1-2: 桌面端推送配置 UI 联调用）
///
/// 把新凭证合并到当前 `DispatcherConfig` 中（部分字段为 `None` 表示保留原值）。
/// 凭证立即对所有后续 dispatch / test_* 调用生效。
///
/// 注意：本命令**不会**把凭证持久化到 OS Keyring；
/// 前端调用方应自行通过 `credentialVault.ts` 把凭证存到 Keyring，
/// 应用启动时再从 Keyring 加载并通过本命令塞回 dispatcher。
#[tauri::command]
#[specta::specta]
pub async fn push_update_credentials(
    state: State<'_, ServerState>,
    input: PushCredentialsInput,
) -> Result<PushConfigStatus, String> {
    info!(
        jpush_key = input.jpush_app_key.is_some(),
        jpush_secret = input.jpush_master_secret.is_some(),
        umeng_key = input.umeng_app_key.is_some(),
        umeng_secret = input.umeng_app_master_secret.is_some(),
        dry_run = ?input.dry_run,
        "更新推送通道凭证"
    );
    let disp = dispatcher(&state);
    let mut current = disp.current_config();
    current.jpush_app_key = merge_field(&current.jpush_app_key, input.jpush_app_key);
    current.jpush_master_secret =
        merge_field(&current.jpush_master_secret, input.jpush_master_secret);
    current.umeng_app_key = merge_field(&current.umeng_app_key, input.umeng_app_key);
    current.umeng_app_master_secret =
        merge_field(&current.umeng_app_master_secret, input.umeng_app_master_secret);
    if let Some(dry_run) = input.dry_run {
        current.dry_run = dry_run;
    }
    disp.update_config(current);
    Ok(disp.config_status())
}
