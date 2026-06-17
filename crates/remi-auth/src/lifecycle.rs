//! Lifecycle events tracking for system monitoring and debugging.

use chrono::{DateTime, Utc};
use remi_core::{Error, Result};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use uuid::Uuid;

/// Lifecycle event manager.
pub struct LifecycleManager {
    pool: SqlitePool,
}

/// Lifecycle event types.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LifecycleEventType {
    /// System startup.
    Startup,
    /// System shutdown.
    Shutdown,
    /// Database connected.
    DatabaseConnected,
    /// Database disconnected.
    DatabaseDisconnected,
    /// Provider registered.
    ProviderRegistered,
    /// Provider unregistered.
    ProviderUnregistered,
    /// Session started.
    SessionStarted,
    /// Session ended.
    SessionEnded,
    /// Configuration loaded.
    ConfigLoaded,
    /// Configuration reloaded.
    ConfigReloaded,
    /// Error occurred.
    Error,
    /// Warning occurred.
    Warning,
}

/// Lifecycle event record.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LifecycleEvent {
    pub id: String,
    pub event_type: LifecycleEventType,
    pub payload: serde_json::Value,
    pub created_at: DateTime<Utc>,
}

impl LifecycleManager {
    /// Create a new lifecycle manager.
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    /// Record a lifecycle event.
    pub async fn record(
        &self,
        event_type: LifecycleEventType,
        payload: serde_json::Value,
    ) -> Result<String> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let event_type_str = serde_json::to_string(&event_type)
            .map_err(|e| Error::Internal(format!("Failed to serialize event type: {}", e)))?;
        let payload_str = serde_json::to_string(&payload)
            .map_err(|e| Error::Internal(format!("Failed to serialize payload: {}", e)))?;

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
        .map_err(|e| Error::Database(format!("Failed to record lifecycle event: {}", e)))?;

        Ok(id)
    }

    /// Record startup event.
    pub async fn record_startup(&self, version: &str, config_summary: serde_json::Value) -> Result<String> {
        let payload = serde_json::json!({
            "version": version,
            "config": config_summary,
            "timestamp": Utc::now().to_rfc3339()
        });
        self.record(LifecycleEventType::Startup, payload).await
    }

    /// Record shutdown event.
    pub async fn record_shutdown(&self, reason: &str) -> Result<String> {
        let payload = serde_json::json!({
            "reason": reason,
            "timestamp": Utc::now().to_rfc3339()
        });
        self.record(LifecycleEventType::Shutdown, payload).await
    }

    /// Record database connected event.
    pub async fn record_database_connected(&self, db_path: &str) -> Result<String> {
        let payload = serde_json::json!({
            "db_path": db_path,
            "timestamp": Utc::now().to_rfc3339()
        });
        self.record(LifecycleEventType::DatabaseConnected, payload).await
    }

    /// Record provider registered event.
    pub async fn record_provider_registered(&self, provider_name: &str, models: &[String]) -> Result<String> {
        let payload = serde_json::json!({
            "provider": provider_name,
            "models": models,
            "timestamp": Utc::now().to_rfc3339()
        });
        self.record(LifecycleEventType::ProviderRegistered, payload).await
    }

    /// Record error event.
    pub async fn record_error(&self, error_message: &str, context: serde_json::Value) -> Result<String> {
        let payload = serde_json::json!({
            "error": error_message,
            "context": context,
            "timestamp": Utc::now().to_rfc3339()
        });
        self.record(LifecycleEventType::Error, payload).await
    }

    /// Get events by type.
    pub async fn get_by_type(
        &self,
        event_type: LifecycleEventType,
        limit: Option<usize>,
    ) -> Result<Vec<LifecycleEvent>> {
        let event_type_str = serde_json::to_string(&event_type)
            .map_err(|e| Error::Internal(format!("Failed to serialize event type: {}", e)))?;

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
        .map_err(|e| Error::Database(format!("Failed to query lifecycle events: {}", e)))?;

        let mut events = Vec::new();
        for (id, event_type_json, payload_json, created_at) in rows {
            let event_type: LifecycleEventType = serde_json::from_str(&event_type_json)
                .map_err(|e| Error::Internal(format!("Failed to deserialize event type: {}", e)))?;
            let payload: serde_json::Value = serde_json::from_str(&payload_json)
                .map_err(|e| Error::Internal(format!("Failed to deserialize payload: {}", e)))?;
            let created_at = DateTime::parse_from_rfc3339(&created_at)
                .map_err(|e| Error::Internal(format!("Invalid timestamp: {}", e)))?
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

    /// Get recent events.
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
        .map_err(|e| Error::Database(format!("Failed to query lifecycle events: {}", e)))?;

        let mut events = Vec::new();
        for (id, event_type_json, payload_json, created_at) in rows {
            let event_type: LifecycleEventType = serde_json::from_str(&event_type_json)
                .map_err(|e| Error::Internal(format!("Failed to deserialize event type: {}", e)))?;
            let payload: serde_json::Value = serde_json::from_str(&payload_json)
                .map_err(|e| Error::Internal(format!("Failed to deserialize payload: {}", e)))?;
            let created_at = DateTime::parse_from_rfc3339(&created_at)
                .map_err(|e| Error::Internal(format!("Invalid timestamp: {}", e)))?
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

    /// Get events in time range.
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
        .map_err(|e| Error::Database(format!("Failed to query lifecycle events: {}", e)))?;

        let mut events = Vec::new();
        for (id, event_type_json, payload_json, created_at) in rows {
            let event_type: LifecycleEventType = serde_json::from_str(&event_type_json)
                .map_err(|e| Error::Internal(format!("Failed to deserialize event type: {}", e)))?;
            let payload: serde_json::Value = serde_json::from_str(&payload_json)
                .map_err(|e| Error::Internal(format!("Failed to deserialize payload: {}", e)))?;
            let created_at = DateTime::parse_from_rfc3339(&created_at)
                .map_err(|e| Error::Internal(format!("Invalid timestamp: {}", e)))?
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

    /// Clean up old events.
    pub async fn cleanup_old_events(&self, older_than: DateTime<Utc>) -> Result<usize> {
        let result = sqlx::query(
            "DELETE FROM lifecycle_events WHERE created_at < ?",
        )
        .bind(older_than.to_rfc3339())
        .execute(&self.pool)
        .await
        .map_err(|e| Error::Database(format!("Failed to cleanup lifecycle events: {}", e)))?;

        Ok(result.rows_affected() as usize)
    }

    /// Get event count by type.
    pub async fn count_by_type(&self, event_type: LifecycleEventType) -> Result<usize> {
        let event_type_str = serde_json::to_string(&event_type)
            .map_err(|e| Error::Internal(format!("Failed to serialize event type: {}", e)))?;

        let row: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM lifecycle_events WHERE event_type = ?",
        )
        .bind(&event_type_str)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| Error::Database(format!("Failed to count lifecycle events: {}", e)))?;

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
        std::fs::create_dir_all(&db_dir).expect("Failed to create temp dir");
        config.db_path = db_dir.join("remi-code.db");

        let db = Database::connect(&config).await.expect("Failed to connect");
        db.run_migrations().await.expect("Failed to migrate");

        let manager = LifecycleManager::new(db.pool().clone());

        // Record startup event
        let id = manager
            .record_startup("0.1.0", serde_json::json!({"port": 3845}))
            .await
            .expect("Failed to record startup");

        assert!(!id.is_empty());

        // Get recent events
        let events = manager.get_recent(10).await.expect("Failed to get recent");
        assert!(!events.is_empty());
        assert_eq!(events[0].event_type, LifecycleEventType::Startup);

        // Get by type
        let startup_events = manager
            .get_by_type(LifecycleEventType::Startup, Some(10))
            .await
            .expect("Failed to get by type");
        assert!(!startup_events.is_empty());

        // Record error event
        manager
            .record_error("Test error", serde_json::json!({"context": "test"}))
            .await
            .expect("Failed to record error");

        // Count by type
        let error_count = manager
            .count_by_type(LifecycleEventType::Error)
            .await
            .expect("Failed to count");
        assert_eq!(error_count, 1);
    }
}
