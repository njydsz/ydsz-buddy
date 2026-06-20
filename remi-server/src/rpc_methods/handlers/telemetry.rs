//! # 遥测 RPC 方法模块
//!
//! 本模块注册与遥测数据相关的 RPC 方法，包括使用统计查询、事件查询和清理、
//! 指标数据查询和清理等。
//!
//! ## 注册的方法
//!
//! | 方法名 | 说明 |
//! |--------|------|
//! | `telemetry.getUsageStats` | 获取使用统计数据 |
//! | `telemetry.getEvents` | 获取遥测事件列表 |
//! | `telemetry.clearEvents` | 清空遥测事件 |
//! | `telemetry.getMetrics` | 获取指标数据 |
//! | `telemetry.clearMetrics` | 清空指标数据 |

use std::sync::Arc;

use serde_json::Value;
use tracing::info;

use crate::rpc::RpcRouter;
use crate::rpc_methods::registration::ServiceContainer;

/// 注册遥测相关 RPC 方法
///
/// 将所有遥测方法注册到路由器，每个方法绑定对应的服务实例。
///
/// # 参数
///
/// - `router`: RPC 路由器实例
/// - `services`: 服务容器，提供 AnalyticsService 和 MetricsCollector 实例
pub async fn register_telemetry_methods(
    router: Arc<RpcRouter>,
    services: Arc<ServiceContainer>,
) {
    info!("注册遥测 RPC 方法...");

    // telemetry.getUsageStats - 获取使用统计数据
    // 参数: 无
    // 返回: UsageStats
    let analytics = services.analytics_service.clone();
    router
        .register("telemetry.getUsageStats", move |_params: Option<Value>| {
            let analytics = analytics.clone();
            async move {
                let stats = analytics.get_usage_stats().await?;
                serde_json::to_value(stats)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // telemetry.getEvents - 获取遥测事件列表
    // 参数: { limit?: number }
    // 返回: Event[]
    let analytics = services.analytics_service.clone();
    router
        .register("telemetry.getEvents", move |params: Option<Value>| {
            let analytics = analytics.clone();
            async move {
                let limit = params
                    .as_ref()
                    .and_then(|p| p.get("limit").and_then(|v| v.as_u64()))
                    .unwrap_or(100) as usize;

                let events = analytics.get_events(limit).await?;
                serde_json::to_value(events)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // telemetry.clearEvents - 清空遥测事件
    // 参数: 无
    // 返回: null
    let analytics = services.analytics_service.clone();
    router
        .register("telemetry.clearEvents", move |_params: Option<Value>| {
            let analytics = analytics.clone();
            async move {
                analytics.clear_events().await?;
                Ok(Value::Null)
            }
        })
        .await;

    // telemetry.getMetrics - 获取指标数据
    // 参数: 无
    // 返回: MetricsData
    let metrics = services.metrics_collector.clone();
    router
        .register("telemetry.getMetrics", move |_params: Option<Value>| {
            let metrics = metrics.clone();
            async move {
                let metrics_data = metrics.get_metrics().await?;
                serde_json::to_value(metrics_data)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // telemetry.clearMetrics - 清空指标数据
    // 参数: 无
    // 返回: null
    let metrics = services.metrics_collector.clone();
    router
        .register("telemetry.clearMetrics", move |_params: Option<Value>| {
            let metrics = metrics.clone();
            async move {
                metrics.clear().await?;
                Ok(Value::Null)
            }
        })
        .await;

    info!("遥测 RPC 方法注册完成");
}
