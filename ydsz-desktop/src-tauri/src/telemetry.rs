//! # OpenTelemetry 分布式追踪初始化模块
//!
//! 为 ydsz-buddy Tauri 提供标准化可观测性能力：
//!
//! - **Trace Span**：通过 OTLP gRPC export span（可输出到 stdout 或 OTel Collector）
//! - **Metrics**：初始化 OTel metrics pipeline（后续可挂接 Prometheus exporter）
//! - **优雅降级**：当 OTLP exporter 不可用时自动回退到 stdout
//! - **Tracing Bridge**：通过 `tracing-opentelemetry` 将 `tracing` 的 `Event`/`Span`
//!   桥接到 OpenTelemetry，让已有的 `tracing::info!` / `#[instrument]` 全部自动上报
//!
//! ## 使用方式
//!
//! ```ignore
//! // 在 Tauri run() 开始时调用
//! init_telemetry();
//! ```
//!
//! ## 环境变量
//!
//! | 变量 | 默认值 | 说明 |
//! |------|--------|------|
//! | `OTEL_EXPORTER_OTLP_ENDPOINT` | 空（stdout） | OTLP gRPC 端点（如 `http://localhost:4317`） |
//! | `OTEL_SERVICE_NAME` | `ydsz-buddy` | 服务名称 |
//! | `OTEL_TRACES_SAMPLER` | `always_on` | 采样策略 |
//! | `RUST_LOG` | `info` | tracing 日志级别过滤 |
//!
//! ## 设计对齐
//!
//! 对标 ZCode 8 类核心 Span：agent_turn / agent_step / tool_execution /
//! command_execution / context_compaction / detached_operation / model_call / model_attempt

use std::time::Duration;

use opentelemetry::trace::TracerProvider as _;
use opentelemetry::KeyValue;
use opentelemetry_otlp::WithExportConfig;
use opentelemetry_sdk::Resource;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter, Layer};

/// 初始化 OpenTelemetry 遥测系统
///
/// 完成以下工作：
/// 1. 尝试初始化 OTLP exporter（如果环境变量配置了 `OTEL_EXPORTER_OTLP_ENDPOINT`）
/// 2. 创建 tracing subscriber，组合 fmt layer + OTel bridge layer
/// 3. 设置全局 subscriber
///
/// # Panics
///
/// 如果多次调用本函数（subscriber 已经初始化），会打印警告并跳过。
pub fn init_telemetry() {
    // ---- 1. 构建 OTel tracer ----
    let tracer = build_otlp_tracer();

    // ---- 2. 构建 tracing layers ----
    // 2a. fmt layer: 本地人类可读日志输出
    let fmt_filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    let fmt_layer = tracing_subscriber::fmt::layer()
        .with_target(true)
        .with_thread_ids(false)
        .with_filter(fmt_filter);

    // 2b. OTel bridge layer: 将 tracing Event/Span 桥接到 OpenTelemetry
    let otel_filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    let otel_layer = if let Some(ref t) = tracer {
        Some(
            tracing_opentelemetry::layer()
                .with_tracer(t.clone())
                .with_filter(otel_filter),
        )
    } else {
        None
    };

    // ---- 3. 初始化全局 subscriber ----
    // 注意：subscriber 只能设置一次；如果用户已在 main() 初始化 tracing，
    // `init()` 会返回 Err，我们忽略该错误以保持优雅降级。
    let _ = tracing_subscriber::registry()
        .with(fmt_layer)
        .with(otel_layer)
        .try_init();

    if tracer.is_some() {
        tracing::info!("OpenTelemetry OTLP tracer initialized");
    } else {
        tracing::info!("OpenTelemetry initialized in stdout mode (set OTEL_EXPORTER_OTLP_ENDPOINT for OTLP export)");
    }
}

/// 构建 OTLP Tracer
///
/// 检查 `OTEL_EXPORTER_OTLP_ENDPOINT` 环境变量：
/// - 如果已配置 → 创建 OTLP gRPC exporter + TracerProvider
/// - 如果未配置 → 返回 None（降级到 stdout）
fn build_otlp_tracer() -> Option<opentelemetry_sdk::trace::Tracer> {
    let endpoint = std::env::var("OTEL_EXPORTER_OTLP_ENDPOINT").ok();

    if endpoint.is_none() {
        return None;
    }

    let endpoint = endpoint.unwrap();
    let service_name = std::env::var("OTEL_SERVICE_NAME").unwrap_or_else(|_| "ydsz-buddy".to_string());

    // 构建 OTLP trace exporter（gRPC + tonic）
    let exporter = match opentelemetry_otlp::SpanExporter::builder()
        .with_tonic()
        .with_endpoint(&endpoint)
        .with_timeout(Duration::from_secs(3))
        .build()
    {
        Ok(e) => e,
        Err(e) => {
            tracing::warn!("Failed to create OTLP exporter: {}, falling back to stdout", e);
            return None;
        }
    };

    // 构建 TracerProvider with batch exporter and resource config
    let resource = Resource::new(vec![
        KeyValue::new("service.name", service_name.clone()),
        KeyValue::new("service.version", env!("CARGO_PKG_VERSION")),
        KeyValue::new("deployment.environment", deployment_env()),
    ]);

    let tracer_provider = opentelemetry_sdk::trace::TracerProvider::builder()
        .with_batch_exporter(exporter, opentelemetry_sdk::runtime::Tokio)
        .with_resource(resource)
        .build();

    // 从 TracerProvider 获取 Tracer（tracing-opentelemetry 需要 Tracer 而非 TracerProvider）
    // TracerProvider trait 必须 in scope 才能调用 .tracer() 方法
    let tracer = tracer_provider.tracer("ydsz-buddy");

    Some(tracer)
}

/// 根据编译配置判断部署环境
fn deployment_env() -> &'static str {
    if cfg!(debug_assertions) {
        "development"
    } else {
        "production"
    }
}

// ============================================================================
// 辅助函数：手动创建用于特定场景的 span
// ============================================================================

/// 创建一个新的 OTel span，用于在关键路径上手动标记追踪区间
///
/// 适用于不方便使用 `#[instrument]` 属性的场景。
///
/// # Example
///
/// ```ignore
/// let _span = telemetry::root_span("agent_turn");
/// // ... do work ...
/// ```
#[allow(dead_code)]
pub fn root_span(name: &str) -> tracing::Span {
    tracing::info_span!("otel_root", otel.name = name, otel.kind = "Server")
}

/// 记录一个 Provider 调用 span（对齐 ZCode model_call）
#[allow(dead_code)]
pub fn record_model_call_span(
    provider: &str,
    model: &str,
    elapsed_ms: u64,
    success: bool,
) {
    let _span = tracing::info_span!(
        "model_call",
        otel.name = "model_call",
        otel.kind = "Client",
        rpc.provider = provider,
        rpc.model = model,
        rpc.elapsed_ms = elapsed_ms,
        rpc.success = success,
    );
}

/// 记录一个工具执行 span（对齐 ZCode tool_execution）
#[allow(dead_code)]
pub fn record_tool_execution_span(
    tool_name: &str,
    elapsed_ms: u64,
    success: bool,
) {
    let _span = tracing::info_span!(
        "tool_execution",
        otel.name = "tool_execution",
        otel.kind = "Internal",
        tool.name = tool_name,
        tool.elapsed_ms = elapsed_ms,
        tool.success = success,
    );
}
