//! 待审批请求投影仓库
//!
//! 管理 `projection_pending_approvals` 表的 CRUD 操作。

use async_trait::async_trait;
use remi_core::models::{ThreadId, TurnId};
use serde::{Deserialize, Serialize};

use crate::error::PersistenceResult;
use crate::sqlite_client::SqliteClient;

/// 待审批请求状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalStatus {
    Pending,
    Resolved,
}

/// 审批决策
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ApprovalDecision {
    Accept,
    AcceptForSession,
    Decline,
    Cancel,
}

/// 待审批请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingApproval {
    pub request_id: String,
    pub thread_id: ThreadId,
    pub turn_id: Option<TurnId>,
    pub status: ApprovalStatus,
    pub decision: Option<ApprovalDecision>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub resolved_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// 待审批请求仓库 trait
#[async_trait]
pub trait PendingApprovalRepository: Send + Sync {
    fn upsert(&self, approval: &PendingApproval) -> PersistenceResult<()>;
    fn list_by_thread_id(&self, thread_id: ThreadId) -> PersistenceResult<Vec<PendingApproval>>;
    fn get_by_request_id(&self, request_id: &str) -> PersistenceResult<Option<PendingApproval>>;
    fn delete_by_request_id(&self, request_id: &str) -> PersistenceResult<()>;
}

/// SQLite 待审批请求仓库实现
pub struct SqlitePendingApprovalRepository {
    client: SqliteClient,
}

impl SqlitePendingApprovalRepository {
    pub fn new(client: SqliteClient) -> Self {
        Self { client }
    }
}

impl PendingApprovalRepository for SqlitePendingApprovalRepository {
    fn upsert(&self, approval: &PendingApproval) -> PersistenceResult<()> {
        let status_str = match approval.status {
            ApprovalStatus::Pending => "pending",
            ApprovalStatus::Resolved => "resolved",
        };
        let decision_str = approval.decision.as_ref().map(|d| match d {
            ApprovalDecision::Accept => "accept",
            ApprovalDecision::AcceptForSession => "acceptForSession",
            ApprovalDecision::Decline => "decline",
            ApprovalDecision::Cancel => "cancel",
        });

        self.client.execute(
            "INSERT OR REPLACE INTO projection_pending_approvals
             (request_id, thread_id, turn_id, status, decision, created_at, resolved_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            &[
                &approval.request_id,
                &approval.thread_id.to_string(),
                &approval.turn_id.as_ref().map(|id| id.to_string()),
                &status_str,
                &decision_str,
                &approval.created_at.to_rfc3339(),
                &approval.resolved_at.as_ref().map(|d| d.to_rfc3339()),
            ],
        )?;
        Ok(())
    }

    fn list_by_thread_id(&self, thread_id: ThreadId) -> PersistenceResult<Vec<PendingApproval>> {
        let rows = self.client.query_map(
            "SELECT request_id, thread_id, turn_id, status, decision, created_at, resolved_at
             FROM projection_pending_approvals WHERE thread_id = ?1 ORDER BY created_at",
            &[&thread_id.to_string()],
            |row| {
                let request_id: String = row.get(0)?;
                let thread_id_str: String = row.get(1)?;
                let turn_id_str: Option<String> = row.get(2)?;
                let status_str: String = row.get(3)?;
                let decision_str: Option<String> = row.get(4)?;
                let created_at_str: String = row.get(5)?;
                let resolved_at_str: Option<String> = row.get(6)?;

                Ok((request_id, thread_id_str, turn_id_str, status_str, decision_str, created_at_str, resolved_at_str))
            },
        )?;

        rows.into_iter()
            .map(|(request_id, thread_id_str, turn_id_str, status_str, decision_str, created_at_str, resolved_at_str)| -> PersistenceResult<PendingApproval> {
                let thread_id = thread_id_str.parse::<uuid::Uuid>().map_err(|e| crate::error::PersistenceError::DatabaseError(e.to_string()))?;
                let turn_id = turn_id_str;
                let status = match status_str.as_str() {
                    "pending" => ApprovalStatus::Pending,
                    "resolved" => ApprovalStatus::Resolved,
                    _ => return Err(crate::error::PersistenceError::DatabaseError(format!("Invalid status: {}", status_str))),
                };
                let decision = decision_str.map(|s| match s.as_str() {
                    "accept" => Ok(ApprovalDecision::Accept),
                    "acceptForSession" => Ok(ApprovalDecision::AcceptForSession),
                    "decline" => Ok(ApprovalDecision::Decline),
                    "cancel" => Ok(ApprovalDecision::Cancel),
                    _ => Err(crate::error::PersistenceError::DatabaseError(format!("Invalid decision: {}", s))),
                }).transpose()?;
                let created_at = created_at_str.parse().map_err(|e| crate::error::PersistenceError::DatabaseError(e.to_string()))?;
                let resolved_at = resolved_at_str.map(|s| s.parse()).transpose().map_err(|e| crate::error::PersistenceError::DatabaseError(e.to_string()))?;

                Ok(PendingApproval {
                    request_id,
                    thread_id,
                    turn_id,
                    status,
                    decision,
                    created_at,
                    resolved_at,
                })
            })
            .collect()
    }

    fn get_by_request_id(&self, request_id: &str) -> PersistenceResult<Option<PendingApproval>> {
        let rows = self.client.query_map(
            "SELECT request_id, thread_id, turn_id, status, decision, created_at, resolved_at
             FROM projection_pending_approvals WHERE request_id = ?1",
            &[&request_id],
            |row| {
                let request_id: String = row.get(0)?;
                let thread_id_str: String = row.get(1)?;
                let turn_id_str: Option<String> = row.get(2)?;
                let status_str: String = row.get(3)?;
                let decision_str: Option<String> = row.get(4)?;
                let created_at_str: String = row.get(5)?;
                let resolved_at_str: Option<String> = row.get(6)?;

                Ok((request_id, thread_id_str, turn_id_str, status_str, decision_str, created_at_str, resolved_at_str))
            },
        )?;

        if rows.is_empty() {
            return Ok(None);
        }

        let (request_id, thread_id_str, turn_id_str, status_str, decision_str, created_at_str, resolved_at_str) = rows.into_iter().next().unwrap();
        let thread_id = thread_id_str.parse::<uuid::Uuid>().map_err(|e| crate::error::PersistenceError::DatabaseError(e.to_string()))?;
        let turn_id = turn_id_str;
        let status = match status_str.as_str() {
            "pending" => ApprovalStatus::Pending,
            "resolved" => ApprovalStatus::Resolved,
            _ => return Err(crate::error::PersistenceError::DatabaseError(format!("Invalid status: {}", status_str))),
        };
        let decision = decision_str.map(|s| match s.as_str() {
            "accept" => Ok(ApprovalDecision::Accept),
            "acceptForSession" => Ok(ApprovalDecision::AcceptForSession),
            "decline" => Ok(ApprovalDecision::Decline),
            "cancel" => Ok(ApprovalDecision::Cancel),
            _ => Err(crate::error::PersistenceError::DatabaseError(format!("Invalid decision: {}", s))),
        }).transpose()?;
        let created_at = created_at_str.parse().map_err(|e| crate::error::PersistenceError::DatabaseError(e.to_string()))?;
        let resolved_at = resolved_at_str.map(|s| s.parse()).transpose().map_err(|e| crate::error::PersistenceError::DatabaseError(e.to_string()))?;

        Ok(Some(PendingApproval {
            request_id,
            thread_id,
            turn_id,
            status,
            decision,
            created_at,
            resolved_at,
        }))
    }

    fn delete_by_request_id(&self, request_id: &str) -> PersistenceResult<()> {
        self.client.execute(
            "DELETE FROM projection_pending_approvals WHERE request_id = ?1",
            &[&request_id],
        )?;
        Ok(())
    }
}
