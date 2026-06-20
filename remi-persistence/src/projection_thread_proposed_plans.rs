//! 线程提议计划投影仓库
//!
//! 管理 `projection_thread_proposed_plans` 表的 CRUD 操作。

use async_trait::async_trait;
use remi_core::models::{ThreadId, TurnId};
use serde::{Deserialize, Serialize};

use crate::error::PersistenceResult;
use crate::sqlite_client::SqliteClient;

/// 线程提议计划
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreadProposedPlan {
    pub plan_id: String,
    pub thread_id: ThreadId,
    pub turn_id: Option<TurnId>,
    pub plan_markdown: String,
    pub implemented_at: Option<chrono::DateTime<chrono::Utc>>,
    pub implementation_thread_id: Option<ThreadId>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

/// 线程提议计划仓库 trait
#[async_trait]
pub trait ThreadProposedPlanRepository: Send + Sync {
    fn upsert(&self, plan: &ThreadProposedPlan) -> PersistenceResult<()>;
    fn list_by_thread_id(&self, thread_id: ThreadId) -> PersistenceResult<Vec<ThreadProposedPlan>>;
    fn delete_by_thread_id(&self, thread_id: ThreadId) -> PersistenceResult<()>;
}

/// SQLite 线程提议计划仓库实现
pub struct SqliteThreadProposedPlanRepository {
    client: SqliteClient,
}

impl SqliteThreadProposedPlanRepository {
    pub fn new(client: SqliteClient) -> Self {
        Self { client }
    }
}

impl ThreadProposedPlanRepository for SqliteThreadProposedPlanRepository {
    fn upsert(&self, plan: &ThreadProposedPlan) -> PersistenceResult<()> {
        self.client.execute(
            "INSERT OR REPLACE INTO projection_thread_proposed_plans
             (plan_id, thread_id, turn_id, plan_markdown, implemented_at,
              implementation_thread_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            &[
                &plan.plan_id,
                &plan.thread_id.to_string(),
                &plan.turn_id.as_ref().map(|id| id.to_string()),
                &plan.plan_markdown,
                &plan.implemented_at.as_ref().map(|d| d.to_rfc3339()),
                &plan.implementation_thread_id.as_ref().map(|id| id.to_string()),
                &plan.created_at.to_rfc3339(),
                &plan.updated_at.to_rfc3339(),
            ],
        )?;
        Ok(())
    }

    fn list_by_thread_id(&self, thread_id: ThreadId) -> PersistenceResult<Vec<ThreadProposedPlan>> {
        let rows = self.client.query_map(
            "SELECT plan_id, thread_id, turn_id, plan_markdown, implemented_at,
                    implementation_thread_id, created_at, updated_at
             FROM projection_thread_proposed_plans
             WHERE thread_id = ?1
             ORDER BY created_at",
            &[&thread_id.to_string()],
            |row| {
                let plan_id: String = row.get(0)?;
                let thread_id_str: String = row.get(1)?;
                let turn_id_str: Option<String> = row.get(2)?;
                let plan_markdown: String = row.get(3)?;
                let implemented_at_str: Option<String> = row.get(4)?;
                let impl_thread_id_str: Option<String> = row.get(5)?;
                let created_at_str: String = row.get(6)?;
                let updated_at_str: String = row.get(7)?;

                Ok((plan_id, thread_id_str, turn_id_str, plan_markdown, implemented_at_str, impl_thread_id_str, created_at_str, updated_at_str))
            },
        )?;

        rows.into_iter()
            .map(|(plan_id, thread_id_str, turn_id_str, plan_markdown, implemented_at_str, impl_thread_id_str, created_at_str, updated_at_str)| -> PersistenceResult<ThreadProposedPlan> {
                let thread_id = thread_id_str.parse::<uuid::Uuid>().map_err(|e| crate::error::PersistenceError::DatabaseError(e.to_string()))?;
                let turn_id = turn_id_str;
                let implemented_at = implemented_at_str.map(|s| s.parse::<chrono::DateTime<chrono::Utc>>()).transpose().map_err(|e: chrono::ParseError| crate::error::PersistenceError::DatabaseError(e.to_string()))?;
                let implementation_thread_id = impl_thread_id_str.map(|s| s.parse::<uuid::Uuid>()).transpose().map_err(|e: uuid::Error| crate::error::PersistenceError::DatabaseError(e.to_string()))?;
                let created_at = created_at_str.parse::<chrono::DateTime<chrono::Utc>>().map_err(|e: chrono::ParseError| crate::error::PersistenceError::DatabaseError(e.to_string()))?;
                let updated_at = updated_at_str.parse::<chrono::DateTime<chrono::Utc>>().map_err(|e: chrono::ParseError| crate::error::PersistenceError::DatabaseError(e.to_string()))?;

                Ok(ThreadProposedPlan {
                    plan_id,
                    thread_id,
                    turn_id,
                    plan_markdown,
                    implemented_at,
                    implementation_thread_id,
                    created_at,
                    updated_at,
                })
            })
            .collect()
    }

    fn delete_by_thread_id(&self, thread_id: ThreadId) -> PersistenceResult<()> {
        self.client.execute(
            "DELETE FROM projection_thread_proposed_plans WHERE thread_id = ?1",
            &[&thread_id.to_string()],
        )?;
        Ok(())
    }
}
