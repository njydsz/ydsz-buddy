//! 生命周期事件追踪模块，用于系统监控与调试。

use chrono::{DateTime, Utc};
use remi_core::{Error, Result};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use uuid::Uuid;

/// 生命周期事件管理器。
pub struct LifecycleManager {
    pool: SqlitePool,
}

/// 生命周期事件类型枚举。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LifecycleEventType {
    /// 系统启动。
    Startup,
    /// 系统关闭。
    Shutdown,
    /// 数据库已连接。
    DatabaseConnected,
    /// 数据库已断开。
    DatabaseDisconnected,
    /// 提供者已注册。
    ProviderRegistered,
    /// 提供者已注销。
    ProviderUnregistered,
    /// 会话已开始。
    SessionStarted,
    /// 会话已结束。
    SessionEnded,
    /// 配置已加载。
    ConfigLoaded,
    /// 配置已重新加载。
    ConfigReloaded,
    /// 发生错误。
    Error,
    /// 发生警告。
    Warning,
}

/// 生命周期事件记录。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LifecycleEvent {
    pub id: String,
    pub event_type: LifecycleEventType,
    pub payload: serde_json::Value,
    pub created_at: DateTime<Utc>,
}

impl LifecycleManager {
    /// 创建生命周期管理器实例。
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    /// 记录生命周期事件。
    pub async fn record(
        &self,
        event_type: LifecycleEventType,
        payload: serde_json::Value,
    ) -> Result<String> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let event_type_str = serde_json::to_string(&event_type)
            .map_err(|e| Error::Internal(format!("序列化事件类型失败: {}", e)))?;
        let payload_str = serde_json::to_string(&payload)
            .map_err(|e| Error::Internal(format!("序列化负载数据失败: {}", e)))?;

        sqlx::query(
            r#"
            INSERT INTO lifecycle_events (id, event_type, payload, created_at)
            VALUES (?, ?, ?, ?)
            "#,
        )
        .bind(&id)
        .bind(&event_type_str)
        .bind(&payload_str)
        .bind(&now)
        .execute(&self.pool)
        .await
        .map_err(|e| Error::Database(format!("记录生命周期事件失败: {}", e)))?;

        Ok(id)
    }

    /// 记录启动事件。
    pub async fn record_startup(&self, version: &str, config_summary: serde_json::Value) -> Result<String> {
        let payload = serde_json::json!({
            "version": version,
            "config": config_summary,
            "timestamp": Utc::now().to_rfc3339()
        });
        self.record(LifecycleEventType::Startup, payload).await
    }

    /// 记录关闭事件。
    pub async fn record_shutdown(&self, reason: &str) -> Result<String> {
        let payload = serde_json::json!({
            "reason": reason,
            "timestamp": Utc::now().to_rfc3339()
        });
        self.record(LifecycleEventType::Shutdown, payload).await
    }

    /// 记录数据库连接事件。
    pub async fn record_database_connected(&self, db_path: &str) -> Result<String> {
        let payload = serde_json::json!({
            "db_path": db_path,
            "timestamp": Utc::now().to_rfc3339()
        });
        self.record(LifecycleEventType::DatabaseConnected, payload).await
    }

    /// 记录提供者注册事件。
    pub async fn record_provider_registered(&self, provider_name: &str, models: &[String]) -> Result<String> {
        let payload = serde_json::json!({
            "provider": provider_name,
            "models": models,
            "timestamp": Utc::now().to_rfc3339()
        });
        self.record(LifecycleEventType::ProviderRegistered, payload).await
    }

    /// 记录错误事件。
    pub async fn record_error(&self, error_message: &str, context: serde_json::Value) -> Result<String> {
        let payload = serde_json::json!({
            "error": error_message,
            "context": context,
            "timestamp": Utc::now().to_rfc3339()
        });
        self.record(LifecycleEventType::Error, payload).await
    }

    /// 按类型获取事件。
    pub async fn get_by_type(
        &self,
        event_type: LifecycleEventType,
        limit: Option<usize>,
    ) -> Result<Vec<LifecycleEvent>> {
        let event_type_str = serde_json::to_string(&event_type)
            .map_err(|e| Error::Internal(format!("序列化事件类型失败: {}", e)))?;

        let limit = limit.unwrap_or(100);
        let rows: Vec<(String, String, String, String)> = sqlx::query_as(
            r#"
            SELECT id, event_type, payload, created_at
            FROM lifecycle_events
            WHERE event_type = ?
            ORDER BY created_at DESC
            LIMIT ?
            "#,
        )
        .bind(&event_type_str)
        .bind(limit as i64)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(format!("查询生命周期事件失败: {}", e)))?;

        let mut events = Vec::new();
        for (id, event_type_json, payload_json, created_at) in rows {
            let event_type: LifecycleEventType = serde_json::from_str(&event_type_json)
                .map_err(|e| Error::Internal(format!("反序列化事件类型失败: {}", e)))?;
            let payload: serde_json::Value = serde_json::from_str(&payload_json)
                .map_err(|e| Error::Internal(format!("反序列化负载数据失败: {}", e)))?;
            let created_at = DateTime::parse_from_rfc3339(&created_at)
                .map_err(|e| Error::Internal(format!("时间戳格式无效: {}", e)))?
                .with_timezone(&Utc);

            events.push(LifecycleEvent {
                id,
                event_type,
                payload,
                created_at,
            });
        }

        Ok(events)
    }

    /// 获取最近的事件。
    pub async fn get_recent(&self, limit: usize) -> Result<Vec<LifecycleEvent>> {
        let rows: Vec<(String, String, String, String)> = sqlx::query_as(
            r#"
            SELECT id, event_type, payload, created_at
            FROM lifecycle_events
            ORDER BY created_at DESC
            LIMIT ?
            "#,
        )
        .bind(limit as i64)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(format!("查询生命周期事件失败: {}", e)))?;

        let mut events = Vec::new();
        for (id, event_type_json, payload_json, created_at) in rows {
            let event_type: LifecycleEventType = serde_json::from_str(&event_type_json)
                .map_err(|e| Error::Internal(format!("反序列化事件类型失败: {}", e)))?;
            let payload: serde_json::Value = serde_json::from_str(&payload_json)
                .map_err(|e| Error::Internal(format!("反序列化负载数据失败: {}", e)))?;
            let created_at = DateTime::parse_from_rfc3339(&created_at)
                .map_err(|e| Error::Internal(format!("时间戳格式无效: {}", e)))?
                .with_timezone(&Utc);

            events.push(LifecycleEvent {
                id,
                event_type,
                payload,
                created_at,
            });
        }

        Ok(events)
    }

    /// 获取时间范围内的事件。
    pub async fn get_in_time_range(
        &self,
        start: DateTime<Utc>,
        end: DateTime<Utc>,
        limit: Option<usize>,
    ) -> Result<Vec<LifecycleEvent>> {
        let limit = limit.unwrap_or(1000);
        let rows: Vec<(String, String, String, String)> = sqlx::query_as(
            r#"
            SELECT id, event_type, payload, created_at
            FROM lifecycle_events
            WHERE created_at >= ? AND created_at <= ?
            ORDER BY created_at DESC
            LIMIT ?
            "#,
        )
        .bind(start.to_rfc3339())
        .bind(end.to_rfc3339())
        .bind(limit as i64)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(format!("查询生命周期事件失败: {}", e)))?;

        let mut events = Vec::new();
        for (id, event_type_json, payload_json, created_at) in rows {
            let event_type: LifecycleEventType = serde_json::from_str(&event_type_json)
                .map_err(|e| Error::Internal(format!("反序列化事件类型失败: {}", e)))?;
            let payload: serde_json::Value = serde_json::from_str(&payload_json)
                .map_err(|e| Error::Internal(format!("反序列化负载数据失败: {}", e)))?;
            let created_at = DateTime::parse_from_rfc3339(&created_at)
                .map_err(|e| Error::Internal(format!("时间戳格式无效: {}", e)))?
                .with_timezone(&Utc);

            events.push(LifecycleEvent {
                id,
                event_type,
                payload,
                created_at,
            });
        }

        Ok(events)
    }

    /// 清理旧事件。
    pub async fn cleanup_old_events(&self, older_than: DateTime<Utc>) -> Result<usize> {
        let result = sqlx::query(
            "DELETE FROM lifecycle_events WHERE created_at < ?",
        )
        .bind(older_than.to_rfc3339())
        .execute(&self.pool)
        .await
        .map_err(|e| Error::Database(format!("清理生命周期事件失败: {}", e)))?;

        Ok(result.rows_affected() as usize)
    }

    /// 按类型统计事件数量。
    pub async fn count_by_type(&self, event_type: LifecycleEventType) -> Result<usize> {
        let event_type_str = serde_json::to_string(&event_type)
            .map_err(|e| Error::Internal(format!("序列化事件类型失败: {}", e)))?;

        let row: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM lifecycle_events WHERE event_type = ?",
        )
        .bind(&event_type_str)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| Error::Database(format!("统计生命周期事件失败: {}", e)))?;

        Ok(row.0 as usize)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use remi_core::ServerConfig;
    use remi_persistence::Database;

    #[tokio::test]
    async fn test_lifecycle_manager() {
        let mut config = ServerConfig::default();
        let db_dir = std::env::temp_dir().join(format!("remi-auth-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&db_dir).expect("创建临时目录失败");
        config.db_path = db_dir.join("remi-code.db");

        let db = Database::connect(&config).await.expect("数据库连接失败");
        db.run_migrations().await.expect("数据库迁移失败");

        let manager = LifecycleManager::new(db.pool().clone());

        // 记录启动事件
        let id = manager
            .record_startup("0.1.0", serde_json::json!({"port": 3845}))
            .await
            .expect("记录启动事件失败");

        assert!(!id.is_empty());

        // 获取最近的事件
        let events = manager.get_recent(10).await.expect("获取最近事件失败");
        assert!(!events.is_empty());
        assert_eq!(events[0].event_type, LifecycleEventType::Startup);

        // 按类型获取事件
        let startup_events = manager
            .get_by_type(LifecycleEventType::Startup, Some(10))
            .await
            .expect("按类型获取事件失败");
        assert!(!startup_events.is_empty());

        // 记录错误事件
        manager
            .record_error("测试错误", serde_json::json!({"context": "test"}))
            .await
            .expect("记录错误事件失败");

        // 按类型统计事件数量
        let error_count = manager
            .count_by_type(LifecycleEventType::Error)
            .await
            .expect("统计事件数量失败");
        assert_eq!(error_count, 1);
    }
}
