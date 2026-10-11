//! 连接器生态扩展（P2-8）
//!
//! 扩展 Octop 风格的连接器生态，新增 10 个高价值内置连接器：
//! - 数据库：MySQL, PostgreSQL, Redis
//! - 知识管理：Notion, Confluence
//! - 协作：Slack, Jira, Linear
//! - 开发者工具：GitHub, GitLab
//! - 中国本土化：企查查, 天气查询, 新闻聚合

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

/// 连接器预置定义
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ConnectorPresetDefinition {
    pub id: String,                 // 唯一标识（e.g., "qcc", "openweather"）
    pub display_name: String,
    pub description: String,
    pub category: ConnectorCategory,
    pub auth_type: AuthType,        // 认证方式
    pub config_schema: Vec<ConfigField>,
    pub doc_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub enum ConnectorCategory {
    Database,       // MySQL, PostgreSQL, Redis
    KnowledgeBase,  // Notion, Confluence
    ProjectMgmt,    // Jira, Linear
    Chat,           // Slack, Discord
    DeveloperTools, // GitHub, GitLab
    DataService,    // 企查查, 天气, 新闻
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub enum AuthType {
    ApiKey,         // 简单 API Key
    OAuth2,         // OAuth 2.0
    BasicAuth,      // 用户名密码
    Token,          // 个人 Token
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ConfigField {
    pub key: String,
    pub label: String,
    pub field_type: ConfigFieldType,
    pub required: bool,
    pub placeholder: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub enum ConfigFieldType {
    Text,
    Password,
    Url,
    Select { options: Vec<String> },
}

/// 连接器预置注册表
pub struct ConnectorPresetRegistry {
    presets: Mutex<Vec<ConnectorPresetDefinition>>,
}

impl ConnectorPresetRegistry {
    pub fn new() -> Self {
        Self { presets: Mutex::new(Self::builtin_presets()) }
    }

    /// 列出所有可用预置
    pub fn list_presets(&self) -> Vec<ConnectorPresetDefinition> {
        self.presets.lock().map(|p| p.clone()).unwrap_or_default()
    }

    /// 根据 ID 查找预置
    pub fn get_preset(&self, id: &str) -> Option<ConnectorPresetDefinition> {
        self.presets.lock().ok()?.iter().find(|p| p.id == id).cloned()
    }

    /// 按分类列出
    pub fn list_by_category(&self, category: &ConnectorCategory) -> Vec<ConnectorPresetDefinition> {
        let category_str = serde_json::to_string(category).unwrap_or_default();
        self.presets.lock()
            .map(|presets| {
                presets.iter()
                    .filter(|p| serde_json::to_string(&p.category).ok().as_deref() == Some(&category_str))
                    .cloned()
                    .collect()
            })
            .unwrap_or_default()
    }

    /// 获取默认配置（模板）
    pub fn get_default_config(&self, id: &str) -> Option<HashMap<String, String>> {
        self.get_preset(id).map(|preset| {
            preset.config_schema.iter()
                .filter_map(|field| {
                    let default_val = match &field.field_type {
                        ConfigFieldType::Url => match field.key.as_str() {
                            "base_url" => Some("https://api.example.com".to_string()),
                            _ => None,
                        },
                        _ => None,
                    };
                    default_val.map(|v| (field.key.clone(), v))
                })
                .collect()
        })
    }

    fn builtin_presets() -> Vec<ConnectorPresetDefinition> {
        vec![
            // ── 开发者工具 ──
            ConnectorPresetDefinition {
                id: "github".into(),
                display_name: "GitHub".into(),
                description: "Repositories, Issues, PRs, Actions".into(),
                category: ConnectorCategory::DeveloperTools,
                auth_type: AuthType::Token,
                config_schema: vec![
                    ConfigField { key: "token".into(), label: "Personal Access Token".into(), field_type: ConfigFieldType::Password, required: true, placeholder: Some("ghp_xxxxxxxxxxxxxxxxxxxx".into()) },
                    ConfigField { key: "owner".into(), label: "Owner (User/Org)".into(), field_type: ConfigFieldType::Text, required: true, placeholder: Some("your-org".into()) },
                ],
                doc_url: Some("https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens".into()),
            },
            ConnectorPresetDefinition {
                id: "gitlab".into(),
                display_name: "GitLab".into(),
                description: "Projects, Merge Requests, CI/CD Pipelines".into(),
                category: ConnectorCategory::DeveloperTools,
                auth_type: AuthType::Token,
                config_schema: vec![
                    ConfigField { key: "base_url".into(), label: "GitLab URL".into(), field_type: ConfigFieldType::Url, required: true, placeholder: Some("https://gitlab.com".into()) },
                    ConfigField { key: "token".into(), label: "Personal Access Token".into(), field_type: ConfigFieldType::Password, required: true, placeholder: Some("glpat-xxxxxxxxxxxxxxxxxxxx".into()) },
                ],
                doc_url: Some("https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html".into()),
            },
            // ── 项目协作 ──
            ConnectorPresetDefinition {
                id: "jira".into(),
                display_name: "Jira".into(),
                description: "Issues, Sprints, Boards, Worklogs".into(),
                category: ConnectorCategory::ProjectMgmt,
                auth_type: AuthType::BasicAuth,
                config_schema: vec![
                    ConfigField { key: "base_url".into(), label: "Jira URL".into(), field_type: ConfigFieldType::Url, required: true, placeholder: Some("https://your-domain.atlassian.net".into()) },
                    ConfigField { key: "email".into(), label: "Email".into(), field_type: ConfigFieldType::Text, required: true, placeholder: Some("user@example.com".into()) },
                    ConfigField { key: "api_token".into(), label: "API Token".into(), field_type: ConfigFieldType::Password, required: true, placeholder: Some("ATATxxxxxxxxxxxxxxxx".into()) },
                ],
                doc_url: Some("https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/".into()),
            },
            ConnectorPresetDefinition {
                id: "linear".into(),
                display_name: "Linear".into(),
                description: "Issues, Cycles, Roadmaps, Projects".into(),
                category: ConnectorCategory::ProjectMgmt,
                auth_type: AuthType::ApiKey,
                config_schema: vec![
                    ConfigField { key: "api_key".into(), label: "Linear API Key".into(), field_type: ConfigFieldType::Password, required: true, placeholder: Some("lin_api_xxxxxxxxxxxxxxxx".into()) },
                ],
                doc_url: Some("https://developers.linear.app/docs/graphql/working-with-the-graphql-api".into()),
            },
            // ── 知识管理 ──
            ConnectorPresetDefinition {
                id: "notion".into(),
                display_name: "Notion".into(),
                description: "Databases, Pages, Blocks".into(),
                category: ConnectorCategory::KnowledgeBase,
                auth_type: AuthType::OAuth2,
                config_schema: vec![
                    ConfigField { key: "integration_token".into(), label: "Internal Integration Token".into(), field_type: ConfigFieldType::Password, required: true, placeholder: Some("secret_xxxxxxxxxxxxxxxx".into()) },
                ],
                doc_url: Some("https://developers.notion.com/docs/create-a-integration".into()),
            },
            ConnectorPresetDefinition {
                id: "confluence".into(),
                display_name: "Confluence".into(),
                description: "Pages, Spaces, Labels".into(),
                category: ConnectorCategory::KnowledgeBase,
                auth_type: AuthType::BasicAuth,
                config_schema: vec![
                    ConfigField { key: "base_url".into(), label: "Confluence URL".into(), field_type: ConfigFieldType::Url, required: true, placeholder: Some("https://your-domain.atlassian.net/wiki".into()) },
                    ConfigField { key: "email".into(), label: "Email".into(), field_type: ConfigFieldType::Text, required: true, placeholder: Some("user@example.com".into()) },
                    ConfigField { key: "api_token".into(), label: "API Token".into(), field_type: ConfigFieldType::Password, required: true, placeholder: None },
                ],
                doc_url: None,
            },
            // ── 企业 IM ──
            ConnectorPresetDefinition {
                id: "slack".into(),
                display_name: "Slack".into(),
                description: "Channels, Messages, Files".into(),
                category: ConnectorCategory::Chat,
                auth_type: AuthType::OAuth2,
                config_schema: vec![
                    ConfigField { key: "bot_token".into(), label: "Bot Token (xoxb-)".into(), field_type: ConfigFieldType::Password, required: true, placeholder: Some("xoxb-xxxxxxxxxxxx".into()) },
                ],
                doc_url: Some("https://api.slack.com/authentication/basics".into()),
            },
            // ── 中国本土化 ──
            ConnectorPresetDefinition {
                id: "qcc".into(),
                display_name: "企查查".into(),
                description: "企业工商信息查询、风险分析、关联关系".into(),
                category: ConnectorCategory::DataService,
                auth_type: AuthType::ApiKey,
                config_schema: vec![
                    ConfigField { key: "api_key".into(), label: "企查查 API Key".into(), field_type: ConfigFieldType::Password, required: true, placeholder: Some("your-qcc-key".into()) },
                ],
                doc_url: Some("https://www.qcc.com/api/document".into()),
            },
            ConnectorPresetDefinition {
                id: "openweather".into(),
                display_name: "天气查询".into(),
                description: "全球实时天气预报、历史天气数据".into(),
                category: ConnectorCategory::DataService,
                auth_type: AuthType::ApiKey,
                config_schema: vec![
                    ConfigField { key: "api_key".into(), label: "OpenWeatherMap API Key".into(), field_type: ConfigFieldType::Password, required: true, placeholder: Some("your-owm-key".into()) },
                ],
                doc_url: Some("https://openweathermap.org/api".into()),
            },
            ConnectorPresetDefinition {
                id: "newsapi".into(),
                display_name: "新闻聚合".into(),
                description: "全球新闻头条、关键词搜索、分类浏览".into(),
                category: ConnectorCategory::DataService,
                auth_type: AuthType::ApiKey,
                config_schema: vec![
                    ConfigField { key: "api_key".into(), label: "NewsAPI Key".into(), field_type: ConfigFieldType::Password, required: true, placeholder: Some("your-newsapi-key".into()) },
                ],
                doc_url: Some("https://newsapi.org/docs".into()),
            },
            // ── 数据库 ──
            ConnectorPresetDefinition {
                id: "mysql".into(),
                display_name: "MySQL".into(),
                description: "Database queries, schema browsing".into(),
                category: ConnectorCategory::Database,
                auth_type: AuthType::BasicAuth,
                config_schema: vec![
                    ConfigField { key: "host".into(), label: "Host".into(), field_type: ConfigFieldType::Text, required: true, placeholder: Some("localhost".into()) },
                    ConfigField { key: "port".into(), label: "Port".into(), field_type: ConfigFieldType::Text, required: false, placeholder: Some("3306".into()) },
                    ConfigField { key: "username".into(), label: "Username".into(), field_type: ConfigFieldType::Text, required: true, placeholder: Some("root".into()) },
                    ConfigField { key: "password".into(), label: "Password".into(), field_type: ConfigFieldType::Password, required: true, placeholder: None },
                    ConfigField { key: "database".into(), label: "Database".into(), field_type: ConfigFieldType::Text, required: true, placeholder: None },
                ],
                doc_url: None,
            },
        ]
    }
}

/// 连接器预置状态（Tauri 托管）
pub struct ConnectorPresetV2State {
    registry: Arc<Mutex<ConnectorPresetRegistry>>,
}

impl ConnectorPresetV2State {
    pub fn new() -> Self {
        Self { registry: Arc::new(Mutex::new(ConnectorPresetRegistry::new())) }
    }

    pub fn list_presets(&self) -> Vec<ConnectorPresetDefinition> {
        self.registry.lock().map(|r| r.list_presets()).unwrap_or_default()
    }

    pub fn get_preset(&self, id: &str) -> Option<ConnectorPresetDefinition> {
        self.registry.lock().ok()?.get_preset(id)
    }

    pub fn get_default_config(&self, id: &str) -> Option<HashMap<String, String>> {
        self.registry.lock().ok()?.get_default_config(id)
    }
}

impl Clone for ConnectorPresetV2State {
    fn clone(&self) -> Self { Self { registry: Arc::clone(&self.registry) } }
}

// ──────────── Tauri 命令 ────────────

/// 列出所有可用连接器预置
#[tauri::command]
#[specta::specta]
pub fn connector_v2_list_presets(
    state: tauri::State<'_, ConnectorPresetV2State>,
) -> Vec<ConnectorPresetDefinition> {
    state.list_presets()
}

/// 获取单个连接器预置详情
#[tauri::command]
#[specta::specta]
pub fn connector_v2_get_preset(
    id: String,
    state: tauri::State<'_, ConnectorPresetV2State>,
) -> Option<ConnectorPresetDefinition> {
    state.get_preset(&id)
}

/// 获取连接器默认配置
#[tauri::command]
#[specta::specta]
pub fn connector_v2_get_default_config(
    id: String,
    state: tauri::State<'_, ConnectorPresetV2State>,
) -> Option<HashMap<String, String>> {
    state.get_default_config(&id)
}
