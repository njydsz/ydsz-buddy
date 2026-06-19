//! Provider RPC 方法

use std::sync::Arc;

use remi_provider::{ProviderKind, ProviderService};
use serde_json::Value;
use tracing::info;

use crate::error::ServerResult;
use crate::rpc::RpcRouter;
use crate::rpc_methods::registration::ServiceContainer;

/// 注册 Provider 相关 RPC 方法
pub async fn register_provider_methods(
    router: Arc<RpcRouter>,
    services: Arc<ServiceContainer>,
) {
    info!("注册 Provider RPC 方法...");

    // provider.listProviders
    let provider_service = services.provider_service.clone();
    router
        .register("provider.listProviders", move |_params| {
            let provider_service = provider_service.clone();
            async move {
                let providers = provider_service.list_providers().await;
                serde_json::to_value(providers)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // provider.getCapabilities
    let provider_service = services.provider_service.clone();
    router
        .register("provider.getCapabilities", move |params| {
            let provider_service = provider_service.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let provider_str = params
                    .get("provider")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing provider".to_string())
                    })?;

                let provider: ProviderKind = provider_str
                    .parse()
                    .map_err(|e| crate::error::ServerError::InvalidParams(e.to_string()))?;

                let capabilities = provider_service.get_capabilities(&provider).await?;
                serde_json::to_value(capabilities)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // provider.listModels
    let provider_service = services.provider_service.clone();
    router
        .register("provider.listModels", move |params| {
            let provider_service = provider_service.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let provider_str = params
                    .get("provider")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing provider".to_string())
                    })?;

                let provider: ProviderKind = provider_str
                    .parse()
                    .map_err(|e| crate::error::ServerError::InvalidParams(e.to_string()))?;

                let models = provider_service.list_models(&provider).await?;
                serde_json::to_value(models)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // provider.listAgents
    let provider_service = services.provider_service.clone();
    router
        .register("provider.listAgents", move |params| {
            let provider_service = provider_service.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let provider_str = params
                    .get("provider")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing provider".to_string())
                    })?;

                let provider: ProviderKind = provider_str
                    .parse()
                    .map_err(|e| crate::error::ServerError::InvalidParams(e.to_string()))?;

                let agents = provider_service.list_agents(&provider).await?;
                serde_json::to_value(agents)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // provider.refreshProviders
    let provider_service = services.provider_service.clone();
    router
        .register("provider.refreshProviders", move |_params| {
            let provider_service = provider_service.clone();
            async move {
                provider_service.refresh_providers().await?;
                Ok(Value::Null)
            }
        })
        .await;

    info!("Provider RPC 方法注册完成");
}
