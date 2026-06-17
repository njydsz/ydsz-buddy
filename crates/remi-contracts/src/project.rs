//! Project schemas.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::ProjectId;

/// Project information.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Project {
    /// Project ID.
    pub id: ProjectId,
    /// Project name.
    pub name: String,
    /// Project path.
    pub path: String,
    /// Project kind.
    pub kind: ProjectKind,
    /// Created timestamp (ISO 8601).
    pub created_at: String,
    /// Updated timestamp (ISO 8601).
    pub updated_at: String,
}

/// Project kind.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum ProjectKind {
    /// Local project.
    Local,
    /// Remote project.
    Remote,
}

/// Input for creating a project.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CreateProjectInput {
    /// Project name.
    pub name: String,
    /// Project path.
    pub path: String,
    /// Project kind.
    pub kind: ProjectKind,
}

/// Output for creating a project.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CreateProjectOutput {
    /// Project ID.
    pub id: ProjectId,
}

/// Project favicon information.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ProjectFavicon {
    /// Project ID.
    pub project_id: ProjectId,
    /// Favicon URL.
    pub url: String,
    /// Favicon data (base64 encoded).
    pub data: Option<String>,
}
