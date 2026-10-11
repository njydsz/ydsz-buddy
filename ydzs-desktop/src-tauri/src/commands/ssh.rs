//! # 桌面端 SSH 远程连接命令模块
//!
//! 提供 SSH 远程连接的 Tauri 命令，前端通过 invoke 调用。
//! 底层通过嵌入式 ydsz-server 的 ServiceContainer 访问 SshConnectionPool。
//!
//! ## 命令清单
//!
//! | 命令 | 说明 |
//! |------|------|
//! | `ssh_connect` | 建立 SSH 连接 |
//! | `ssh_disconnect` | 断开 SSH 连接 |
//! | `ssh_get_status` | 获取连接状态 |
//! | `ssh_list_connections` | 列出所有连接 |
//! | `ssh_read_file` | 读取远程文件 |
//! | `ssh_write_file` | 写入远程文件 |
//! | `ssh_delete_file` | 删除远程文件 |
//! | `ssh_list_directory` | 列出远程目录 |
//! | `ssh_create_directory` | 创建远程目录 |
//! | `ssh_delete_directory` | 删除远程目录 |
//! | `ssh_exec` | 执行远程命令 |
//!
//! ## 契约层
//!
//! 所有 wire-format DTO 定义在 [`ydsz_shared::contracts::ssh`]，本模块只负责
//! IPC 命令处理和 DTO ↔ 内部类型（`ydsz_shared::ssh::*`）的转换。

use tauri::State;
use tracing::info;

use crate::ServerState;
use ydsz_shared::contracts::ssh::{
    SshConnectParams, SshConnectionState, SshConnectionStatusView, SshCreateDirectoryParams,
    SshDeleteDirectoryParams, SshWriteFileParams,
};
use ydsz_shared::ssh::{ConnectionState, RemoteFileSystem};

/// 把内部 `ConnectionState` 转换为契约层 `SshConnectionState`
fn to_state_view(state: ConnectionState) -> SshConnectionState {
    match state {
        ConnectionState::Disconnected => SshConnectionState::Disconnected,
        ConnectionState::Connecting => SshConnectionState::Connecting,
        ConnectionState::Connected => SshConnectionState::Connected,
        ConnectionState::Reconnecting => SshConnectionState::Reconnecting,
    }
}

/// 建立 SSH 连接
#[tauri::command]
#[specta::specta]
pub async fn ssh_connect(
    params: SshConnectParams,
    server: State<'_, ServerState>,
) -> Result<SshConnectionStatusView, String> {
    info!(
        host = %params.host,
        port = params.port,
        username = %params.username,
        "桌面端: 建立 SSH 连接"
    );

    let services = &server.bootstrap_result.services;
    let config = ydsz_shared::ssh::SshConfig {
        host: params.host.clone(),
        port: params.port,
        username: params.username.clone(),
        auth: match params.auth {
            ydsz_shared::contracts::ssh::SshAuthParams::Password { password } => {
                ydsz_shared::ssh::SshAuth::Password(password)
            }
            ydsz_shared::contracts::ssh::SshAuthParams::Key {
                key_path,
                passphrase,
            } => ydsz_shared::ssh::SshAuth::Key {
                key_path,
                passphrase,
            },
        },
        auto_reconnect: params.auto_reconnect,
        // P1-5: 透传主机密钥校验策略与 known_hosts 路径
        host_key_policy: match params.host_key_policy {
            ydsz_shared::contracts::ssh::SshHostKeyPolicy::AcceptAll => {
                ydsz_shared::ssh::HostKeyPolicy::AcceptAll
            }
            ydsz_shared::contracts::ssh::SshHostKeyPolicy::Strict => {
                ydsz_shared::ssh::HostKeyPolicy::Strict
            }
            ydsz_shared::contracts::ssh::SshHostKeyPolicy::AcceptNew => {
                ydsz_shared::ssh::HostKeyPolicy::AcceptNew
            }
        },
        known_hosts_path: params.known_hosts_path.map(std::path::PathBuf::from),
        ..Default::default()
    };

    let connection_id = services
        .ssh_pool
        .create_connection(config)
        .await
        .map_err(|e| e.to_string())?;

    let conn = services
        .ssh_pool
        .get(&connection_id)
        .await
        .map_err(|e| e.to_string())?;

    let config = conn.get_config().await;
    Ok(SshConnectionStatusView {
        state: to_state_view(conn.get_state().await),
        connection_id,
        host: config.host.clone(),
        port: config.port,
        username: config.username.clone(),
    })
}

/// 断开 SSH 连接
#[tauri::command]
#[specta::specta]
pub async fn ssh_disconnect(
    connection_id: String,
    server: State<'_, ServerState>,
) -> Result<(), String> {
    info!(connection_id = %connection_id, "桌面端: 断开 SSH 连接");
    let services = &server.bootstrap_result.services;
    services
        .ssh_pool
        .disconnect(&connection_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 获取连接状态
#[tauri::command]
#[specta::specta]
pub async fn ssh_get_status(
    connection_id: String,
    server: State<'_, ServerState>,
) -> Result<SshConnectionStatusView, String> {
    let services = &server.bootstrap_result.services;
    let conn = services
        .ssh_pool
        .get(&connection_id)
        .await
        .map_err(|e| e.to_string())?;

    let config = conn.get_config().await;
    Ok(SshConnectionStatusView {
        state: to_state_view(conn.get_state().await),
        connection_id,
        host: config.host.clone(),
        port: config.port,
        username: config.username.clone(),
    })
}

/// 列出所有连接
#[tauri::command]
#[specta::specta]
pub async fn ssh_list_connections(
    server: State<'_, ServerState>,
) -> Result<Vec<SshConnectionStatusView>, String> {
    let services = &server.bootstrap_result.services;
    let list = services.ssh_pool.list_connections().await;
    Ok(list
        .into_iter()
        .map(|info| SshConnectionStatusView {
            state: to_state_view(info.state),
            connection_id: info.connection_id,
            host: info.host,
            port: info.port,
            username: info.username,
        })
        .collect())
}

/// 读取远程文件
#[tauri::command]
#[specta::specta]
pub async fn ssh_read_file(
    connection_id: String,
    path: String,
    server: State<'_, ServerState>,
) -> Result<String, String> {
    let services = &server.bootstrap_result.services;
    let conn = services
        .ssh_pool
        .get(&connection_id)
        .await
        .map_err(|e| e.to_string())?;
    let fs = RemoteFileSystem::new(conn);
    fs.read_file(&path).await.map_err(|e| e.to_string())
}

/// 写入远程文件
#[tauri::command]
#[specta::specta]
pub async fn ssh_write_file(
    params: SshWriteFileParams,
    server: State<'_, ServerState>,
) -> Result<usize, String> {
    let services = &server.bootstrap_result.services;
    let conn = services
        .ssh_pool
        .get(&params.connection_id)
        .await
        .map_err(|e| e.to_string())?;
    let fs = RemoteFileSystem::new(conn);
    let bytes = params.content.len();
    fs.write_file(&params.path, &params.content, params.create_directories)
        .await
        .map_err(|e| e.to_string())?;
    Ok(bytes)
}

/// 删除远程文件
#[tauri::command]
#[specta::specta]
pub async fn ssh_delete_file(
    connection_id: String,
    path: String,
    server: State<'_, ServerState>,
) -> Result<(), String> {
    let services = &server.bootstrap_result.services;
    let conn = services
        .ssh_pool
        .get(&connection_id)
        .await
        .map_err(|e| e.to_string())?;
    let fs = RemoteFileSystem::new(conn);
    fs.delete_file(&path).await.map_err(|e| e.to_string())
}

/// 列出远程目录
#[tauri::command]
#[specta::specta]
pub async fn ssh_list_directory(
    connection_id: String,
    path: String,
    server: State<'_, ServerState>,
) -> Result<Vec<String>, String> {
    let services = &server.bootstrap_result.services;
    let conn = services
        .ssh_pool
        .get(&connection_id)
        .await
        .map_err(|e| e.to_string())?;
    let fs = RemoteFileSystem::new(conn);
    fs.list_directory(&path).await.map_err(|e| e.to_string())
}

/// 创建远程目录
#[tauri::command]
#[specta::specta]
pub async fn ssh_create_directory(
    params: SshCreateDirectoryParams,
    server: State<'_, ServerState>,
) -> Result<(), String> {
    let services = &server.bootstrap_result.services;
    let conn = services
        .ssh_pool
        .get(&params.connection_id)
        .await
        .map_err(|e| e.to_string())?;
    let fs = RemoteFileSystem::new(conn);
    fs.create_directory(&params.path, params.recursive)
        .await
        .map_err(|e| e.to_string())
}

/// 删除远程目录
#[tauri::command]
#[specta::specta]
pub async fn ssh_delete_directory(
    params: SshDeleteDirectoryParams,
    server: State<'_, ServerState>,
) -> Result<(), String> {
    let services = &server.bootstrap_result.services;
    let conn = services
        .ssh_pool
        .get(&params.connection_id)
        .await
        .map_err(|e| e.to_string())?;
    let fs = RemoteFileSystem::new(conn);
    fs.delete_directory(&params.path, params.recursive)
        .await
        .map_err(|e| e.to_string())
}

/// 执行远程命令
#[tauri::command]
#[specta::specta]
pub async fn ssh_exec(
    connection_id: String,
    command: String,
    server: State<'_, ServerState>,
) -> Result<String, String> {
    info!(
        connection_id = %connection_id,
        command = %command,
        "桌面端: 执行远程命令"
    );
    let services = &server.bootstrap_result.services;
    let conn = services
        .ssh_pool
        .get(&connection_id)
        .await
        .map_err(|e| e.to_string())?;
    let output = conn.execute_command(&command).await.map_err(|e| e.to_string())?;
    Ok(output.stdout)
}

/// 检测远程环境信息（P2-9）
#[tauri::command]
#[specta::specta]
pub async fn ssh_detect_environment(
    connection_id: String,
    server: State<'_, ServerState>,
) -> Result<serde_json::Value, String> {
    info!(
        connection_id = %connection_id,
        "桌面端: 检测远程环境信息"
    );
    let services = &server.bootstrap_result.services;
    let conn = services
        .ssh_pool
        .get(&connection_id)
        .await
        .map_err(|e| e.to_string())?;
    let info = conn
        .detect_environment()
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(info).map_err(|e| e.to_string())
}

/// 检测远程工具版本（P2-9）
#[tauri::command]
#[specta::specta]
pub async fn ssh_detect_tool_versions(
    connection_id: String,
    server: State<'_, ServerState>,
) -> Result<Vec<serde_json::Value>, String> {
    info!(
        connection_id = %connection_id,
        "桌面端: 检测远程工具版本"
    );
    let services = &server.bootstrap_result.services;
    let conn = services
        .ssh_pool
        .get(&connection_id)
        .await
        .map_err(|e| e.to_string())?;
    let versions = ydsz_shared::ssh::detect_tool_versions(conn.as_ref())
        .await
        .map_err(|e| e.to_string())?;
    versions
        .into_iter()
        .map(|v| serde_json::to_value(v).map_err(|e| e.to_string()))
        .collect()
}
