//! Auth RPC 方法

use std::sync::Arc;

use remi_auth::AuthService;
use serde_json::Value;
use tracing::info;

use crate::error::ServerResult;
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
        .register("auth.exchangeBootstrapCredential", move |params| {
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

                let session = auth_service
                    .exchange_bootstrap_credential(credential)
                    .await?;

                serde_json::to_value(session)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // auth.issuePairingCredential
    let auth_service = services.auth_service.clone();
    router
        .register("auth.issuePairingCredential", move |params| {
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

                let credential = auth_service.issue_pairing_credential(session_id).await?;
                Ok(serde_json::json!({ "credential": credential }))
            }
        })
        .await;

    // auth.issueWebsocketToken
    let auth_service = services.auth_service.clone();
    router
        .register("auth.issueWebsocketToken", move |params| {
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

                let token = auth_service.issue_websocket_token(session_id).await?;
                Ok(serde_json::json!({ "token": token }))
            }
        })
        .await;

    // auth.revokeSession
    let auth_service = services.auth_service.clone();
    router
        .register("auth.revokeSession", move |params| {
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

                auth_service.revoke_session(session_id).await?;
                Ok(Value::Null)
            }
        })
        .await;

    info!("认证 RPC 方法注册完成");
}
