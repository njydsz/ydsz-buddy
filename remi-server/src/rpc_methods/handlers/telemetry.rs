//! 遥测 RPC 方法

use std::sync::Arc;

use serde_json::Value;
use tracing::info;

use crate::rpc::RpcRouter;
use crate::rpc_methods::registration::ServiceContainer;

/// 注册遥测相关 RPC 方法
pub async fn register_telemetry_methods(
    router: Arc<RpcRouter>,
    services: Arc<ServiceContainer>,
) {
    info!("注册遥测 RPC 方法...");

    // telemetry.getUsageStats
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

    // telemetry.getEvents
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

    // telemetry.clearEvents
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

    // telemetry.getMetrics
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

    // telemetry.clearMetrics
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
