//! 数据库迁移管理模块
//!
//! 本模块负责 SQLite 数据库的 Schema 管理和版本控制。
//! 迁移系统采用增量式更新策略，确保数据库结构随应用版本演进。
//!
//! # 核心功能
//!
//! - 定义数据库迁移脚本（包含建表、索引创建等 SQL 语句）
//! - 跟踪已应用的迁移版本，避免重复执行
//! - 提供幂等的迁移执行接口
//!
//! # 设计说明
//!
//! 迁移系统使用 `_migrations` 表记录已应用的迁移版本。
//! 每个迁移包含版本号、名称和 SQL 脚本，按版本号顺序执行。
//! 迁移执行是幂等的，多次调用 `run_migrations` 不会产生副作用。
//!
//! # 迁移历史
//!
//! 本迁移序列对齐 RemiClaw 的 37 个增量迁移，将最终 Schema 整合为
//! 更紧凑的迁移集。版本号从 1 开始，与 RemiClaw 迁移编号对应。

use crate::error::{PersistenceError, PersistenceResult};
use crate::sqlite_client::SqliteClient;

/// 数据库迁移定义
///
/// 表示单个数据库迁移的元数据和 SQL 脚本。
/// 迁移按版本号（`version`）升序执行，每个版本号必须唯一。
pub struct Migration {
    /// 迁移版本号，必须唯一且递增
    pub version: u32,
    /// 迁移名称，用于日志和调试
    pub name: &'static str,
    /// 迁移 SQL 脚本
    pub sql: &'static str,
}

/// 所有数据库迁移定义
///
/// 按版本号顺序排列的迁移列表，包含系统所需的所有数据库 Schema 变更。
/// 迁移对齐 RemiClaw 的 37 个增量迁移，整合为最终 Schema。
pub const MIGRATIONS: &[Migration] = &[
    // ── 001: 编排事件表（对齐 RemiClaw 001_OrchestrationEvents） ──
    Migration {
        version: 1,
        name: "001_orchestration_events",
        sql: r#"
            CREATE TABLE IF NOT EXISTS orchestration_events (
                sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id TEXT NOT NULL UNIQUE,
                aggregate_kind TEXT NOT NULL,
                stream_id TEXT NOT NULL,
                stream_version INTEGER NOT NULL,
                event_type TEXT NOT NULL,
                occurred_at TEXT NOT NULL,
                command_id TEXT,
                causation_event_id TEXT,
                correlation_id TEXT,
                actor_kind TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                metadata_json TEXT NOT NULL
            );

            CREATE UNIQUE INDEX IF NOT EXISTS idx_orch_events_stream_version
                ON orchestration_events(aggregate_kind, stream_id, stream_version);
            CREATE INDEX IF NOT EXISTS idx_orch_events_stream_sequence
                ON orchestration_events(aggregate_kind, stream_id, sequence);
            CREATE INDEX IF NOT EXISTS idx_orch_events_command_id
                ON orchestration_events(command_id);
            CREATE INDEX IF NOT EXISTS idx_orch_events_correlation_id
                ON orchestration_events(correlation_id);
        "#,
    },
    // ── 002: 命令收据表（对齐 RemiClaw 002_OrchestrationCommandReceipts） ──
    Migration {
        version: 2,
        name: "002_orchestration_command_receipts",
        sql: r#"
            CREATE TABLE IF NOT EXISTS orchestration_command_receipts (
                command_id TEXT PRIMARY KEY,
                aggregate_kind TEXT NOT NULL,
                aggregate_id TEXT NOT NULL,
                accepted_at TEXT NOT NULL,
                result_sequence INTEGER NOT NULL,
                status TEXT NOT NULL,
                error TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_orch_command_receipts_aggregate
                ON orchestration_command_receipts(aggregate_kind, aggregate_id);
            CREATE INDEX IF NOT EXISTS idx_orch_command_receipts_sequence
                ON orchestration_command_receipts(result_sequence);
        "#,
    },
    // ── 003: 检查点差异存储（对齐 RemiClaw 003_CheckpointDiffBlobs） ──
    Migration {
        version: 3,
        name: "003_checkpoint_diff_blobs",
        sql: r#"
            CREATE TABLE IF NOT EXISTS checkpoint_diff_blobs (
                thread_id TEXT NOT NULL,
                from_turn_count INTEGER NOT NULL,
                to_turn_count INTEGER NOT NULL,
                diff TEXT NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE (thread_id, from_turn_count, to_turn_count)
            );

            CREATE INDEX IF NOT EXISTS idx_checkpoint_diff_blobs_thread_to_turn
                ON checkpoint_diff_blobs(thread_id, to_turn_count);
        "#,
    },
    // ── 004: Provider 会话运行时（对齐 RemiClaw 004_ProviderSessionRuntime） ──
    Migration {
        version: 4,
        name: "004_provider_session_runtime",
        sql: r#"
            CREATE TABLE IF NOT EXISTS provider_session_runtime (
                thread_id TEXT PRIMARY KEY,
                provider_name TEXT NOT NULL,
                adapter_key TEXT NOT NULL,
                runtime_mode TEXT NOT NULL DEFAULT 'full-access',
                status TEXT NOT NULL,
                last_seen_at TEXT NOT NULL,
                resume_cursor_json TEXT,
                runtime_payload_json TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_provider_session_runtime_status
                ON provider_session_runtime(status);
            CREATE INDEX IF NOT EXISTS idx_provider_session_runtime_provider
                ON provider_session_runtime(provider_name);
        "#,
    },
    // ── 005: 投影表 - 项目（对齐 RemiClaw 005 + 028） ──
    Migration {
        version: 5,
        name: "005_projection_projects",
        sql: r#"
            CREATE TABLE IF NOT EXISTS projection_projects (
                project_id TEXT PRIMARY KEY,
                kind TEXT NOT NULL DEFAULT 'project',
                title TEXT NOT NULL,
                workspace_root TEXT NOT NULL,
                default_model_selection_json TEXT,
                scripts_json TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                deleted_at TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_projection_projects_updated_at
                ON projection_projects(updated_at);
        "#,
    },
    // ── 006: 投影表 - 线程（对齐 RemiClaw 005 + 010/012/017/019-026/029/031/033/036） ──
    Migration {
        version: 6,
        name: "006_projection_threads",
        sql: r#"
            CREATE TABLE IF NOT EXISTS projection_threads (
                thread_id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                title TEXT NOT NULL,
                model_selection TEXT NOT NULL,
                runtime_mode TEXT NOT NULL DEFAULT 'full-access',
                interaction_mode TEXT NOT NULL DEFAULT 'default',
                env_mode TEXT NOT NULL DEFAULT 'local',
                branch TEXT,
                worktree_path TEXT,
                associated_worktree TEXT,
                is_pinned INTEGER NOT NULL DEFAULT 0,
                parent_thread_id TEXT,
                subagent TEXT,
                fork_source_thread_id TEXT,
                sidechat_source_thread_id TEXT,
                last_known_pr TEXT,
                latest_turn TEXT,
                latest_user_message_at TEXT,
                has_pending_approvals INTEGER NOT NULL DEFAULT 0,
                has_pending_user_input INTEGER NOT NULL DEFAULT 0,
                has_actionable_proposed_plan INTEGER NOT NULL DEFAULT 0,
                messages TEXT NOT NULL DEFAULT '[]',
                proposed_plans TEXT NOT NULL DEFAULT '[]',
                activities TEXT NOT NULL DEFAULT '[]',
                checkpoints TEXT NOT NULL DEFAULT '[]',
                session TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                archived_at TEXT,
                deleted_at TEXT,
                handoff TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_projection_threads_project_id
                ON projection_threads(project_id);
            CREATE INDEX IF NOT EXISTS idx_projection_threads_parent_thread_id
                ON projection_threads(parent_thread_id);
        "#,
    },
    // ── 007: 投影表 - 线程消息（对齐 RemiClaw 005 + 007/017/018/030） ──
    Migration {
        version: 7,
        name: "007_projection_thread_messages",
        sql: r#"
            CREATE TABLE IF NOT EXISTS projection_thread_messages (
                message_id TEXT PRIMARY KEY,
                thread_id TEXT NOT NULL,
                turn_id TEXT,
                role TEXT NOT NULL,
                text TEXT NOT NULL,
                is_streaming INTEGER NOT NULL DEFAULT 0,
                attachments_json TEXT,
                source TEXT NOT NULL DEFAULT 'native',
                skills_json TEXT,
                mentions_json TEXT,
                dispatch_mode TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_projection_thread_messages_thread_created
                ON projection_thread_messages(thread_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_projection_thread_messages_thread_created_desc
                ON projection_thread_messages(thread_id, created_at DESC, message_id DESC);
        "#,
    },
    // ── 008: 投影表 - 线程活动（对齐 RemiClaw 005 + 008/037） ──
    Migration {
        version: 8,
        name: "008_projection_thread_activities",
        sql: r#"
            CREATE TABLE IF NOT EXISTS projection_thread_activities (
                activity_id TEXT PRIMARY KEY,
                thread_id TEXT NOT NULL,
                turn_id TEXT,
                tone TEXT NOT NULL,
                kind TEXT NOT NULL,
                summary TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                sequence INTEGER,
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_projection_thread_activities_thread_created
                ON projection_thread_activities(thread_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_projection_thread_activities_thread_sequence
                ON projection_thread_activities(thread_id, sequence);
            CREATE INDEX IF NOT EXISTS idx_projection_thread_activities_thread_rank_desc
                ON projection_thread_activities(
                    thread_id,
                    (CASE WHEN sequence IS NULL THEN 0 ELSE 1 END) DESC,
                    sequence DESC,
                    created_at DESC,
                    activity_id DESC
                );
        "#,
    },
    // ── 009: 投影表 - 线程会话（对齐 RemiClaw 005 + 006/009） ──
    Migration {
        version: 9,
        name: "009_projection_thread_sessions",
        sql: r#"
            CREATE TABLE IF NOT EXISTS projection_thread_sessions (
                thread_id TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                provider_name TEXT,
                provider_session_id TEXT,
                provider_thread_id TEXT,
                runtime_mode TEXT NOT NULL DEFAULT 'full-access',
                active_turn_id TEXT,
                last_error TEXT,
                updated_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_projection_thread_sessions_provider_session
                ON projection_thread_sessions(provider_session_id);
        "#,
    },
    // ── 010: 投影表 - 对话轮次（对齐 RemiClaw 005 + 015） ──
    Migration {
        version: 10,
        name: "010_projection_turns",
        sql: r#"
            CREATE TABLE IF NOT EXISTS projection_turns (
                row_id INTEGER PRIMARY KEY AUTOINCREMENT,
                thread_id TEXT NOT NULL,
                turn_id TEXT,
                pending_message_id TEXT,
                source_proposed_plan_thread_id TEXT,
                source_proposed_plan_id TEXT,
                assistant_message_id TEXT,
                state TEXT NOT NULL,
                requested_at TEXT NOT NULL,
                started_at TEXT,
                completed_at TEXT,
                checkpoint_turn_count INTEGER,
                checkpoint_ref TEXT,
                checkpoint_status TEXT,
                checkpoint_files_json TEXT NOT NULL DEFAULT '[]',
                UNIQUE (thread_id, turn_id),
                UNIQUE (thread_id, checkpoint_turn_count)
            );

            CREATE INDEX IF NOT EXISTS idx_projection_turns_thread_requested
                ON projection_turns(thread_id, requested_at);
            CREATE INDEX IF NOT EXISTS idx_projection_turns_thread_checkpoint_completed
                ON projection_turns(thread_id, checkpoint_turn_count, completed_at);
        "#,
    },
    // ── 011: 投影表 - 待审批请求（对齐 RemiClaw 005） ──
    Migration {
        version: 11,
        name: "011_projection_pending_approvals",
        sql: r#"
            CREATE TABLE IF NOT EXISTS projection_pending_approvals (
                request_id TEXT PRIMARY KEY,
                thread_id TEXT NOT NULL,
                turn_id TEXT,
                status TEXT NOT NULL,
                decision TEXT,
                created_at TEXT NOT NULL,
                resolved_at TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_projection_pending_approvals_thread_status
                ON projection_pending_approvals(thread_id, status);
        "#,
    },
    // ── 012: 投影表 - 提议计划（对齐 RemiClaw 013 + 014） ──
    Migration {
        version: 12,
        name: "012_projection_thread_proposed_plans",
        sql: r#"
            CREATE TABLE IF NOT EXISTS projection_thread_proposed_plans (
                plan_id TEXT PRIMARY KEY,
                thread_id TEXT NOT NULL,
                turn_id TEXT,
                plan_markdown TEXT NOT NULL,
                implemented_at TEXT,
                implementation_thread_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_projection_thread_proposed_plans_thread_created
                ON projection_thread_proposed_plans(thread_id, created_at);
        "#,
    },
    // ── 013: 投影状态跟踪表（对齐 RemiClaw 005） ──
    Migration {
        version: 13,
        name: "013_projection_state",
        sql: r#"
            CREATE TABLE IF NOT EXISTS projection_state (
                projector TEXT PRIMARY KEY,
                last_applied_sequence INTEGER NOT NULL,
                updated_at TEXT NOT NULL
            );
        "#,
    },
    // ── 014: 认证会话和配对链接（对齐 RemiClaw 034_AuthAccessManagement） ──
    Migration {
        version: 14,
        name: "014_auth_access_management",
        sql: r#"
            CREATE TABLE IF NOT EXISTS auth_sessions (
                session_id TEXT PRIMARY KEY,
                subject TEXT NOT NULL,
                role TEXT NOT NULL,
                method TEXT NOT NULL,
                client_label TEXT,
                client_ip_address TEXT,
                client_user_agent TEXT,
                client_device_type TEXT NOT NULL DEFAULT 'unknown',
                client_os TEXT,
                client_browser TEXT,
                issued_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                last_connected_at TEXT,
                revoked_at TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_auth_sessions_active
                ON auth_sessions(revoked_at, expires_at, issued_at);

            CREATE TABLE IF NOT EXISTS auth_pairing_links (
                id TEXT PRIMARY KEY,
                credential TEXT NOT NULL UNIQUE,
                method TEXT NOT NULL,
                role TEXT NOT NULL,
                subject TEXT NOT NULL,
                label TEXT,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                consumed_at TEXT,
                revoked_at TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_auth_pairing_links_active
                ON auth_pairing_links(revoked_at, consumed_at, expires_at);
        "#,
    },
    // ── 015: 检查点表 ──
    Migration {
        version: 15,
        name: "015_checkpoints",
        sql: r#"
            CREATE TABLE IF NOT EXISTS checkpoints (
                id TEXT PRIMARY KEY,
                thread_id TEXT NOT NULL,
                turn_id TEXT NOT NULL,
                git_ref TEXT NOT NULL,
                description TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (thread_id) REFERENCES projection_threads(thread_id)
            );

            CREATE INDEX IF NOT EXISTS idx_checkpoints_thread_id ON checkpoints(thread_id);
            CREATE INDEX IF NOT EXISTS idx_checkpoints_turn_id ON checkpoints(turn_id);
            CREATE INDEX IF NOT EXISTS idx_checkpoints_created_at ON checkpoints(created_at);
        "#,
    },
    // ── 016: 线程级额外列（对齐 RemiClaw 021/022/023/026/031）
    //   - associated_worktree_branch / associated_worktree_ref：worktree 详情
    //   - shell_summary：项目根终端标题的轻量缓存
    //   - create_branch_flow_completed：分支创建流程完成标志
    //   - archived_at：线程归档时间（projection_threads 上原本已有 archived_at，
    //     此处通过 ALTER 兜底老库，确保 NULL 语义统一）
    Migration {
        version: 16,
        name: "016_projection_threads_extras",
        sql: r#"
            ALTER TABLE projection_threads
                ADD COLUMN IF NOT EXISTS associated_worktree_branch TEXT;
            ALTER TABLE projection_threads
                ADD COLUMN IF NOT EXISTS associated_worktree_ref TEXT;
            ALTER TABLE projection_threads
                ADD COLUMN IF NOT EXISTS shell_summary TEXT;
            ALTER TABLE projection_threads
                ADD COLUMN IF NOT EXISTS create_branch_flow_completed INTEGER NOT NULL DEFAULT 0;
        "#,
    },
    // ── 017: 性能索引（对齐 RemiClaw 037 ProjectionSnapshotCapIndexes）
    //   - 列表页频繁按 updated_at / created_at 排序，需要降序索引
    //   - 快照读路径按 (project_id, updated_at DESC) 走索引
    Migration {
        version: 17,
        name: "017_projection_snapshot_indexes",
        sql: r#"
            CREATE INDEX IF NOT EXISTS idx_projection_threads_project_updated_desc
                ON projection_threads(project_id, updated_at DESC);
            CREATE INDEX IF NOT EXISTS idx_projection_threads_project_created_desc
                ON projection_threads(project_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_projection_projects_workspace_root
                ON projection_projects(workspace_root);
        "#,
    },
    // ── 018: 线程筛选索引（archived / pinned / subagent）
    //   - Sidebar 频繁过滤 archived=NULL and deleted_at=NULL
    //   - Pinned 列表 / Subagent 树需要按列快速定位
    Migration {
        version: 18,
        name: "018_projection_threads_filter_indexes",
        sql: r#"
            CREATE INDEX IF NOT EXISTS idx_projection_threads_archived_at
                ON projection_threads(archived_at);
            CREATE INDEX IF NOT EXISTS idx_projection_threads_pinned
                ON projection_threads(is_pinned);
            CREATE INDEX IF NOT EXISTS idx_projection_threads_subagent
                ON projection_threads(subagent);
            CREATE INDEX IF NOT EXISTS idx_projection_threads_last_known_pr
                ON projection_threads(last_known_pr);
        "#,
    },
    // ── 019: 消息查询增强索引（dispatch_mode / mentions / attachments）
    //   - Prompt 渲染时按 dispatch_mode 过滤
    //   - Mentions 反查（@提及跳转）
    Migration {
        version: 19,
        name: "019_projection_thread_messages_indexes",
        sql: r#"
            CREATE INDEX IF NOT EXISTS idx_projection_thread_messages_dispatch_mode
                ON projection_thread_messages(thread_id, dispatch_mode);
            CREATE INDEX IF NOT EXISTS idx_projection_thread_messages_turn_id
                ON projection_thread_messages(turn_id);
        "#,
    },
    // ── 020: Shell 摘要回填（对齐 RemiClaw 027 BackfillProjectionThreadShellSummary）
    //   - 已有线程没有 shell_summary 字段时统一回填 NULL，由 runtime 层异步计算
    //   - 使用 UPDATE 而非默认值，避免空串与 NULL 混淆
    Migration {
        version: 20,
        name: "020_backfill_projection_thread_shell_summary",
        sql: r#"
            UPDATE projection_threads
               SET shell_summary = NULL
             WHERE shell_summary IS NULL;
        "#,
    },
    // ── 021: 命令收据索引（编排对账 / 调试用）
    //   - command_id 主键已存在，再加 aggregate + sequence 联合索引便于对账
    Migration {
        version: 21,
        name: "021_orchestration_receipt_indexes",
        sql: r#"
            CREATE INDEX IF NOT EXISTS idx_orch_command_receipts_status
                ON orchestration_command_receipts(status, result_sequence);
        "#,
    },
    // ── 022: 会话恢复索引（Provider 重新挂载时按 provider_session_id / provider_thread_id 查找）
    Migration {
        version: 22,
        name: "022_projection_thread_sessions_recovery",
        sql: r#"
            CREATE INDEX IF NOT EXISTS idx_projection_thread_sessions_provider_thread
                ON projection_thread_sessions(provider_thread_id);
            CREATE INDEX IF NOT EXISTS idx_projection_thread_sessions_status
                ON projection_thread_sessions(status);
        "#,
    },
];

/// 运行所有未应用的数据库迁移
///
/// 执行所有尚未应用的迁移脚本，确保数据库 Schema 与当前代码版本一致。
/// 此函数是幂等的，多次调用不会产生副作用。
///
/// # 执行流程
///
/// 1. 创建迁移跟踪表 `_migrations`（如果不存在）
/// 2. 遍历 `MIGRATIONS` 列表中的每个迁移
/// 3. 检查迁移是否已应用（查询 `_migrations` 表）
/// 4. 如果未应用，执行迁移 SQL 并记录到 `_migrations` 表
///
/// # 参数
///
/// * `client` - SQLite 数据库客户端引用
///
/// # 返回值
///
/// 成功时返回 `Ok(())`，失败时返回 `PersistenceError`
///
/// # 注意
///
/// 迁移执行是事务性的，单个迁移失败会导致整个迁移过程中断。
/// 已应用的迁移不会重复执行，即使迁移脚本被修改。
pub fn run_migrations(client: &SqliteClient) -> PersistenceResult<()> {
    // 创建迁移跟踪表，记录已应用的迁移版本
    client.execute_batch(
        "CREATE TABLE IF NOT EXISTS _migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        )",
    )?;

    for migration in MIGRATIONS {
        // 检查此迁移是否已经应用过
        let applied: bool = client.query_row(
            "SELECT COUNT(*) > 0 FROM _migrations WHERE version = ?1",
            &[&migration.version],
            |row| row.get(0),
        )?;

        if !applied {
            tracing::info!(version = migration.version, name = migration.name, "应用迁移");

            client.execute_batch(migration.sql).map_err(|e| {
                PersistenceError::MigrationError(format!(
                    "迁移 {} ({}) 失败: {}",
                    migration.version, migration.name, e
                ))
            })?;

            client.execute(
                "INSERT INTO _migrations (version, name) VALUES (?1, ?2)",
                &[&migration.version, &migration.name],
            )?;
        }
    }

    Ok(())
}

/// 获取当前数据库的迁移版本
///
/// 查询已应用的最高迁移版本号。如果尚未执行任何迁移，返回 0。
pub fn get_current_version(client: &SqliteClient) -> PersistenceResult<u32> {
    let version: Option<u32> = client.query_row(
        "SELECT MAX(version) FROM _migrations",
        &[],
        |row| row.get(0),
    ).ok();

    Ok(version.unwrap_or(0))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_run_migrations() {
        let temp_dir = std::env::temp_dir().join("remi-test-migrations");
        let _ = std::fs::create_dir_all(&temp_dir);
        let db_path = temp_dir.join("test.sqlite");

        // 清理旧数据库
        let _ = std::fs::remove_file(&db_path);

        let client = SqliteClient::new(&db_path).unwrap();
        let result = run_migrations(&client);
        assert!(result.is_ok(), "迁移执行失败: {:?}", result.err());

        // 验证迁移版本
        let version = get_current_version(&client).unwrap();
        assert_eq!(version, MIGRATIONS.len() as u32);

        // 再次运行应该成功（幂等）
        let result = run_migrations(&client);
        assert!(result.is_ok(), "幂等迁移失败: {:?}", result.err());

        // 清理
        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}

