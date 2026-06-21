//! # 认证 RPC 方法模块
//!
//! 本模块注册所有与认证授权相关的 RPC 方法，包括引导凭证交换、
//! 配对凭证签发、WebSocket 令牌签发、会话管理和配对链接管理等。
//!
//! ## 注册的方法
//!
//! | 方法名 | 说明 |
//! |--------|------|
//! | `auth.exchangeBootstrapCredential` | 交换引导凭证为会话 |
//! | `auth.issuePairingCredential` | 签发配对凭证 |
//! | `auth.issueWebsocketToken` | 签发 WebSocket 连接令牌 |
//! | `auth.revokeSession` | 撤销指定会话 |
//! | `auth.listPairingLinks` | 列出所有配对链接 |
//! | `auth.revokePairingLink` | 撤销指定配对链接 |
//! | `auth.listClientSessions` | 列出所有客户端会话 |
//! | `auth.revokeOtherSessions` | 撤销除当前会话外的所有会话 |
//! | `auth.getDescriptor` | 获取认证描述符 |

use std::sync::Arc;

use remi_auth::ClientMetadata;
use serde_json::Value;
use tracing::info;

use crate::rpc::RpcRouter;
use crate::rpc_methods::registration::ServiceContainer;

/// 注册认证相关 RPC 方法
///
/// 将所有认证方法注册到路由器，每个方法绑定对应的服务实例。
///
/// # 参数
///
/// - `router`: RPC 路由器实例
/// - `services`: 服务容器，提供 AuthService 实例
pub async fn register_auth_methods(
    router: Arc<RpcRouter>,
    services: Arc<ServiceContainer>,
) {
    info!("注册认证 RPC 方法...");

    // auth.exchangeBootstrapCredential - 交换引导凭证为认证会话
    // 参数: { credential: string, clientMetadata?: ClientMetadata }
    // 返回: AuthenticatedSession
    let auth_service = services.auth_service.clone();
    router
        .register("auth.exchangeBootstrapCredential", move |params: Option<Value>| {
            let auth_service = auth_service.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let credential = params
                    .get("credential")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing credential".to_string())
                    })?;

                let client_metadata = params
                    .get("clientMetadata")
                    .map(|v| serde_json::from_value::<ClientMetadata>(v.clone()))
                    .transpose()
                    .map_err(|e| {
                        crate::error::ServerError::InvalidParams(format!(
                            "Invalid clientMetadata: {}",
                            e
                        ))
                    })?
                    .unwrap_or_else(|| ClientMetadata {
                        name: "unknown".to_string(),
                        version: None,
                        platform: None,
                    });

                let (session, _token) = auth_service
                    .exchange_bootstrap_credential(credential, client_metadata)
                    .await?;

                serde_json::to_value(session)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // auth.issuePairingCredential - 签发配对凭证，用于新设备配对
    // 参数: 无
    // 返回: PairingCredential
    let auth_service = services.auth_service.clone();
    router
        .register("auth.issuePairingCredential", move |_params: Option<Value>| {
            let auth_service = auth_service.clone();
            async move {
                let credential = auth_service.issue_pairing_credential(None).await?;
                serde_json::to_value(credential)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // auth.issueWebsocketToken - 签发 WebSocket 连接令牌
    // 参数: { sessionId: string }
    // 返回: WebsocketToken
    let auth_service = services.auth_service.clone();
    router
        .register("auth.issueWebsocketToken", move |params: Option<Value>| {
            let auth_service = auth_service.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let session_id = params
                    .get("sessionId")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing sessionId".to_string())
                    })?;

                // Create a minimal AuthenticatedSession for token issuance
                let session = remi_auth::AuthenticatedSession {
                    session_id: session_id.to_string(),
                    subject: String::new(),
                    method: remi_auth::SessionMethod::Bootstrap,
                    role: remi_auth::SessionRole::Client,
                    expires_at: None,
                };

                let token = auth_service.issue_websocket_token(&session).await?;
                serde_json::to_value(token)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // auth.revokeSession - 撤销指定会话
    // 参数: { sessionId: string }
    // 返回: null
    let auth_service = services.auth_service.clone();
    router
        .register("auth.revokeSession", move |params: Option<Value>| {
            let auth_service = auth_service.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let session_id = params
                    .get("sessionId")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing sessionId".to_string())
                    })?;

                auth_service.revoke_client_session("", session_id).await?;
                Ok(Value::Null)
            }
        })
        .await;

    // auth.listPairingLinks - 列出所有配对链接
    // 参数: 无
    // 返回: PairingLink[]
    let auth_service = services.auth_service.clone();
    router
        .register("auth.listPairingLinks", move |_params: Option<Value>| {
            let auth_service = auth_service.clone();
            async move {
                let links = auth_service.list_pairing_links().await?;
                serde_json::to_value(links)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // auth.revokePairingLink - 撤销指定配对链接
    // 参数: { id: string }
    // 返回: null
    let auth_service = services.auth_service.clone();
    router
        .register("auth.revokePairingLink", move |params: Option<Value>| {
            let auth_service = auth_service.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let id = params
                    .get("id")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing id".to_string())
                    })?;

                auth_service.revoke_pairing_link(id).await?;
                Ok(Value::Null)
            }
        })
        .await;

    // auth.listClientSessions - 列出所有客户端会话
    // 参数: { currentSessionId?: string }
    // 返回: ClientSession[]
    let auth_service = services.auth_service.clone();
    router
        .register("auth.listClientSessions", move |params: Option<Value>| {
            let auth_service = auth_service.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let current_session_id = params
                    .get("currentSessionId")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");

                let sessions = auth_service.list_client_sessions(current_session_id).await?;
                serde_json::to_value(sessions)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // auth.revokeOtherSessions - 撤销除当前会话外的所有会话
    // 参数: { currentSessionId: string }
    // 返回: { revokedCount: number }
    let auth_service = services.auth_service.clone();
    router
        .register("auth.revokeOtherSessions", move |params: Option<Value>| {
            let auth_service = auth_service.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let current_session_id = params
                    .get("currentSessionId")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing currentSessionId".to_string())
                    })?;

                let count = auth_service.revoke_other_client_sessions(current_session_id).await?;
                Ok(serde_json::json!({ "revokedCount": count }))
            }
        })
        .await;

    // auth.getDescriptor - 获取认证描述符，包含认证配置信息
    // 参数: 无
    // 返回: AuthDescriptor
    let auth_service = services.auth_service.clone();
    router
        .register("auth.getDescriptor", move |_params: Option<Value>| {
            let auth_service = auth_service.clone();
            async move {
                let descriptor = auth_service.get_descriptor().await?;
                serde_json::to_value(descriptor)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    info!("认证 RPC 方法注册完成");
}

