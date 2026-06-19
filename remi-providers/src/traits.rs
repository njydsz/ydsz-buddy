//! Provider 适配器 trait 定义。

use futures::Stream;
use remi_contracts::{
    ModelId, ProviderHealth, ProviderInfo, ProviderListCommandsInput,
    ProviderListCommandsOutput, ProviderName,
};
use remi_core::Result;
use serde_json::Value;
use std::pin::Pin;

/// Provider 适配器 trait。
///
/// 实现抽象了 Provider 特定的通信细节
/// （HTTP、stdio JSON-RPC、本地 SDK 等），并向编排层暴露统一接口。
#[async_trait::async_trait]
pub trait ProviderAdapter: Send + Sync {
    /// 获取 Provider 信息。
    fn info(&self) -> ProviderInfo;

    /// 检查 Provider 健康状态。
    async fn health(&self) -> Result<ProviderHealth>;

    /// 启动会话。
    async fn start_session(&self, model: &ModelId) -> Result<String>;

    /// 向会话发送消息。
    async fn send_message(&self, session_id: &str, message: &str) -> Result<Value>;

    /// 从会话流式获取响应。
    async fn stream_response(
        &self,
        session_id: &str,
        message: &str,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<String>> + Send>>>;

    /// 关闭会话。
    async fn close_session(&self, session_id: &str) -> Result<()>;

    /// 列出 Provider 原生的斜杠命令（例如 `/explain`、`/test`）。
    ///
    /// 默认实现返回空列表：仅支持 HTTP 的 Provider
    /// （Claude/Codex/Gemini/Grok）和大多数 stdio 适配器不暴露
    /// 它们自己的命令词汇表。Cursor 适配器和任何未来
    /// 暴露原生命令的 agent 应该重写此方法。
    async fn list_commands(
        &self,
        _input: ProviderListCommandsInput,
    ) -> Result<ProviderListCommandsOutput> {
        Ok(ProviderListCommandsOutput {
            commands: Vec::new(),
            source: Some(self.info().name.to_string()),
            cached: Some(false),
        })
    }

    /// 返回 Provider 名称（`info().name` 的快捷方式）。
    fn name(&self) -> ProviderName {
        self.info().name
    }
}
