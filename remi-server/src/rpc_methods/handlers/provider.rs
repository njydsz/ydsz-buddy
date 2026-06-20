//! # Provider RPC 方法模块
//!
//! 本模块注册所有与 Provider（AI 模型提供者）相关的 RPC 方法，包括
//! Provider 列表查询、能力查询、模型/代理/技能/插件/命令管理等。
//!
//! ## 注册的方法
//!
//! | 方法名 | 说明 |
//! |--------|------|
//! | `provider.listProviders` | 列出所有可用的 Provider |
//! | `provider.getCapabilities` | 获取指定 Provider 的能力 |
//! | `provider.listModels` | 列出指定 Provider 支持的模型 |
//! | `provider.listAgents` | 列出指定 Provider 支持的代理 |
//! | `provider.refreshProviders` | 刷新 Provider 列表 |
//! | `provider.listSkills` | 列出指定 Provider 的技能 |
//! | `provider.listCommands` | 列出指定 Provider 的命令 |
//! | `provider.listPlugins` | 列出指定 Provider 的插件 |
//! | `provider.readPlugin` | 读取指定插件的详情 |
//! | `provider.getComposerCapabilities` | 获取 Composer 能力 |
//! | `provider.compactThread` | 压缩指定线程的上下文 |

use std::sync::Arc;

use remi_core::provider::ProviderKind;
use serde_json::Value;
use tracing::info;

use crate::rpc::RpcRouter;
use crate::rpc_methods::registration::ServiceContainer;

/// 注册 Provider 相关 RPC 方法
///
/// 将所有 Provider 方法注册到路由器，每个方法绑定对应的服务实例。
///
/// # 参数
///
/// - `router`: RPC 路由器实例
/// - `services`: 服务容器，提供 ProviderService 实例
pub async fn register_provider_methods(
    router: Arc<RpcRouter>,
    services: Arc<ServiceContainer>,
) {
    info!("注册 Provider RPC 方法...");

    // provider.listProviders - 列出所有可用的 Provider
    // 参数: 无
    // 返回: Provider[]
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

    // provider.getCapabilities - 获取指定 Provider 的能力
    // 参数: { provider: string }
    // 返回: Capabilities
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

    // provider.listModels - 列出指定 Provider 支持的模型
    // 参数: { provider: string }
    // 返回: Model[]
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

    // provider.listAgents - 列出指定 Provider 支持的代理
    // 参数: { provider: string }
    // 返回: Agent[]
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

    // provider.refreshProviders - 刷新 Provider 列表
    // 参数: 无
    // 返回: null
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

    // provider.listSkills - 列出指定 Provider 的技能
    // 参数: { provider: string, cwd: string, threadId?: string, forceReload?: boolean }
    // 返回: Skill[]
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

    // provider.listCommands - 列出指定 Provider 的命令
    // 参数: { provider: string, cwd: string, threadId?: string, forceReload?: boolean }
    // 返回: Command[]
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

    // provider.listPlugins - 列出指定 Provider 的插件
    // 参数: { provider: string, cwd?: string, forceRemoteSync?: boolean, forceReload?: boolean }
    // 返回: Plugin[]
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

    // provider.readPlugin - 读取指定插件的详情
    // 参数: { provider: string, marketplacePath: string, pluginName: string }
    // 返回: PluginDetail
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

    // provider.getComposerCapabilities - 获取 Composer 能力
    // 参数: { provider: string }
    // 返回: ComposerCapabilities
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

    // provider.compactThread - 压缩指定线程的上下文，减少 token 消耗
    // 参数: { provider: string, threadId: string }
    // 返回: null
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
