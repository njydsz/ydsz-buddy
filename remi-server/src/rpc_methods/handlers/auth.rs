//! Auth RPC 方法

use std::sync::Arc;

use remi_auth::ClientMetadata;
use serde_json::Value;
use tracing::info;

use crate::rpc::RpcRouter;
use crate::rpc_methods::registration::ServiceContainer;

/// 注册认证相关 RPC 方法
pub async fn register_auth_methods(
    router: Arc<RpcRouter>,
    services: Arc<ServiceContainer>,
) {
    info!("注册认证 RPC 方法...");

    // auth.exchangeBootstrapCredential
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

    // auth.issuePairingCredential
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

    // auth.issueWebsocketToken
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

    // auth.revokeSession
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

    info!("认证 RPC 方法注册完成");
}
