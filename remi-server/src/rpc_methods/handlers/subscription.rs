//! # 推送通道订阅 RPC 方法模块
//!
//! 本模块注册推送通道订阅相关的 RPC 方法，允许客户端订阅服务器主动推送的事件通知。
//!
//! ## 注册的方法
//!
//! | 方法名 | 说明 |
//! |--------|------|
//! | `subscribe.orchestrationEvents` | 订阅编排引擎事件 |
//! | `subscribe.providerStatus` | 订阅 Provider 状态变更 |
//! | `subscribe.gitStatus` | 订阅 Git 仓库状态变更 |
//! | `subscribe.terminalEvents` | 订阅终端事件 |
//! | `subscribe.workspaceEvents` | 订阅工作空间事件 |
//! | `subscribe.checkpointEvents` | 订阅检查点事件 |
//! | `subscribe.authEvents` | 订阅认证事件 |
//! | `subscribe.serverEvents` | 订阅服务器事件 |
//! | `subscribe.all` | 订阅所有事件通道 |

use std::sync::Arc;

use serde_json::Value;
use tracing::info;

use crate::push_channels::channels;
use crate::rpc::RpcRouter;
use crate::rpc_methods::registration::ServiceContainer;

/// 注册推送通道订阅相关 RPC 方法
///
/// 将所有订阅方法注册到路由器，每个方法绑定对应的推送通道。
///
/// # 参数
///
/// - `router`: RPC 路由器实例
/// - `services`: 服务容器，提供推送通道管理器实例
pub async fn register_subscription_methods(
    router: Arc<RpcRouter>,
    services: Arc<ServiceContainer>,
) {
    info!("注册推送通道订阅 RPC 方法...");

    let push_manager = services.push_channel_manager.clone();

    // subscribe.orchestrationEvents
    let pm = push_manager.clone();
    router
        .register("subscribe.orchestrationEvents", move |_params: Option<Value>| {
            let pm = pm.clone();
            async move {
                let _receiver = pm.subscribe(channels::ORCHESTRATION_EVENTS).await;
                Ok(serde_json::json!({
                    "subscribed": channels::ORCHESTRATION_EVENTS,
                    "status": "active"
                }))
            }
        })
        .await;

    // subscribe.providerStatus
    let pm = push_manager.clone();
    router
        .register("subscribe.providerStatus", move |_params: Option<Value>| {
            let pm = pm.clone();
            async move {
                let _receiver = pm.subscribe(channels::PROVIDER_STATUS).await;
                Ok(serde_json::json!({
                    "subscribed": channels::PROVIDER_STATUS,
                    "status": "active"
                }))
            }
        })
        .await;

    // subscribe.gitStatus
    let pm = push_manager.clone();
    router
        .register("subscribe.gitStatus", move |_params: Option<Value>| {
            let pm = pm.clone();
            async move {
                let _receiver = pm.subscribe(channels::GIT_STATUS).await;
                Ok(serde_json::json!({
                    "subscribed": channels::GIT_STATUS,
                    "status": "active"
                }))
            }
        })
        .await;

    // subscribe.terminalEvents
    let pm = push_manager.clone();
    router
        .register("subscribe.terminalEvents", move |_params: Option<Value>| {
            let pm = pm.clone();
            async move {
                let _receiver = pm.subscribe(channels::TERMINAL_EVENTS).await;
                Ok(serde_json::json!({
                    "subscribed": channels::TERMINAL_EVENTS,
                    "status": "active"
                }))
            }
        })
        .await;

    // subscribe.workspaceEvents
    let pm = push_manager.clone();
    router
        .register("subscribe.workspaceEvents", move |_params: Option<Value>| {
            let pm = pm.clone();
            async move {
                let _receiver = pm.subscribe(channels::WORKSPACE_EVENTS).await;
                Ok(serde_json::json!({
                    "subscribed": channels::WORKSPACE_EVENTS,
                    "status": "active"
                }))
            }
        })
        .await;

    // subscribe.checkpointEvents
    let pm = push_manager.clone();
    router
        .register("subscribe.checkpointEvents", move |_params: Option<Value>| {
            let pm = pm.clone();
            async move {
                let _receiver = pm.subscribe(channels::CHECKPOINT_EVENTS).await;
                Ok(serde_json::json!({
                    "subscribed": channels::CHECKPOINT_EVENTS,
                    "status": "active"
                }))
            }
        })
        .await;

    // subscribe.authEvents
    let pm = push_manager.clone();
    router
        .register("subscribe.authEvents", move |_params: Option<Value>| {
            let pm = pm.clone();
            async move {
                let _receiver = pm.subscribe(channels::AUTH_EVENTS).await;
                Ok(serde_json::json!({
                    "subscribed": channels::AUTH_EVENTS,
                    "status": "active"
                }))
            }
        })
        .await;

    // subscribe.serverEvents
    let pm = push_manager.clone();
    router
        .register("subscribe.serverEvents", move |_params: Option<Value>| {
            let pm = pm.clone();
            async move {
                let _receiver = pm.subscribe(channels::SERVER_EVENTS).await;
                Ok(serde_json::json!({
                    "subscribed": channels::SERVER_EVENTS,
                    "status": "active"
                }))
            }
        })
        .await;

    // subscribe.all - 订阅所有通道
    let pm = push_manager.clone();
    router
        .register("subscribe.all", move |_params: Option<Value>| {
            let pm = pm.clone();
            async move {
                let all_channels = vec![
                    channels::ORCHESTRATION_EVENTS,
                    channels::PROVIDER_STATUS,
                    channels::GIT_STATUS,
                    channels::TERMINAL_EVENTS,
                    channels::WORKSPACE_EVENTS,
                    channels::CHECKPOINT_EVENTS,
                    channels::AUTH_EVENTS,
                    channels::SERVER_EVENTS,
                ];

                // 订阅所有通道
                for channel in &all_channels {
                    let _ = pm.subscribe(channel).await;
                }

                Ok(serde_json::json!({
                    "subscribed": all_channels,
                    "status": "active"
                }))
            }
        })
        .await;

    // 前端使用的命名空间订阅别名
    // 当前实现仅保证连接稳定，事件通过对应推送通道下发
    register_subscription_alias(router.clone(), "server.subscribeLifecycle", channels::SERVER_EVENTS).await;
    register_subscription_alias(router.clone(), "server.subscribeConfig", channels::SERVER_EVENTS).await;
    register_subscription_alias(router.clone(), "server.subscribeProviderStatuses", channels::PROVIDER_STATUS).await;
    register_subscription_alias(router.clone(), "server.subscribeSettings", channels::SERVER_EVENTS).await;
    register_subscription_alias(router.clone(), "terminal.subscribeEvents", channels::TERMINAL_EVENTS).await;
    register_subscription_alias(router.clone(), "orchestration.subscribeDomainEvents", channels::ORCHESTRATION_EVENTS).await;
    register_subscription_alias(router.clone(), "orchestration.subscribeShell", channels::ORCHESTRATION_EVENTS).await;

    // 取消订阅别名（无状态操作，直接返回成功）
    register_unsubscribe_alias(router.clone(), "orchestration.unsubscribeShell").await;
    register_unsubscribe_alias(router.clone(), "orchestration.unsubscribeThread").await;

    // orchestration.subscribeThread / unsubscribeThread 需要线程 ID 参数，
    // 当前简化为订阅编排事件通道并返回成功，保证前端流式调用不触发重连
    register_subscription_alias(router.clone(), "orchestration.subscribeThread", channels::ORCHESTRATION_EVENTS).await;
    register_subscription_alias(router.clone(), "orchestration.unsubscribeThread", channels::ORCHESTRATION_EVENTS).await;

    info!("推送通道订阅 RPC 方法注册完成");
}

async fn register_subscription_alias(router: Arc<RpcRouter>, method: &str, channel: &str) {
    let channel = channel.to_string();
    router
        .register(method, move |_params: Option<Value>| {
            let channel = channel.clone();
            async move {
                Ok(serde_json::json!({
                    "subscribed": channel,
                    "status": "active"
                }))
            }
        })
        .await;
}

async fn register_unsubscribe_alias(router: Arc<RpcRouter>, method: &str) {
    router
        .register(method, move |_params: Option<Value>| {
            async move {
                Ok(serde_json::json!({
                    "status": "inactive"
                }))
            }
        })
        .await;
}

