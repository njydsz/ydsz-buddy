//! # Skills RPC 方法模块
//!
//! 实现 `skills.listLocal` 方法，扫描用户 home 目录下的已知 skill
//! 目录（Claude / Codex / agents / openclaw），返回本地安装的 SKILL.md。

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tracing::{debug, info};

use crate::rpc::RpcRouter;

const SKILL_FILENAME: &str = "SKILL.md";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LocalUserSkillDescriptor {
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    homepage: Option<String>,
    path: String,
    source: String,
    source_dir: String,
    enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListLocalUserSkillsResult {
    skills: Vec<LocalUserSkillDescriptor>,
    searched_dirs: Vec<String>,
}

fn skill_search_dirs() -> Vec<(String, PathBuf)> {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    vec![
        ("claude".to_string(), home.join(".claude").join("skills")),
        ("codex".to_string(), home.join(".codex").join("skills")),
        ("agents".to_string(), home.join(".agents").join("skills")),
        ("openclaw".to_string(), home.join(".openclaw").join("skills")),
    ]
}

fn normalize_frontmatter_value(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    if (trimmed.starts_with('"') && trimmed.ends_with('"'))
        || (trimmed.starts_with('\'') && trimmed.ends_with('\''))
    {
        return Some(trimmed[1..trimmed.len() - 1].trim().to_string());
    }
    Some(trimmed.to_string())
}

fn strip_yaml_block_scalar(value: &str) -> String {
    value
        .lines()
        .map(|line| line.trim_start().trim_start_matches('-').trim().to_string())
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn parse_frontmatter(text: &str) -> std::collections::HashMap<String, String> {
    let body = text
        .strip_prefix("---")
        .and_then(|rest| rest.split_once("---"))
        .map(|(body, _)| body.trim())
        .unwrap_or("");
    if body.is_empty() {
        return std::collections::HashMap::new();
    }

    let mut result = std::collections::HashMap::new();
    let mut current_key: Option<String> = None;
    let mut current_list: Vec<String> = Vec::new();

    let commit_list = |result: &mut std::collections::HashMap<String, String>,
                       current_key: &mut Option<String>,
                       current_list: &mut Vec<String>| {
        if let Some(key) = current_key.take() {
            if !current_list.is_empty() {
                result.insert(key, strip_yaml_block_scalar(&current_list.join("\n")));
            }
            current_list.clear();
        }
    };

    for raw_line in body.lines() {
        if raw_line.trim().is_empty() {
            continue;
        }
        let trimmed = raw_line.trim_start();
        if trimmed.starts_with('-') && current_key.is_some() {
            let item = trimmed.trim_start_matches('-').trim().to_string();
            current_list.push(item);
            continue;
        }
        commit_list(&mut result, &mut current_key, &mut current_list);
        if let Some((key, value)) = trimmed.split_once(':') {
            let key = key.trim().to_string();
            let value = value.trim();
            if value.is_empty() {
                current_key = Some(key);
                continue;
            }
            result.insert(key, value.to_string());
        }
    }
    commit_list(&mut result, &mut current_key, &mut current_list);
    result
}

fn resolve_homepage(frontmatter: &std::collections::HashMap<String, String>) -> Option<String> {
    normalize_frontmatter_value(frontmatter.get("homepage").unwrap_or(&String::new()).as_str())
        .or_else(|| {
            frontmatter
                .get("metadata")
                .and_then(|metadata| serde_json::from_str::<serde_json::Value>(metadata).ok())
                .and_then(|v| v.get("openclaw").cloned())
                .and_then(|v| v.get("homepage").cloned())
                .and_then(|v| v.as_str().map(|s| s.to_string()))
        })
}

fn read_skill_descriptor(
    source: &str,
    source_dir: &Path,
    skill_dir: &Path,
) -> Option<LocalUserSkillDescriptor> {
    let skill_path = skill_dir.join(SKILL_FILENAME);
    let raw = match std::fs::read_to_string(&skill_path) {
        Ok(r) => r,
        Err(e) => {
            debug!("无法读取 skill 文件 {:?}: {}", skill_path, e);
            return None;
        }
    };
    let frontmatter = parse_frontmatter(&raw);
    let name = normalize_frontmatter_value(frontmatter.get("name").unwrap_or(&String::new()).as_str())
        .unwrap_or_else(|| {
            skill_dir
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| "unknown".to_string())
        });
    let description =
        normalize_frontmatter_value(frontmatter.get("description").unwrap_or(&String::new()).as_str());
    let version =
        normalize_frontmatter_value(frontmatter.get("version").unwrap_or(&String::new()).as_str());
    let homepage = resolve_homepage(&frontmatter);

    Some(LocalUserSkillDescriptor {
        name,
        description,
        version,
        homepage,
        path: skill_path.to_string_lossy().to_string(),
        source: source.to_string(),
        source_dir: source_dir.to_string_lossy().to_string(),
        enabled: true,
    })
}

fn list_skills_in_dir(source: &str, dir: &Path) -> Vec<LocalUserSkillDescriptor> {
    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(e) => {
            debug!("无法读取 skill 目录 {:?}: {}", dir, e);
            return Vec::new();
        }
    };

    let mut skills = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(descriptor) = read_skill_descriptor(source, dir, &path) {
                skills.push(descriptor);
            }
        }
    }
    skills
}

fn list_local_user_skills() -> ListLocalUserSkillsResult {
    let search_dirs = skill_search_dirs();
    let mut skills = Vec::new();
    let mut seen = HashSet::new();

    for (source, dir) in &search_dirs {
        for skill in list_skills_in_dir(source, dir) {
            let key = format!("{}::{}", skill.source, skill.name);
            if seen.contains(&key) {
                continue;
            }
            seen.insert(key);
            skills.push(skill);
        }
    }

    skills.sort_by(|a, b| a.name.cmp(&b.name));

    ListLocalUserSkillsResult {
        skills,
        searched_dirs: search_dirs
            .into_iter()
            .map(|(_, path)| path.to_string_lossy().to_string())
            .collect(),
    }
}

/// 实际注册 skills.* 方法
pub async fn register_skills_methods(router: Arc<RpcRouter>) {
    info!("注册 Skills RPC 方法...");
    router
        .register("skills.listLocal", move |_params: Option<Value>| {
            async move {
                let result = list_local_user_skills();
                serde_json::to_value(result)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;
}

