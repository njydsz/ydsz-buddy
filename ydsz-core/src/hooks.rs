//! # 持久化 Hook 抽象（EventSink / ThreadSink）
//!
//! ydzz-core 定义抽象的写入 trait，由上层（ydsz-desktop / ydzs-server）提供
//! 具体实现（SqliteEventStore / ThreadStore 等），避免反向依赖 ydzz-shared。
//!
//! 这样 agent_loop 的 hook 默认实现可以透明地写入到存储——如果有注入，就写入；
//! 没有注入则 no-op（yds-core 自己测试时不写入任何东西）。

use serde_json::Value;
use std::future::Future;
use std::pin::Pin;

/// 异步事件写入抽象
pub trait EventSink: Send + Sync {
    /// 追加一个事件到存储
    fn append_event(
        &self,
        event_type: &str,
        stream_id: &str,
        payload: &Value,
    ) -> Pin<Box<dyn Future<Output = crate::error::CoreResult<()>> + Send + '_>>;
}

/// 异步线程消息写入抽象
pub trait ThreadSink: Send + Sync {
    /// 保存一条消息到线程
    fn save_message(
        &self,
        thread_id: &str,
        turn_id: &str,
        role: &str,
        content: &str,
        tool_name: Option<&str>,
        sequence: u32,
    ) -> Pin<Box<dyn Future<Output = crate::error::CoreResult<()>> + Send + '_>>;

    /// 保存 / 更新线程元数据
    fn save_thread(
        &self,
        thread_id: &str,
        title: Option<&str>,
    ) -> Pin<Box<dyn Future<Output = crate::error::CoreResult<()>> + Send + '_>>;
}
