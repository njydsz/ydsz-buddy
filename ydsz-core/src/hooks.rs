//! # 持久化 Hook 抽象（EventSink / ThreadSink）
//!
//! ydzz-core 定义抽象的写入 trait，由上层（ydsz-desktop / ydzs-server）提供
//! 具体实现（SqliteEventStore / ThreadStore 等），避免反向依赖 ydzz-shared。
//!
//! 这样 agent_loop 的 hook 默认实现可以透明地写入到存储——如果有注入，就写入；
//! 没有注入则 no-op（yds-core 自己测试时不写入任何东西）。

use async_trait::async_trait;
use serde_json::Value;

/// 异步事件写入抽象
#[async_trait]
pub trait EventSink: Send + Sync {
    /// 追加一个事件到存储
    async fn append_event(
        &self,
        event_type: &str,
        stream_id: &str,
        payload: &Value,
    ) -> crate::error::CoreResult<()>;
}

/// 异步线程消息写入抽象
#[async_trait]
pub trait ThreadSink: Send + Sync {
    /// 保存一条消息到线程
    async fn save_message(
        &self,
        thread_id: &str,
        turn_id: &str,
        role: &str,
        content: &str,
        tool_name: Option<&str>,
        sequence: u32,
    ) -> crate::error::CoreResult<()>;

    /// 保存 / 更新线程元数据
    async fn save_thread(
        &self,
        thread_id: &str,
        title: Option<&str>,
    ) -> crate::error::CoreResult<()>;
}
