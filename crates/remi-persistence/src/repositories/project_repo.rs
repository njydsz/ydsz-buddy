//! Project repository.

use async_trait::async_trait;
use chrono::Utc;
use remi_contracts::{Project, ProjectId, ProjectKind};
use remi_core::{Error, Result};
use sqlx::SqlitePool;
use uuid::Uuid;

/// Project repository trait.
#[async_trait]
pub trait ProjectRepositoryTrait: Send + Sync {
    /// Create a new project.
    async fn create(&self, name: &str, path: &str, kind: ProjectKind) -> Result<Project>;

    /// Get a project by ID.
    async fn get_by_id(&self, id: ProjectId) -> Result<Option<Project>>;

    /// Get a project by path.
    async fn get_by_path(&self, path: &str) -> Result<Option<Project>>;

    /// List all projects.
    async fn list(&self) -> Result<Vec<Project>>;

    /// Delete a project.
    async fn delete(&self, id: ProjectId) -> Result<()>;
}

/// Project repository implementation.
pub struct ProjectRepository {
    pool: SqlitePool,
}

impl ProjectRepository {
    /// Create a new project repository.
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl ProjectRepositoryTrait for ProjectRepository {
    async fn create(&self, name: &str, path: &str, kind: ProjectKind) -> Result<Project> {
        let id = ProjectId::new();
        let now = Utc::now().to_rfc3339();
        let kind_str = match kind {
            ProjectKind::Local => "local",
            ProjectKind::Remote => "remote",
        };

        sqlx::query(
            "INSERT INTO projects (id, name, path, kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(id.to_string())
        .bind(name)
        .bind(path)
        .bind(kind_str)
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
            "SELECT id, name, path, kind, created_at, updated_at FROM projects WHERE id = ?",
        )
        .bind(id.to_string())
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        match row {
            Some((id_str, name, path, kind_str, created_at, updated_at)) => {
                let id = Uuid::parse_str(&id_str)
                    .map_err(|e| Error::Database(format!("Invalid project ID in database: {}", e)))?;
                let kind = match kind_str.as_str() {
                    "local" => ProjectKind::Local,
                    "remote" => ProjectKind::Remote,
                    _ => return Err(Error::Database(format!("Invalid project kind: {}", kind_str))),
                };
                Ok(Some(Project {
                    id: ProjectId(id),
                    name,
                    path,
                    kind,
                    created_at,
                    updated_at,
                }))
            }
            None => Ok(None),
        }
    }

    async fn get_by_path(&self, path: &str) -> Result<Option<Project>> {
        let row: Option<(String, String, String, String, String, String)> = sqlx::query_as(
            "SELECT id, name, path, kind, created_at, updated_at FROM projects WHERE path = ?",
        )
        .bind(path)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        match row {
            Some((id_str, name, path, kind_str, created_at, updated_at)) => {
                let id = Uuid::parse_str(&id_str)
                    .map_err(|e| Error::Database(format!("Invalid project ID in database: {}", e)))?;
                let kind = match kind_str.as_str() {
                    "local" => ProjectKind::Local,
                    "remote" => ProjectKind::Remote,
                    _ => return Err(Error::Database(format!("Invalid project kind: {}", kind_str))),
                };
                Ok(Some(Project {
                    id: ProjectId(id),
                    name,
                    path,
                    kind,
                    created_at,
                    updated_at,
                }))
            }
            None => Ok(None),
        }
    }

    async fn list(&self) -> Result<Vec<Project>> {
        let rows: Vec<(String, String, String, String, String, String)> = sqlx::query_as(
            "SELECT id, name, path, kind, created_at, updated_at FROM projects ORDER BY updated_at DESC",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        let mut projects = Vec::new();
        for (id_str, name, path, kind_str, created_at, updated_at) in rows {
            let id = Uuid::parse_str(&id_str)
                .map_err(|e| Error::Database(format!("Invalid project ID in database: {}", e)))?;
            let kind = match kind_str.as_str() {
                "local" => ProjectKind::Local,
                "remote" => ProjectKind::Remote,
                _ => return Err(Error::Database(format!("Invalid project kind: {}", kind_str))),
            };
            projects.push(Project {
                id: ProjectId(id),
                name,
                path,
                kind,
                created_at,
                updated_at,
            });
        }
        Ok(projects)
    }

    async fn delete(&self, id: ProjectId) -> Result<()> {
        sqlx::query("DELETE FROM projects WHERE id = ?")
            .bind(id.to_string())
            .execute(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        Ok(())
    }
}
