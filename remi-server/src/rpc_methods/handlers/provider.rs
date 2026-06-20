//! Provider RPC 方法

use std::sync::Arc;

use remi_core::provider::ProviderKind;
use serde_json::Value;
use tracing::info;

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
        .register("provider.listProviders", move |_params: Option<Value>| {
            let provider_service = provider_service.clone();
            async move {
                let providers = provider_service.list_providers().await?;
                serde_json::to_value(providers)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // provider.getCapabilities
    let provider_service = services.provider_service.clone();
    router
        .register("provider.getCapabilities", move |params: Option<Value>| {
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

                let provider: ProviderKind = serde_json::from_str(provider_str)
                    .map_err(|e| crate::error::ServerError::InvalidParams(e.to_string()))?;

                let capabilities = provider_service.get_capabilities(provider).await?;
                serde_json::to_value(capabilities)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // provider.listModels
    let provider_service = services.provider_service.clone();
    router
        .register("provider.listModels", move |params: Option<Value>| {
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

                let provider: ProviderKind = serde_json::from_str(provider_str)
                    .map_err(|e| crate::error::ServerError::InvalidParams(e.to_string()))?;

                let models = provider_service.list_models(provider).await?;
                serde_json::to_value(models)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // provider.listAgents
    let provider_service = services.provider_service.clone();
    router
        .register("provider.listAgents", move |params: Option<Value>| {
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

                let provider: ProviderKind = serde_json::from_str(provider_str)
                    .map_err(|e| crate::error::ServerError::InvalidParams(e.to_string()))?;

                let agents = provider_service.list_agents(provider).await?;
                serde_json::to_value(agents)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // provider.refreshProviders
    let provider_service = services.provider_service.clone();
    router
        .register("provider.refreshProviders", move |_params: Option<Value>| {
            let provider_service = provider_service.clone();
            async move {
                provider_service.refresh_providers().await?;
                Ok(Value::Null)
            }
        })
        .await;

    // provider.listSkills
    let provider_service = services.provider_service.clone();
    router
        .register("provider.listSkills", move |params: Option<Value>| {
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

                let provider: ProviderKind = serde_json::from_str(provider_str)
                    .map_err(|e| crate::error::ServerError::InvalidParams(e.to_string()))?;

                let cwd = params
                    .get("cwd")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing cwd".to_string())
                    })?;

                let input = remi_core::provider::ProviderListSkillsInput {
                    provider,
                    cwd: cwd.to_string(),
                    thread_id: params.get("threadId").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    force_reload: params.get("forceReload").and_then(|v| v.as_bool()),
                };

                let adapter = provider_service.get_adapter(provider).await?;
                let result = adapter.list_skills(input).await?;
                serde_json::to_value(result)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // provider.listCommands
    let provider_service = services.provider_service.clone();
    router
        .register("provider.listCommands", move |params: Option<Value>| {
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

                let provider: ProviderKind = serde_json::from_str(provider_str)
                    .map_err(|e| crate::error::ServerError::InvalidParams(e.to_string()))?;

                let cwd = params
                    .get("cwd")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing cwd".to_string())
                    })?;

                let input = remi_core::provider::ProviderListCommandsInput {
                    provider,
                    cwd: cwd.to_string(),
                    thread_id: params.get("threadId").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    force_reload: params.get("forceReload").and_then(|v| v.as_bool()),
                };

                let adapter = provider_service.get_adapter(provider).await?;
                let result = adapter.list_commands(input).await?;
                serde_json::to_value(result)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // provider.listPlugins
    let provider_service = services.provider_service.clone();
    router
        .register("provider.listPlugins", move |params: Option<Value>| {
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

                let provider: ProviderKind = serde_json::from_str(provider_str)
                    .map_err(|e| crate::error::ServerError::InvalidParams(e.to_string()))?;

                let input = remi_core::provider::ProviderListPluginsInput {
                    provider,
                    cwd: params.get("cwd").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    force_remote_sync: params.get("forceRemoteSync").and_then(|v| v.as_bool()),
                    force_reload: params.get("forceReload").and_then(|v| v.as_bool()),
                };

                let adapter = provider_service.get_adapter(provider).await?;
                let result = adapter.list_plugins(input).await?;
                serde_json::to_value(result)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // provider.readPlugin
    let provider_service = services.provider_service.clone();
    router
        .register("provider.readPlugin", move |params: Option<Value>| {
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

                let provider: ProviderKind = serde_json::from_str(provider_str)
                    .map_err(|e| crate::error::ServerError::InvalidParams(e.to_string()))?;

                let marketplace_path = params
                    .get("marketplacePath")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing marketplacePath".to_string())
                    })?;

                let plugin_name = params
                    .get("pluginName")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing pluginName".to_string())
                    })?;

                let input = remi_core::provider::ProviderReadPluginInput {
                    provider,
                    marketplace_path: marketplace_path.to_string(),
                    plugin_name: plugin_name.to_string(),
                };

                let adapter = provider_service.get_adapter(provider).await?;
                let result = adapter.read_plugin(input).await?;
                serde_json::to_value(result)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // provider.getComposerCapabilities
    let provider_service = services.provider_service.clone();
    router
        .register("provider.getComposerCapabilities", move |params: Option<Value>| {
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

                let provider: ProviderKind = serde_json::from_str(provider_str)
                    .map_err(|e| crate::error::ServerError::InvalidParams(e.to_string()))?;

                let adapter = provider_service.get_adapter(provider).await?;
                let result = adapter.get_composer_capabilities().await?;
                serde_json::to_value(result)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // provider.compactThread
    let provider_service = services.provider_service.clone();
    router
        .register("provider.compactThread", move |params: Option<Value>| {
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

                let provider: ProviderKind = serde_json::from_str(provider_str)
                    .map_err(|e| crate::error::ServerError::InvalidParams(e.to_string()))?;

                let thread_id = params
                    .get("threadId")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing threadId".to_string())
                    })?;

                let adapter = provider_service.get_adapter(provider).await?;
                adapter.compact_thread(thread_id).await?;
                Ok(Value::Null)
            }
        })
        .await;

    info!("Provider RPC 方法注册完成");
}
