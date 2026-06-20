//! 编排命令收据仓库
//!
//! 管理 `orchestration_command_receipts` 表的 CRUD 操作。
//! 用于命令去重和状态跟踪。

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::error::PersistenceResult;
use crate::sqlite_client::SqliteClient;

/// 编排命令收据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandReceipt {
    pub command_id: String,
    pub aggregate_kind: String,
    pub aggregate_id: String,
    pub accepted_at: DateTime<Utc>,
    pub result_sequence: i64,
    pub status: String,
    pub error: Option<String>,
}

/// 编排命令收据仓库 trait
#[async_trait]
pub trait CommandReceiptRepository: Send + Sync {
    fn upsert(&self, receipt: &CommandReceipt) -> PersistenceResult<()>;
    fn get_by_command_id(&self, command_id: &str) -> PersistenceResult<Option<CommandReceipt>>;
}

/// SQLite 编排命令收据仓库实现
pub struct SqliteCommandReceiptRepository {
    client: SqliteClient,
}

impl SqliteCommandReceiptRepository {
    pub fn new(client: SqliteClient) -> Self {
        Self { client }
    }
}

impl CommandReceiptRepository for SqliteCommandReceiptRepository {
    fn upsert(&self, receipt: &CommandReceipt) -> PersistenceResult<()> {
        self.client.execute(
            "INSERT OR REPLACE INTO orchestration_command_receipts
             (command_id, aggregate_kind, aggregate_id, accepted_at, result_sequence, status, error)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            &[
                &receipt.command_id,
                &receipt.aggregate_kind,
                &receipt.aggregate_id,
                &receipt.accepted_at.to_rfc3339(),
                &receipt.result_sequence,
                &receipt.status,
                &receipt.error,
            ],
        )?;
        Ok(())
    }

    fn get_by_command_id(&self, command_id: &str) -> PersistenceResult<Option<CommandReceipt>> {
        let rows = self.client.query_map(
            "SELECT command_id, aggregate_kind, aggregate_id, accepted_at, result_sequence, status, error
             FROM orchestration_command_receipts
             WHERE command_id = ?1",
            &[&command_id],
            |row| {
                let command_id: String = row.get(0)?;
                let aggregate_kind: String = row.get(1)?;
                let aggregate_id: String = row.get(2)?;
                let accepted_at_str: String = row.get(3)?;
                let result_sequence: i64 = row.get(4)?;
                let status: String = row.get(5)?;
                let error: Option<String> = row.get(6)?;

                Ok((command_id, aggregate_kind, aggregate_id, accepted_at_str, result_sequence, status, error))
            },
        )?;

        let row = rows.into_iter().next();
        match row {
            Some((command_id, aggregate_kind, aggregate_id, accepted_at_str, result_sequence, status, error)) => {
                let accepted_at = accepted_at_str.parse().map_err(|_| rusqlite::Error::InvalidColumnIndex(3))?;

                Ok(Some(CommandReceipt {
                    command_id,
                    aggregate_kind,
                    aggregate_id,
                    accepted_at,
                    result_sequence,
                    status,
                    error,
                }))
            }
            None => Ok(None),
        }
    }
}
