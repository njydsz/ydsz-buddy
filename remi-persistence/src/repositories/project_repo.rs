//! 项目仓库。

use async_trait::async_trait;
use chrono::Utc;
use remi_contracts::{Project, ProjectId, ProjectKind};
use remi_core::{Error, Result};
use sqlx::SqlitePool;
use uuid::Uuid;

/// 项目仓库 trait。
#[async_trait]
pub trait ProjectRepositoryTrait: Send + Sync {
    /// 创建新项目。
    async fn create(&self, name: &str, path: &str, kind: ProjectKind) -> Result<Project>;

    /// 根据 ID 获取项目。
    async fn get_by_id(&self, id: ProjectId) -> Result<Option<Project>>;

    /// 根据路径获取项目。
    async fn get_by_path(&self, path: &str) -> Result<Option<Project>>;

    /// 列出所有项目。
    async fn list(&self) -> Result<Vec<Project>>;

    /// 删除项目（通过 deleted_at 软删除）。
    async fn delete(&self, id: ProjectId) -> Result<()>;
}

/// 项目仓库实现。
#[derive(Clone)]
pub struct ProjectRepository {
    pool: SqlitePool,
}

impl ProjectRepository {
    /// 创建新项目仓库。
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    fn kind_to_str(kind: ProjectKind) -> &'static str {
        match kind {
            ProjectKind::Local => "project",
            ProjectKind::Remote => "remote",
        }
    }

    fn str_to_kind(s: &str) -> Result<ProjectKind> {
        match s {
            "project" | "local" => Ok(ProjectKind::Local),
            "remote" => Ok(ProjectKind::Remote),
            other => Err(Error::Database(format!("无效的项目类型: {other}"))),
        }
    }
}

#[async_trait]
impl ProjectRepositoryTrait for ProjectRepository {
    async fn create(&self, name: &str, path: &str, kind: ProjectKind) -> Result<Project> {
        let id = ProjectId::new();
        let now = Utc::now().to_rfc3339();
        let kind_str = Self::kind_to_str(kind);
        let scripts_json = "[]";

        sqlx::query(
            "INSERT INTO projection_projects (project_id, kind, title, workspace_root, scripts_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(id.to_string())
        .bind(kind_str)
        .bind(name)
        .bind(path)
        .bind(scripts_json)
        .bind(&now)
        .bind(&now)
        .execute(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        Ok(Project {
            id,
            name: name.to_string(),
            path: path.to_string(),
            kind,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    async fn get_by_id(&self, id: ProjectId) -> Result<Option<Project>> {
        let row: Option<(String, String, String, String, String, String)> = sqlx::query_as(
            "SELECT project_id, title, workspace_root, kind, created_at, updated_at FROM projection_projects WHERE project_id = ? AND deleted_at IS NULL",
        )
        .bind(id.to_string())
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        match row {
            Some((id_str, name, path, kind_str, created_at, updated_at)) => {
                let id = Uuid::parse_str(&id_str)
                    .map_err(|e| Error::Database(format!("无效的项目 ID: {e}")))?;
                Ok(Some(Project {
                    id: ProjectId(id),
                    name,
                    path,
                    kind: Self::str_to_kind(&kind_str)?,
                    created_at,
                    updated_at,
                }))
            }
            None => Ok(None),
        }
    }

    async fn get_by_path(&self, path: &str) -> Result<Option<Project>> {
        let row: Option<(String, String, String, String, String, String)> = sqlx::query_as(
            "SELECT project_id, title, workspace_root, kind, created_at, updated_at FROM projection_projects WHERE workspace_root = ? AND deleted_at IS NULL",
        )
        .bind(path)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        match row {
            Some((id_str, name, path, kind_str, created_at, updated_at)) => {
                let id = Uuid::parse_str(&id_str)
                    .map_err(|e| Error::Database(format!("无效的项目 ID: {e}")))?;
                Ok(Some(Project {
                    id: ProjectId(id),
                    name,
                    path,
                    kind: Self::str_to_kind(&kind_str)?,
                    created_at,
                    updated_at,
                }))
            }
            None => Ok(None),
        }
    }

    async fn list(&self) -> Result<Vec<Project>> {
        let rows: Vec<(String, String, String, String, String, String)> = sqlx::query_as(
            "SELECT project_id, title, workspace_root, kind, created_at, updated_at FROM projection_projects WHERE deleted_at IS NULL ORDER BY updated_at DESC",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        let mut projects = Vec::new();
        for (id_str, name, path, kind_str, created_at, updated_at) in rows {
            let id = Uuid::parse_str(&id_str)
                .map_err(|e| Error::Database(format!("无效的项目 ID: {e}")))?;
            projects.push(Project {
                id: ProjectId(id),
                name,
                path,
                kind: Self::str_to_kind(&kind_str)?,
                created_at,
                updated_at,
            });
        }
        Ok(projects)
    }

    async fn delete(&self, id: ProjectId) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        sqlx::query("UPDATE projection_projects SET deleted_at = ? WHERE project_id = ?")
            .bind(&now)
            .bind(id.to_string())
            .execute(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?;
        Ok(())
    }
}
