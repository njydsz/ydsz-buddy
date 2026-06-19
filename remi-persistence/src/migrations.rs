//! 数据库迁移。
//!
//! 全部 37 个迁移，从 Node/Effect 后端移植而来
//! （apps/server/src/persistence/Migrations/）。
//!
//! Schema 采用基于投影（projection）的设计：编排事件（orchestration events）
//! 是唯一数据源，`projection_*` 表是由 projector 在运行时维护的
//! 物化读模型。迁移负责创建这些读模型，并随时间演进其列和索引。

use remi_core::{Error, Result};
use sqlx::{Row, SqlitePool};
use tracing::info;

/// 幂等地执行所有数据库迁移。
pub async fn run_migrations(pool: &SqlitePool) -> Result<()> {
    info!("Running database migrations (37 total)");

    migration_001_orchestration_events(pool).await?;
    migration_002_orchestration_command_receipts(pool).await?;
    migration_003_checkpoint_diff_blobs(pool).await?;
    migration_004_provider_session_runtime(pool).await?;
    migration_005_projections(pool).await?;
    migration_006_projection_thread_session_runtime_mode_columns(pool).await?;
    migration_007_projection_thread_message_attachments(pool).await?;
    migration_008_projection_thread_activity_sequence(pool).await?;
    migration_009_provider_session_runtime_mode(pool).await?;
    migration_010_projection_threads_runtime_mode(pool).await?;
    migration_011_orchestration_thread_created_runtime_mode(pool).await?;
    migration_012_projection_threads_interaction_mode(pool).await?;
    migration_013_projection_thread_proposed_plans(pool).await?;
    migration_014_projection_thread_proposed_plan_implementation(pool).await?;
    migration_015_projection_turns_source_proposed_plan(pool).await?;
    migration_016_canonicalize_model_selections(pool).await?;
    migration_017_thread_handoff_metadata(pool).await?;
    migration_018_projection_thread_message_mentions(pool).await?;
    migration_019_projection_threads_env_mode(pool).await?;
    migration_020_projection_threads_fork_source(pool).await?;
    migration_021_projection_threads_associated_worktree(pool).await?;
    migration_022_projection_threads_associated_worktree_branch(pool).await?;
    migration_023_projection_threads_associated_worktree_ref(pool).await?;
    migration_024_projection_threads_archived_at(pool).await?;
    migration_025_projection_threads_subagents(pool).await?;
    migration_026_projection_thread_shell_summary(pool).await?;
    migration_027_backfill_projection_thread_shell_summary(pool).await?;
    migration_028_projection_projects_kind(pool).await?;
    migration_029_projection_threads_last_known_pr(pool).await?;
    migration_030_projection_thread_messages_dispatch_mode(pool).await?;
    migration_031_projection_threads_create_branch_flow_completed(pool).await?;
    migration_032_reconcile_legacy_schema_import(pool).await?;
    migration_033_projection_threads_sidechat_source(pool).await?;
    migration_034_auth_access_management(pool).await?;
    migration_035_normalize_legacy_model_selection_options(pool).await?;
    migration_036_projection_threads_pinned(pool).await?;
    migration_037_projection_snapshot_cap_indexes(pool).await?;

    info!("Database migrations completed successfully");
    Ok(())
}

/// 辅助函数：执行 SQL 语句，仅在允许时吞掉重复列错误。
async fn exec(pool: &SqlitePool, sql: &str) -> Result<()> {
    sqlx::query(sql)
        .execute(pool)
        .await
        .map(|_| ())
        .map_err(|e| Error::Database(format!("{sql}: {e}")))
}

/// 检查指定表中是否存在某列（幂等迁移辅助函数）。
async fn column_exists(pool: &SqlitePool, table: &str, column: &str) -> Result<bool> {
    let pragma = format!("PRAGMA table_info({table})");
    let rows = sqlx::query(&pragma).fetch_all(pool).await.map_err(|e| Error::Database(e.to_string()))?;
    for row in rows {
        let name: String = row.try_get("name").unwrap_or_default();
        if name == column {
            return Ok(true);
        }
    }
    Ok(false)
}

/// 条件性执行 ALTER TABLE ADD COLUMN，若列已存在则不执行任何操作。
async fn add_column_if_missing(pool: &SqlitePool, table: &str, column: &str, definition: &str) -> Result<bool> {
    if column_exists(pool, table, column).await? {
        return Ok(false);
    }
    let sql = format!("ALTER TABLE {table} ADD COLUMN {column} {definition}");
    exec(pool, &sql).await?;
    Ok(true)
}

// 001: 编排事件表
async fn migration_001_orchestration_events(pool: &SqlitePool) -> Result<()> {
    exec(
        pool,
        r#"
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
        )
        "#,
    )
    .await?;

    exec(
        pool,
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_orch_events_stream_version ON orchestration_events(aggregate_kind, stream_id, stream_version)",
    )
    .await?;
    exec(
        pool,
        "CREATE INDEX IF NOT EXISTS idx_orch_events_stream_sequence ON orchestration_events(aggregate_kind, stream_id, sequence)",
    )
    .await?;
    exec(
        pool,
        "CREATE INDEX IF NOT EXISTS idx_orch_events_command_id ON orchestration_events(command_id)",
    )
    .await?;
    exec(
        pool,
        "CREATE INDEX IF NOT EXISTS idx_orch_events_correlation_id ON orchestration_events(correlation_id)",
    )
    .await?;
    Ok(())
}

// 002: 编排命令回执表
async fn migration_002_orchestration_command_receipts(pool: &SqlitePool) -> Result<()> {
    exec(
        pool,
        r#"
        CREATE TABLE IF NOT EXISTS orchestration_command_receipts (
            command_id TEXT PRIMARY KEY,
            aggregate_kind TEXT NOT NULL,
            aggregate_id TEXT NOT NULL,
            accepted_at TEXT NOT NULL,
            result_sequence INTEGER NOT NULL,
            status TEXT NOT NULL,
            error TEXT
        )
        "#,
    )
    .await?;
    exec(
        pool,
        "CREATE INDEX IF NOT EXISTS idx_orch_command_receipts_aggregate ON orchestration_command_receipts(aggregate_kind, aggregate_id)",
    )
    .await?;
    exec(
        pool,
        "CREATE INDEX IF NOT EXISTS idx_orch_command_receipts_sequence ON orchestration_command_receipts(result_sequence)",
    )
    .await?;
    Ok(())
}

// 003: 检查点差异数据块表
async fn migration_003_checkpoint_diff_blobs(pool: &SqlitePool) -> Result<()> {
    exec(
        pool,
        r#"
        CREATE TABLE IF NOT EXISTS checkpoint_diff_blobs (
            thread_id TEXT NOT NULL,
            from_turn_count INTEGER NOT NULL,
            to_turn_count INTEGER NOT NULL,
            diff TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE (thread_id, from_turn_count, to_turn_count)
        )
        "#,
    )
    .await?;
    exec(
        pool,
        "CREATE INDEX IF NOT EXISTS idx_checkpoint_diff_blobs_thread_to_turn ON checkpoint_diff_blobs(thread_id, to_turn_count)",
    )
    .await?;
    Ok(())
}

// 004: Provider 会话运行时表
async fn migration_004_provider_session_runtime(pool: &SqlitePool) -> Result<()> {
    exec(
        pool,
        r#"
        CREATE TABLE IF NOT EXISTS provider_session_runtime (
            thread_id TEXT PRIMARY KEY,
            provider_name TEXT NOT NULL,
            adapter_key TEXT NOT NULL,
            runtime_mode TEXT NOT NULL DEFAULT 'full-access',
            status TEXT NOT NULL,
            last_seen_at TEXT NOT NULL,
            resume_cursor_json TEXT,
            runtime_payload_json TEXT
        )
        "#,
    )
    .await?;
    exec(
        pool,
        "CREATE INDEX IF NOT EXISTS idx_provider_session_runtime_status ON provider_session_runtime(status)",
    )
    .await?;
    exec(
        pool,
        "CREATE INDEX IF NOT EXISTS idx_provider_session_runtime_provider ON provider_session_runtime(provider_name)",
    )
    .await?;
    Ok(())
}

// 005: 投影表（含密钥存储、生命周期事件、设置、项目、线程、消息、活动、会话、轮次、待审批、投影状态）
async fn migration_005_projections(pool: &SqlitePool) -> Result<()> {
    // Remi Code 专用密钥存储（与投影表共存）
    exec(
        pool,
        r#"
        CREATE TABLE IF NOT EXISTS secrets (
            id TEXT PRIMARY KEY,
            key TEXT NOT NULL UNIQUE,
            encrypted_value BLOB NOT NULL,
            nonce BLOB NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            expires_at TEXT
        )
        "#,
    )
    .await?;
    exec(
        pool,
        "CREATE INDEX IF NOT EXISTS idx_secrets_key ON secrets(key)",
    )
    .await?;

    // 生命周期事件
    exec(
        pool,
        r#"
        CREATE TABLE IF NOT EXISTS lifecycle_events (
            id TEXT PRIMARY KEY,
            event_type TEXT NOT NULL,
            payload TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        "#,
    )
    .await?;
    exec(
        pool,
        "CREATE INDEX IF NOT EXISTS idx_lifecycle_events_type ON lifecycle_events(event_type)",
    )
    .await?;
    exec(
        pool,
        "CREATE INDEX IF NOT EXISTS idx_lifecycle_events_created_at ON lifecycle_events(created_at)",
    )
    .await?;

    // 设置表
    exec(
        pool,
        r#"
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        "#,
    )
    .await?;

    // 服务器设置的通用键值表
    exec(
        pool,
        r#"
        CREATE TABLE IF NOT EXISTS projection_projects (
            project_id TEXT PRIMARY KEY,
            kind TEXT NOT NULL DEFAULT 'project',
            title TEXT NOT NULL,
            workspace_root TEXT NOT NULL,
            default_model TEXT,
            scripts_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT
        )
        "#,
    )
    .await?;
    exec(
        pool,
        r#"
        CREATE TABLE IF NOT EXISTS projection_threads (
            thread_id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            title TEXT NOT NULL,
            model TEXT NOT NULL,
            branch TEXT,
            worktree_path TEXT,
            latest_turn_id TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT
        )
        "#,
    )
    .await?;
    exec(
        pool,
        r#"
        CREATE TABLE IF NOT EXISTS projection_thread_messages (
            message_id TEXT PRIMARY KEY,
            thread_id TEXT NOT NULL,
            turn_id TEXT,
            role TEXT NOT NULL,
            text TEXT NOT NULL,
            is_streaming INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        "#,
    )
    .await?;
    exec(
        pool,
        r#"
        CREATE TABLE IF NOT EXISTS projection_thread_activities (
            activity_id TEXT PRIMARY KEY,
            thread_id TEXT NOT NULL,
            turn_id TEXT,
            tone TEXT NOT NULL,
            kind TEXT NOT NULL,
            summary TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        "#,
    )
    .await?;
    exec(
        pool,
        r#"
        CREATE TABLE IF NOT EXISTS projection_thread_sessions (
            thread_id TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            provider_name TEXT,
            provider_session_id TEXT,
            provider_thread_id TEXT,
            active_turn_id TEXT,
            last_error TEXT,
            updated_at TEXT NOT NULL
        )
        "#,
    )
    .await?;
    exec(
        pool,
        r#"
        CREATE TABLE IF NOT EXISTS projection_turns (
            row_id INTEGER PRIMARY KEY AUTOINCREMENT,
            thread_id TEXT NOT NULL,
            turn_id TEXT,
            pending_message_id TEXT,
            assistant_message_id TEXT,
            state TEXT NOT NULL,
            requested_at TEXT NOT NULL,
            started_at TEXT,
            completed_at TEXT,
            checkpoint_turn_count INTEGER,
            checkpoint_ref TEXT,
            checkpoint_status TEXT,
            checkpoint_files_json TEXT NOT NULL,
            UNIQUE (thread_id, turn_id),
            UNIQUE (thread_id, checkpoint_turn_count)
        )
        "#,
    )
    .await?;
    exec(
        pool,
        r#"
        CREATE TABLE IF NOT EXISTS projection_pending_approvals (
            request_id TEXT PRIMARY KEY,
            thread_id TEXT NOT NULL,
            turn_id TEXT,
            status TEXT NOT NULL,
            decision TEXT,
            created_at TEXT NOT NULL,
            resolved_at TEXT
        )
        "#,
    )
    .await?;
    exec(
        pool,
        r#"
        CREATE TABLE IF NOT EXISTS projection_state (
            projector TEXT PRIMARY KEY,
            last_applied_sequence INTEGER NOT NULL,
            updated_at TEXT NOT NULL
        )
        "#,
    )
    .await?;

    exec(
        pool,
        "CREATE INDEX IF NOT EXISTS idx_projection_projects_updated_at ON projection_projects(updated_at)",
    )
    .await?;
    exec(
        pool,
        "CREATE INDEX IF NOT EXISTS idx_projection_threads_project_id ON projection_threads(project_id)",
    )
    .await?;
    exec(
        pool,
        "CREATE INDEX IF NOT EXISTS idx_projection_thread_messages_thread_created ON projection_thread_messages(thread_id, created_at)",
    )
    .await?;
    exec(
        pool,
        "CREATE INDEX IF NOT EXISTS idx_projection_thread_activities_thread_created ON projection_thread_activities(thread_id, created_at)",
    )
    .await?;
    exec(
        pool,
        "CREATE INDEX IF NOT EXISTS idx_projection_thread_sessions_provider_session ON projection_thread_sessions(provider_session_id)",
    )
    .await?;
    exec(
        pool,
        "CREATE INDEX IF NOT EXISTS idx_projection_turns_thread_requested ON projection_turns(thread_id, requested_at)",
    )
    .await?;
    exec(
        pool,
        "CREATE INDEX IF NOT EXISTS idx_projection_turns_thread_checkpoint_completed ON projection_turns(thread_id, checkpoint_turn_count, completed_at)",
    )
    .await?;
    exec(
        pool,
        "CREATE INDEX IF NOT EXISTS idx_projection_pending_approvals_thread_status ON projection_pending_approvals(thread_id, status)",
    )
    .await?;
    Ok(())
}

// 006: 投影线程会话运行时模式列
async fn migration_006_projection_thread_session_runtime_mode_columns(pool: &SqlitePool) -> Result<()> {
    let added = add_column_if_missing(
        pool,
        "projection_thread_sessions",
        "runtime_mode",
        "TEXT NOT NULL DEFAULT 'full-access'",
    )
    .await?;
    if added {
        exec(
            pool,
            "UPDATE projection_thread_sessions SET runtime_mode = 'full-access' WHERE runtime_mode IS NULL",
        )
        .await?;
    }
    Ok(())
}

// 007: 投影线程消息附件
async fn migration_007_projection_thread_message_attachments(pool: &SqlitePool) -> Result<()> {
    add_column_if_missing(pool, "projection_thread_messages", "attachments_json", "TEXT").await?;
    Ok(())
}

// 008: 投影线程活动序列
async fn migration_008_projection_thread_activity_sequence(pool: &SqlitePool) -> Result<()> {
    add_column_if_missing(pool, "projection_thread_activities", "sequence", "INTEGER").await?;
    exec(
        pool,
        "CREATE INDEX IF NOT EXISTS idx_projection_thread_activities_thread_sequence ON projection_thread_activities(thread_id, sequence)",
    )
    .await?;
    Ok(())
}

// 009: Provider 会话运行时模式（无操作，runtime_mode 已在 004 中添加）
async fn migration_009_provider_session_runtime_mode(_pool: &SqlitePool) -> Result<()> {
    Ok(())
}

// 010: 投影线程运行时模式
async fn migration_010_projection_threads_runtime_mode(pool: &SqlitePool) -> Result<()> {
    let added = add_column_if_missing(
        pool,
        "projection_threads",
        "runtime_mode",
        "TEXT NOT NULL DEFAULT 'full-access'",
    )
    .await?;
    if added {
        exec(
            pool,
            "UPDATE projection_threads SET runtime_mode = 'full-access' WHERE runtime_mode IS NULL",
        )
        .await?;
    }
    Ok(())
}

// 011: 编排线程创建时运行时模式
async fn migration_011_orchestration_thread_created_runtime_mode(pool: &SqlitePool) -> Result<()> {
    // 回填 thread.created 事件 payload_json 中的 runtimeMode
    let _ = sqlx::query(
        r#"
        UPDATE orchestration_events
        SET payload_json = json_set(payload_json, '$.runtimeMode', 'full-access')
        WHERE event_type = 'thread.created'
          AND json_type(payload_json, '$.runtimeMode') IS NULL
        "#,
    )
    .execute(pool)
    .await;
    Ok(())
}

// 012: 投影线程交互模式
async fn migration_012_projection_threads_interaction_mode(pool: &SqlitePool) -> Result<()> {
    add_column_if_missing(
        pool,
        "projection_threads",
        "interaction_mode",
        "TEXT NOT NULL DEFAULT 'default'",
    )
    .await?;
    Ok(())
}

// 013: 投影线程提议计划
async fn migration_013_projection_thread_proposed_plans(pool: &SqlitePool) -> Result<()> {
    exec(
        pool,
        r#"
        CREATE TABLE IF NOT EXISTS projection_thread_proposed_plans (
            plan_id TEXT PRIMARY KEY,
            thread_id TEXT NOT NULL,
            turn_id TEXT,
            plan_markdown TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        "#,
    )
    .await?;
    exec(
        pool,
        "CREATE INDEX IF NOT EXISTS idx_projection_thread_proposed_plans_thread_created ON projection_thread_proposed_plans(thread_id, created_at)",
    )
    .await?;
    Ok(())
}

// 014: 投影线程提议计划实施
async fn migration_014_projection_thread_proposed_plan_implementation(pool: &SqlitePool) -> Result<()> {
    add_column_if_missing(pool, "projection_thread_proposed_plans", "implemented_at", "TEXT").await?;
    add_column_if_missing(
        pool,
        "projection_thread_proposed_plans",
        "implementation_thread_id",
        "TEXT",
    )
    .await?;
    Ok(())
}

// 015: 投影轮次来源提议计划
async fn migration_015_projection_turns_source_proposed_plan(pool: &SqlitePool) -> Result<()> {
    add_column_if_missing(pool, "projection_turns", "source_proposed_plan_thread_id", "TEXT").await?;
    add_column_if_missing(pool, "projection_turns", "source_proposed_plan_id", "TEXT").await?;
    Ok(())
}

// 016: 规范化模型选择
async fn migration_016_canonicalize_model_selections(pool: &SqlitePool) -> Result<()> {
    add_column_if_missing(pool, "projection_projects", "default_model_selection_json", "TEXT").await?;
    add_column_if_missing(pool, "projection_threads", "model_selection_json", "TEXT").await?;

    // 从 default_model 回填 default_model_selection_json
    let _ = sqlx::query(
        r#"
        UPDATE projection_projects
        SET default_model_selection_json = CASE
            WHEN default_model IS NULL THEN NULL
            ELSE json_object(
                'provider',
                CASE
                    WHEN lower(default_model) LIKE '%claude%' THEN 'claudeAgent'
                    ELSE 'codex'
                END,
                'model',
                default_model
            )
        END
        WHERE default_model_selection_json IS NULL
        "#,
    )
    .execute(pool)
    .await;

    // 从 model 回填 model_selection_json
    let _ = sqlx::query(
        r#"
        UPDATE projection_threads
        SET model_selection_json = json_object(
            'provider',
            COALESCE(
                (
                    SELECT provider_name
                    FROM projection_thread_sessions
                    WHERE projection_thread_sessions.thread_id = projection_threads.thread_id
                ),
                CASE
                    WHEN lower(model) LIKE '%claude%' THEN 'claudeAgent'
                    ELSE 'codex'
                END,
                'codex'
            ),
            'model',
            model
        )
        WHERE model_selection_json IS NULL
        "#,
    )
    .execute(pool)
    .await;
    Ok(())
}

// 017: 线程交接元数据
async fn migration_017_thread_handoff_metadata(pool: &SqlitePool) -> Result<()> {
    add_column_if_missing(pool, "projection_threads", "handoff_json", "TEXT").await?;
    add_column_if_missing(
        pool,
        "projection_thread_messages",
        "source",
        "TEXT NOT NULL DEFAULT 'native'",
    )
    .await?;
    Ok(())
}

// 018: 投影线程消息提及
async fn migration_018_projection_thread_message_mentions(pool: &SqlitePool) -> Result<()> {
    add_column_if_missing(pool, "projection_thread_messages", "skills_json", "TEXT").await?;
    add_column_if_missing(pool, "projection_thread_messages", "mentions_json", "TEXT").await?;
    Ok(())
}

// 019: 投影线程环境模式
async fn migration_019_projection_threads_env_mode(pool: &SqlitePool) -> Result<()> {
    let added = add_column_if_missing(
        pool,
        "projection_threads",
        "env_mode",
        "TEXT NOT NULL DEFAULT 'local'",
    )
    .await?;
    if added {
        let _ = sqlx::query(
            r#"
            UPDATE projection_threads
            SET env_mode = CASE
                WHEN worktree_path IS NOT NULL THEN 'worktree'
                ELSE 'local'
            END
            "#,
        )
        .execute(pool)
        .await;
    }
    Ok(())
}

// 020: 投影线程分叉来源
async fn migration_020_projection_threads_fork_source(pool: &SqlitePool) -> Result<()> {
    add_column_if_missing(pool, "projection_threads", "fork_source_thread_id", "TEXT").await?;
    Ok(())
}

// 021: 投影线程关联工作树
async fn migration_021_projection_threads_associated_worktree(pool: &SqlitePool) -> Result<()> {
    let added = add_column_if_missing(
        pool,
        "projection_threads",
        "associated_worktree_path",
        "TEXT",
    )
    .await?;
    if added {
        let _ = sqlx::query(
            "UPDATE projection_threads SET associated_worktree_path = worktree_path WHERE associated_worktree_path IS NULL",
        )
        .execute(pool)
        .await;
    }
    Ok(())
}

// 022: 投影线程关联工作树分支
async fn migration_022_projection_threads_associated_worktree_branch(pool: &SqlitePool) -> Result<()> {
    let added = add_column_if_missing(
        pool,
        "projection_threads",
        "associated_worktree_branch",
        "TEXT",
    )
    .await?;
    if added {
        let _ = sqlx::query(
            "UPDATE projection_threads SET associated_worktree_branch = branch WHERE associated_worktree_branch IS NULL",
        )
        .execute(pool)
        .await;
    }
    Ok(())
}

// 023: 投影线程关联工作树引用（对 017-022 的自愈式重新应用）
async fn migration_023_projection_threads_associated_worktree_ref(pool: &SqlitePool) -> Result<()> {
    migration_017_thread_handoff_metadata(pool).await?;
    migration_018_projection_thread_message_mentions(pool).await?;
    migration_019_projection_threads_env_mode(pool).await?;
    migration_020_projection_threads_fork_source(pool).await?;
    migration_021_projection_threads_associated_worktree(pool).await?;
    migration_022_projection_threads_associated_worktree_branch(pool).await?;

    let added = add_column_if_missing(
        pool,
        "projection_threads",
        "associated_worktree_ref",
        "TEXT",
    )
    .await?;
    if added {
        let _ = sqlx::query(
            r#"
            UPDATE projection_threads
            SET associated_worktree_ref = COALESCE(associated_worktree_branch, branch)
            WHERE associated_worktree_ref IS NULL
              AND COALESCE(associated_worktree_branch, branch) IS NOT NULL
            "#,
        )
        .execute(pool)
        .await;
    }
    Ok(())
}

// 024: 投影线程归档时间
async fn migration_024_projection_threads_archived_at(pool: &SqlitePool) -> Result<()> {
    add_column_if_missing(pool, "projection_threads", "archived_at", "TEXT").await?;
    Ok(())
}

// 025: 投影线程子代理
async fn migration_025_projection_threads_subagents(pool: &SqlitePool) -> Result<()> {
    add_column_if_missing(pool, "projection_threads", "parent_thread_id", "TEXT").await?;
    add_column_if_missing(pool, "projection_threads", "subagent_agent_id", "TEXT").await?;
    add_column_if_missing(pool, "projection_threads", "subagent_nickname", "TEXT").await?;
    add_column_if_missing(pool, "projection_threads", "subagent_role", "TEXT").await?;
    exec(
        pool,
        "CREATE INDEX IF NOT EXISTS idx_projection_threads_parent_thread_id ON projection_threads(parent_thread_id)",
    )
    .await?;
    Ok(())
}

// 026: 投影线程 Shell 摘要
async fn migration_026_projection_thread_shell_summary(pool: &SqlitePool) -> Result<()> {
    add_column_if_missing(pool, "projection_threads", "latest_user_message_at", "TEXT").await?;
    add_column_if_missing(
        pool,
        "projection_threads",
        "pending_approval_count",
        "INTEGER NOT NULL DEFAULT 0",
    )
    .await?;
    add_column_if_missing(
        pool,
        "projection_threads",
        "pending_user_input_count",
        "INTEGER NOT NULL DEFAULT 0",
    )
    .await?;
    add_column_if_missing(
        pool,
        "projection_threads",
        "has_actionable_proposed_plan",
        "INTEGER NOT NULL DEFAULT 0",
    )
    .await?;
    Ok(())
}

// 027: 回填投影线程 Shell 摘要
async fn migration_027_backfill_projection_thread_shell_summary(pool: &SqlitePool) -> Result<()> {
    // 从活动流回填 projection_pending_approvals
    let _ = sqlx::query(
        r#"
        INSERT OR IGNORE INTO projection_pending_approvals (
            request_id, thread_id, turn_id, status, decision, created_at, resolved_at
        )
        SELECT
            requested.request_id,
            requested.thread_id,
            requested.turn_id,
            'pending',
            NULL,
            requested.created_at,
            NULL
        FROM (
            SELECT
                json_extract(payload_json, '$.requestId') AS request_id,
                thread_id,
                turn_id,
                created_at,
                ROW_NUMBER() OVER (
                    PARTITION BY json_extract(payload_json, '$.requestId')
                    ORDER BY created_at ASC, activity_id ASC
                ) AS row_number
            FROM projection_thread_activities
            WHERE kind = 'approval.requested'
              AND json_extract(payload_json, '$.requestId') IS NOT NULL
        ) AS requested
        WHERE requested.row_number = 1
        "#,
    )
    .execute(pool)
    .await;

    // 从活动流标记已解决的审批
    let _ = sqlx::query(
        r#"
        WITH latest_resolutions AS (
            SELECT
                resolved.request_id,
                resolved.resolved_at,
                resolved.decision
            FROM (
                SELECT
                    json_extract(payload_json, '$.requestId') AS request_id,
                    created_at AS resolved_at,
                    CASE
                        WHEN json_extract(payload_json, '$.decision') IN ('accept', 'acceptForSession', 'decline', 'cancel')
                        THEN json_extract(payload_json, '$.decision')
                        ELSE NULL
                    END AS decision,
                    ROW_NUMBER() OVER (
                        PARTITION BY json_extract(payload_json, '$.requestId')
                        ORDER BY created_at DESC, activity_id DESC
                    ) AS row_number
                FROM projection_thread_activities
                WHERE kind = 'approval.resolved'
                  AND json_extract(payload_json, '$.requestId') IS NOT NULL
            ) AS resolved
            WHERE resolved.row_number = 1
        )
        UPDATE projection_pending_approvals
        SET
            status = 'resolved',
            decision = (SELECT latest_resolutions.decision FROM latest_resolutions WHERE latest_resolutions.request_id = projection_pending_approvals.request_id),
            resolved_at = (SELECT latest_resolutions.resolved_at FROM latest_resolutions WHERE latest_resolutions.request_id = projection_pending_approvals.request_id)
        WHERE EXISTS (SELECT 1 FROM latest_resolutions WHERE latest_resolutions.request_id = projection_pending_approvals.request_id)
        "#,
    )
    .execute(pool)
    .await;

    // 回填反规范化计数到 projection_threads
    let _ = sqlx::query(
        r#"
        UPDATE projection_threads
        SET
            latest_user_message_at = (
                SELECT MAX(message.created_at)
                FROM projection_thread_messages AS message
                WHERE message.thread_id = projection_threads.thread_id
                  AND message.role = 'user'
            ),
            pending_approval_count = COALESCE((
                SELECT COUNT(*)
                FROM projection_pending_approvals
                WHERE projection_pending_approvals.thread_id = projection_threads.thread_id
                  AND projection_pending_approvals.status = 'pending'
            ), 0),
            has_actionable_proposed_plan = COALESCE((
                SELECT CASE
                    WHEN EXISTS (
                        SELECT 1
                        FROM projection_thread_proposed_plans AS any_plan
                        WHERE any_plan.thread_id = projection_threads.thread_id
                          AND any_plan.implemented_at IS NULL
                    ) THEN 1
                    ELSE 0
                END
            ), 0)
        "#,
    )
    .execute(pool)
    .await;
    Ok(())
}

// 028: 投影项目类型
async fn migration_028_projection_projects_kind(pool: &SqlitePool) -> Result<()> {
    add_column_if_missing(
        pool,
        "projection_projects",
        "kind",
        "TEXT NOT NULL DEFAULT 'project'",
    )
    .await?;
    Ok(())
}

// 029: 投影线程最近已知 PR
async fn migration_029_projection_threads_last_known_pr(pool: &SqlitePool) -> Result<()> {
    add_column_if_missing(pool, "projection_threads", "last_known_pr_json", "TEXT").await?;
    Ok(())
}

// 030: 投影线程消息分发模式
async fn migration_030_projection_thread_messages_dispatch_mode(pool: &SqlitePool) -> Result<()> {
    add_column_if_missing(pool, "projection_thread_messages", "dispatch_mode", "TEXT").await?;
    Ok(())
}

// 031: 投影线程创建分支流程已完成
async fn migration_031_projection_threads_create_branch_flow_completed(pool: &SqlitePool) -> Result<()> {
    add_column_if_missing(
        pool,
        "projection_threads",
        "create_branch_flow_completed",
        "INTEGER NOT NULL DEFAULT 0",
    )
    .await?;
    Ok(())
}

// 032: 协调旧版 Schema 导入（针对导入数据库的自愈）
async fn migration_032_reconcile_legacy_schema_import(pool: &SqlitePool) -> Result<()> {
    migration_017_thread_handoff_metadata(pool).await?;
    migration_018_projection_thread_message_mentions(pool).await?;
    migration_019_projection_threads_env_mode(pool).await?;
    migration_020_projection_threads_fork_source(pool).await?;
    migration_021_projection_threads_associated_worktree(pool).await?;
    migration_022_projection_threads_associated_worktree_branch(pool).await?;
    migration_023_projection_threads_associated_worktree_ref(pool).await?;
    migration_024_projection_threads_archived_at(pool).await?;
    migration_025_projection_threads_subagents(pool).await?;
    migration_026_projection_thread_shell_summary(pool).await?;
    migration_028_projection_projects_kind(pool).await?;
    migration_029_projection_threads_last_known_pr(pool).await?;
    migration_030_projection_thread_messages_dispatch_mode(pool).await?;
    migration_031_projection_threads_create_branch_flow_completed(pool).await?;

    // 如果本迁移添加了新的 Shell 摘要列，则回填数据
    if column_exists(pool, "projection_threads", "latest_user_message_at").await? {
        migration_027_backfill_projection_thread_shell_summary(pool).await?;
    }
    Ok(())
}

// 033: 投影线程 Sidechat 来源
async fn migration_033_projection_threads_sidechat_source(pool: &SqlitePool) -> Result<()> {
    add_column_if_missing(
        pool,
        "projection_threads",
        "sidechat_source_thread_id",
        "TEXT",
    )
    .await?;
    Ok(())
}

// 034: 认证与访问管理
async fn migration_034_auth_access_management(pool: &SqlitePool) -> Result<()> {
    exec(
        pool,
        r#"
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
        )
        "#,
    )
    .await?;
    exec(
        pool,
        "CREATE INDEX IF NOT EXISTS idx_auth_pairing_links_active ON auth_pairing_links(revoked_at, consumed_at, expires_at)",
    )
    .await?;

    exec(
        pool,
        r#"
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
        )
        "#,
    )
    .await?;
    exec(
        pool,
        "CREATE INDEX IF NOT EXISTS idx_auth_sessions_active ON auth_sessions(revoked_at, expires_at, issued_at)",
    )
    .await?;
    Ok(())
}

// 035: 规范化旧版模型选择选项（轻量级 JSON 规范化）
async fn migration_035_normalize_legacy_model_selection_options(pool: &SqlitePool) -> Result<()> {
    // 读取所有模型选择 JSON 并重新序列化，确保规范形式。
    // 通常由规范化辅助函数完成繁重工作；此处采用尽力而为的
    // 重新序列化策略，使下游消费者看到一致的数据结构。
    let rows = sqlx::query("SELECT project_id, default_model_selection_json FROM projection_projects WHERE default_model_selection_json IS NOT NULL")
        .fetch_all(pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;
    for row in rows {
        let id: String = row.try_get("project_id").unwrap_or_default();
        let raw: String = row.try_get("default_model_selection_json").unwrap_or_default();
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&raw) {
            if let Ok(canonical) = serde_json::to_string(&value) {
                let _ = sqlx::query("UPDATE projection_projects SET default_model_selection_json = ? WHERE project_id = ?")
                    .bind(&canonical)
                    .bind(&id)
                    .execute(pool)
                    .await;
            }
        }
    }
    Ok(())
}

// 036: 投影线程置顶
async fn migration_036_projection_threads_pinned(pool: &SqlitePool) -> Result<()> {
    add_column_if_missing(
        pool,
        "projection_threads",
        "is_pinned",
        "INTEGER NOT NULL DEFAULT 0",
    )
    .await?;
    Ok(())
}

// 037: 投影快照上限索引
async fn migration_037_projection_snapshot_cap_indexes(pool: &SqlitePool) -> Result<()> {
    exec(
        pool,
        "CREATE INDEX IF NOT EXISTS idx_projection_thread_messages_thread_created_desc ON projection_thread_messages(thread_id, created_at DESC, message_id DESC)",
    )
    .await?;
    exec(
        pool,
        "CREATE INDEX IF NOT EXISTS idx_projection_thread_activities_thread_rank_desc ON projection_thread_activities(thread_id, (CASE WHEN sequence IS NULL THEN 0 ELSE 1 END) DESC, sequence DESC, created_at DESC, activity_id DESC)",
    )
    .await?;
    Ok(())
}
