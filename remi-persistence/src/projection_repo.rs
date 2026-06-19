//! 投影存储

use async_trait::async_trait;
use remi_core::models::{Project, ProjectId, Sequence, Thread, ThreadId};

use crate::error::PersistenceResult;
use crate::sqlite_client::SqliteClient;

/// 投影仓库 trait
#[async_trait]
pub trait ProjectionRepository: Send + Sync {
    /// 保存项目
    fn save_project(&self, project: &Project) -> PersistenceResult<()>;

    /// 保存线程
    fn save_thread(&self, thread: &Thread) -> PersistenceResult<()>;

    /// 获取项目
    fn get_project(&self, id: ProjectId) -> PersistenceResult<Option<Project>>;

    /// 获取线程
    fn get_thread(&self, id: ThreadId) -> PersistenceResult<Option<Thread>>;

    /// 列出所有项目
    fn list_projects(&self) -> PersistenceResult<Vec<Project>>;

    /// 列出所有线程
    fn list_threads(&self) -> PersistenceResult<Vec<Thread>>;

    /// 删除项目
    fn delete_project(&self, id: ProjectId) -> PersistenceResult<()>;

    /// 删除线程
    fn delete_thread(&self, id: ThreadId) -> PersistenceResult<()>;

    /// 获取投影器状态
    fn get_projection_state(&self, projector_name: &str) -> PersistenceResult<Sequence>;

    /// 更新投影器状态
    fn update_projection_state(&self, projector_name: &str, sequence: Sequence) -> PersistenceResult<()>;
}

/// SQLite 投影仓库实现
pub struct SqliteProjectionRepository {
    client: SqliteClient,
}

impl SqliteProjectionRepository {
    pub fn new(client: SqliteClient) -> Self {
        Self { client }
    }
}

impl ProjectionRepository for SqliteProjectionRepository {
    fn save_project(&self, project: &Project) -> PersistenceResult<()> {
        let scripts_json = serde_json::to_string(&project.scripts)?;
        let model_json = project.default_model_selection.as_ref()
            .map(|m| serde_json::to_string(m))
            .transpose()?;

        self.client.execute(
            "INSERT OR REPLACE INTO projection_projects 
             (id, kind, title, workspace_root, default_model_selection, scripts, created_at, updated_at, deleted_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            &[
                &project.id.to_string(),
                &serde_json::to_string(&project.kind)?,
                &project.title,
                &project.workspace_root,
                &model_json,
                &scripts_json,
                &project.created_at.to_rfc3339(),
                &project.updated_at.to_rfc3339(),
                &project.deleted_at.map(|d| d.to_rfc3339()),
            ],
        )?;

        Ok(())
    }

    fn save_thread(&self, thread: &Thread) -> PersistenceResult<()> {
        let model_json = serde_json::to_string(&thread.model_selection)?;
        let messages_json = serde_json::to_string(&thread.messages)?;
        let plans_json = serde_json::to_string(&thread.proposed_plans)?;
        let activities_json = serde_json::to_string(&thread.activities)?;
        let checkpoints_json = serde_json::to_string(&thread.checkpoints)?;
        let session_json = thread.session.as_ref()
            .map(|s| serde_json::to_string(s))
            .transpose()?;
        let worktree_json = thread.associated_worktree.as_ref()
            .map(|w| serde_json::to_string(w))
            .transpose()?;
        let subagent_json = thread.subagent.as_ref()
            .map(|s| serde_json::to_string(s))
            .transpose()?;
        let pr_json = thread.last_known_pr.as_ref()
            .map(|p| serde_json::to_string(p))
            .transpose()?;
        let turn_json = thread.latest_turn.as_ref()
            .map(|t| serde_json::to_string(t))
            .transpose()?;
        let handoff_json = thread.handoff.as_ref()
            .map(|h| serde_json::to_string(h))
            .transpose()?;

        self.client.execute(
            "INSERT OR REPLACE INTO projection_threads
             (id, project_id, title, model_selection, runtime_mode, interaction_mode, env_mode,
              branch, worktree_path, associated_worktree, is_pinned, parent_thread_id, subagent,
              fork_source_thread_id, sidechat_source_thread_id, last_known_pr, latest_turn,
              latest_user_message_at, has_pending_approvals, has_pending_user_input,
              has_actionable_proposed_plan, messages, proposed_plans, activities, checkpoints,
              session, created_at, updated_at, archived_at, deleted_at, handoff)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31)",
            &[
                &thread.id.to_string(),
                &thread.project_id.to_string(),
                &thread.title,
                &model_json,
                &serde_json::to_string(&thread.runtime_mode)?,
                &serde_json::to_string(&thread.interaction_mode)?,
                &serde_json::to_string(&thread.env_mode)?,
                &thread.branch,
                &thread.worktree_path,
                &worktree_json,
                &(thread.is_pinned as i32),
                &thread.parent_thread_id.map(|id| id.to_string()),
                &subagent_json,
                &thread.fork_source_thread_id.map(|id| id.to_string()),
                &thread.sidechat_source_thread_id.map(|id| id.to_string()),
                &pr_json,
                &turn_json,
                &thread.latest_user_message_at.map(|d| d.to_rfc3339()),
                &(thread.has_pending_approvals as i32),
                &(thread.has_pending_user_input as i32),
                &(thread.has_actionable_proposed_plan as i32),
                &messages_json,
                &plans_json,
                &activities_json,
                &checkpoints_json,
                &session_json,
                &thread.created_at.to_rfc3339(),
                &thread.updated_at.to_rfc3339(),
                &thread.archived_at.map(|d| d.to_rfc3339()),
                &thread.deleted_at.map(|d| d.to_rfc3339()),
                &handoff_json,
            ],
        )?;

        Ok(())
    }

    fn get_project(&self, id: ProjectId) -> PersistenceResult<Option<Project>> {
        let rows = self.client.query_map(
            "SELECT id, kind, title, workspace_root, default_model_selection, scripts, created_at, updated_at, deleted_at
             FROM projection_projects WHERE id = ?1",
            &[&id.to_string()],
            |row| {
                let id_str: String = row.get(0)?;
                let kind_str: String = row.get(1)?;
                let title: String = row.get(2)?;
                let workspace_root: String = row.get(3)?;
                let model_json: Option<String> = row.get(4)?;
                let scripts_json: String = row.get(5)?;
                let created_at_str: String = row.get(6)?;
                let updated_at_str: String = row.get(7)?;
                let deleted_at_str: Option<String> = row.get(8)?;

                Ok((id_str, kind_str, title, workspace_root, model_json, scripts_json, created_at_str, updated_at_str, deleted_at_str))
            },
        )?;

        if rows.is_empty() {
            return Ok(None);
        }

        let (id_str, kind_str, title, workspace_root, model_json, scripts_json, created_at_str, updated_at_str, deleted_at_str) = &rows[0];

        let project = Project {
            id: id_str.parse().map_err(|e| crate::error::PersistenceError::SerializationError(format!("UUID 解析错误: {}", e)))?,
            kind: serde_json::from_str(kind_str)?,
            title: title.clone(),
            workspace_root: workspace_root.clone(),
            default_model_selection: model_json.as_ref().map(|s| serde_json::from_str(s)).transpose()?,
            scripts: serde_json::from_str(scripts_json)?,
            created_at: created_at_str.parse().map_err(|e| crate::error::PersistenceError::SerializationError(format!("日期解析错误: {}", e)))?,
            updated_at: updated_at_str.parse().map_err(|e| crate::error::PersistenceError::SerializationError(format!("日期解析错误: {}", e)))?,
            deleted_at: deleted_at_str.as_ref().map(|s| s.parse()).transpose().map_err(|e| crate::error::PersistenceError::SerializationError(format!("日期解析错误: {}", e)))?,
        };

        Ok(Some(project))
    }

    fn get_thread(&self, id: ThreadId) -> PersistenceResult<Option<Thread>> {
        let rows = self.client.query_map(
            "SELECT id, project_id, title, model_selection, runtime_mode, interaction_mode, env_mode,
                    branch, worktree_path, is_pinned, messages, proposed_plans, activities, checkpoints,
                    session, created_at, updated_at
             FROM projection_threads WHERE id = ?1",
            &[&id.to_string()],
            |row| {
                let id_str: String = row.get(0)?;
                let project_id_str: String = row.get(1)?;
                let title: String = row.get(2)?;
                let model_json: String = row.get(3)?;
                let runtime_mode_str: String = row.get(4)?;
                let interaction_mode_str: String = row.get(5)?;
                let env_mode_str: String = row.get(6)?;
                let branch: Option<String> = row.get(7)?;
                let worktree_path: Option<String> = row.get(8)?;
                let is_pinned: i32 = row.get(9)?;
                let messages_json: String = row.get(10)?;
                let plans_json: String = row.get(11)?;
                let activities_json: String = row.get(12)?;
                let checkpoints_json: String = row.get(13)?;
                let session_json: Option<String> = row.get(14)?;
                let created_at_str: String = row.get(15)?;
                let updated_at_str: String = row.get(16)?;

                Ok((id_str, project_id_str, title, model_json, runtime_mode_str, interaction_mode_str, env_mode_str, branch, worktree_path, is_pinned, messages_json, plans_json, activities_json, checkpoints_json, session_json, created_at_str, updated_at_str))
            },
        )?;

        if rows.is_empty() {
            return Ok(None);
        }

        let row = &rows[0];
        let thread = Thread {
            id: row.0.parse().map_err(|e| crate::error::PersistenceError::SerializationError(format!("UUID 解析错误: {}", e)))?,
            project_id: row.1.parse().map_err(|e| crate::error::PersistenceError::SerializationError(format!("UUID 解析错误: {}", e)))?,
            title: row.2.clone(),
            model_selection: serde_json::from_str(&row.3)?,
            runtime_mode: serde_json::from_str(&row.4)?,
            interaction_mode: serde_json::from_str(&row.5)?,
            env_mode: serde_json::from_str(&row.6)?,
            branch: row.7.clone(),
            worktree_path: row.8.clone(),
            associated_worktree: None,
            is_pinned: row.9 != 0,
            parent_thread_id: None,
            subagent: None,
            fork_source_thread_id: None,
            sidechat_source_thread_id: None,
            last_known_pr: None,
            latest_turn: None,
            latest_user_message_at: None,
            has_pending_approvals: false,
            has_pending_user_input: false,
            has_actionable_proposed_plan: false,
            messages: serde_json::from_str(&row.10)?,
            proposed_plans: serde_json::from_str(&row.11)?,
            activities: serde_json::from_str(&row.12)?,
            checkpoints: serde_json::from_str(&row.13)?,
            session: row.14.as_ref().map(|s| serde_json::from_str(s)).transpose()?,
            created_at: row.15.parse().map_err(|e| crate::error::PersistenceError::SerializationError(format!("日期解析错误: {}", e)))?,
            updated_at: row.16.parse().map_err(|e| crate::error::PersistenceError::SerializationError(format!("日期解析错误: {}", e)))?,
            archived_at: None,
            deleted_at: None,
            handoff: None,
        };

        Ok(Some(thread))
    }

    fn list_projects(&self) -> PersistenceResult<Vec<Project>> {
        let rows = self.client.query_map(
            "SELECT id, kind, title, workspace_root, default_model_selection, scripts, created_at, updated_at, deleted_at
             FROM projection_projects WHERE deleted_at IS NULL ORDER BY created_at DESC",
            &[],
            |row| {
                let id_str: String = row.get(0)?;
                let kind_str: String = row.get(1)?;
                let title: String = row.get(2)?;
                let workspace_root: String = row.get(3)?;
                let model_json: Option<String> = row.get(4)?;
                let scripts_json: String = row.get(5)?;
                let created_at_str: String = row.get(6)?;
                let updated_at_str: String = row.get(7)?;
                let deleted_at_str: Option<String> = row.get(8)?;

                Ok(Project {
                    id: id_str.parse().map_err(|_| rusqlite::Error::InvalidColumnIndex(0))?,
                    kind: serde_json::from_str(&kind_str).map_err(|_| rusqlite::Error::InvalidColumnIndex(0))?,
                    title,
                    workspace_root,
                    default_model_selection: model_json.as_ref().map(|s| serde_json::from_str(s)).transpose().map_err(|_| rusqlite::Error::InvalidColumnIndex(0))?,
                    scripts: serde_json::from_str(&scripts_json).map_err(|_| rusqlite::Error::InvalidColumnIndex(0))?,
                    created_at: created_at_str.parse().map_err(|_| rusqlite::Error::InvalidColumnIndex(0))?,
                    updated_at: updated_at_str.parse().map_err(|_| rusqlite::Error::InvalidColumnIndex(0))?,
                    deleted_at: deleted_at_str.as_ref().map(|s| s.parse()).transpose().map_err(|_| rusqlite::Error::InvalidColumnIndex(0))?,
                })
            },
        )?;

        Ok(rows)
    }

    fn list_threads(&self) -> PersistenceResult<Vec<Thread>> {
        let rows = self.client.query_map(
            "SELECT id, project_id, title, model_selection, runtime_mode, interaction_mode, env_mode,
                    branch, worktree_path, is_pinned, messages, proposed_plans, activities, checkpoints,
                    session, created_at, updated_at
             FROM projection_threads WHERE deleted_at IS NULL ORDER BY created_at DESC",
            &[],
            |row| {
                let id_str: String = row.get(0)?;
                let project_id_str: String = row.get(1)?;
                let title: String = row.get(2)?;
                let model_json: String = row.get(3)?;
                let runtime_mode_str: String = row.get(4)?;
                let interaction_mode_str: String = row.get(5)?;
                let env_mode_str: String = row.get(6)?;
                let branch: Option<String> = row.get(7)?;
                let worktree_path: Option<String> = row.get(8)?;
                let is_pinned: i32 = row.get(9)?;
                let messages_json: String = row.get(10)?;
                let plans_json: String = row.get(11)?;
                let activities_json: String = row.get(12)?;
                let checkpoints_json: String = row.get(13)?;
                let session_json: Option<String> = row.get(14)?;
                let created_at_str: String = row.get(15)?;
                let updated_at_str: String = row.get(16)?;

                Ok(Thread {
                    id: id_str.parse().map_err(|_| rusqlite::Error::InvalidColumnIndex(0))?,
                    project_id: project_id_str.parse().map_err(|_| rusqlite::Error::InvalidColumnIndex(0))?,
                    title,
                    model_selection: serde_json::from_str(&model_json).map_err(|_| rusqlite::Error::InvalidColumnIndex(0))?,
                    runtime_mode: serde_json::from_str(&runtime_mode_str).map_err(|_| rusqlite::Error::InvalidColumnIndex(0))?,
                    interaction_mode: serde_json::from_str(&interaction_mode_str).map_err(|_| rusqlite::Error::InvalidColumnIndex(0))?,
                    env_mode: serde_json::from_str(&env_mode_str).map_err(|_| rusqlite::Error::InvalidColumnIndex(0))?,
                    branch,
                    worktree_path,
                    associated_worktree: None,
                    is_pinned: is_pinned != 0,
                    parent_thread_id: None,
                    subagent: None,
                    fork_source_thread_id: None,
                    sidechat_source_thread_id: None,
                    last_known_pr: None,
                    latest_turn: None,
                    latest_user_message_at: None,
                    has_pending_approvals: false,
                    has_pending_user_input: false,
                    has_actionable_proposed_plan: false,
                    messages: serde_json::from_str(&messages_json).map_err(|_| rusqlite::Error::InvalidColumnIndex(0))?,
                    proposed_plans: serde_json::from_str(&plans_json).map_err(|_| rusqlite::Error::InvalidColumnIndex(0))?,
                    activities: serde_json::from_str(&activities_json).map_err(|_| rusqlite::Error::InvalidColumnIndex(0))?,
                    checkpoints: serde_json::from_str(&checkpoints_json).map_err(|_| rusqlite::Error::InvalidColumnIndex(0))?,
                    session: session_json.as_ref().map(|s| serde_json::from_str(s)).transpose().map_err(|_| rusqlite::Error::InvalidColumnIndex(0))?,
                    created_at: created_at_str.parse().map_err(|_| rusqlite::Error::InvalidColumnIndex(0))?,
                    updated_at: updated_at_str.parse().map_err(|_| rusqlite::Error::InvalidColumnIndex(0))?,
                    archived_at: None,
                    deleted_at: None,
                    handoff: None,
                })
            },
        )?;

        Ok(rows)
    }

    fn delete_project(&self, id: ProjectId) -> PersistenceResult<()> {
        self.client.execute(
            "UPDATE projection_projects SET deleted_at = datetime('now') WHERE id = ?1",
            &[&id.to_string()],
        )?;
        Ok(())
    }

    fn delete_thread(&self, id: ThreadId) -> PersistenceResult<()> {
        self.client.execute(
            "UPDATE projection_threads SET deleted_at = datetime('now') WHERE id = ?1",
            &[&id.to_string()],
        )?;
        Ok(())
    }

    fn get_projection_state(&self, projector_name: &str) -> PersistenceResult<Sequence> {
        let sequence: Sequence = self.client.query_row(
            "SELECT COALESCE(last_applied_sequence, 0) FROM projection_state WHERE projector_name = ?1",
            &[&projector_name],
            |row| row.get(0),
        ).unwrap_or(0);

        Ok(sequence)
    }

    fn update_projection_state(&self, projector_name: &str, sequence: Sequence) -> PersistenceResult<()> {
        self.client.execute(
            "INSERT OR REPLACE INTO projection_state (projector_name, last_applied_sequence) VALUES (?1, ?2)",
            &[&projector_name, &sequence],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::migrations::run_migrations;
    use chrono::Utc;
    use remi_core::models::*;
    use remi_core::provider::{ModelSelection, ProviderKind};
    use std::path::PathBuf;
    use uuid::Uuid;

    #[test]
    fn test_projection_repository() {
        let temp_dir = std::env::temp_dir().join("remi-test-projection-repo");
        let db_path = temp_dir.join("test.sqlite");
        
        let client = SqliteClient::new(&db_path).unwrap();
        run_migrations(&client).unwrap();
        
        let repo = SqliteProjectionRepository::new(client);

        // 创建测试项目
        let project = Project {
            id: ProjectId::new_v4(),
            kind: ProjectKind::Local,
            title: "Test Project".to_string(),
            workspace_root: "/tmp/test".to_string(),
            default_model_selection: None,
            scripts: vec![],
            created_at: Utc::now(),
            updated_at: Utc::now(),
            deleted_at: None,
        };

        // 保存项目
        repo.save_project(&project).unwrap();

        // 获取项目
        let retrieved = repo.get_project(project.id).unwrap();
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().title, "Test Project");

        // 列出项目
        let projects = repo.list_projects().unwrap();
        assert_eq!(projects.len(), 1);

        // 测试投影器状态
        repo.update_projection_state("test_projector", 42).unwrap();
        let state = repo.get_projection_state("test_projector").unwrap();
        assert_eq!(state, 42);

        // 清理
        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
