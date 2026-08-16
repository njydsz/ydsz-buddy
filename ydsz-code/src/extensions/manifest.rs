//! # Extension Manifest (extension.json)

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionManifest {
    pub name: String,
    pub version: String,
    pub display_name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub categories: Vec<String>,
    #[serde(default)]
    pub main: Option<String>,
    #[serde(default)]
    pub contributes: ExtensionContribution,
    #[serde(default)]
    pub extension_dependencies: Vec<String>,
    #[serde(default)]
    pub activation_events: Vec<ActivationEvent>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionContribution {
    #[serde(default)]
    pub commands: Vec<CommandContribution>,
    #[serde(default)]
    pub menus: Vec<MenuContribution>,
    #[serde(default)]
    pub settings: Vec<SettingContribution>,
    #[serde(default)]
    pub providers: Vec<ProviderContribution>,
    #[serde(default)]
    pub languages: Vec<LanguageContribution>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandContribution {
    pub id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub keybinding: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MenuContribution {
    pub menu_id: String,
    pub command: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group: Option<String>,
    #[serde(default)]
    pub order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingContribution {
    pub key: String,
    pub default: serde_json::Value,
    pub setting_type: String,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderContribution {
    pub display_name: String,
    pub protocol: String,
    pub default_model: String,
    #[serde(default)]
    pub models: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanguageContribution {
    pub id: String,
    pub extensions: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub syntax_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ActivationEvent {
    OnStartup,
    OnCommand { command_id: String },
    OnLanguage { language: String },
    OnFile { glob: String },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_manifest() {
        let json = r#"{"name":"my-ext","version":"1.0.0","displayName":"My Extension","contributes":{"commands":[{"id":"my-ext.hello","title":"Hello"}],"settings":[{"key":"my-ext.greeting","default":"Hi","settingType":"string"}]}}"#;
        let m: ExtensionManifest = serde_json::from_str(json).unwrap();
        assert_eq!(m.name, "my-ext");
        assert_eq!(m.contributes.commands.len(), 1);
    }

    #[test]
    fn parse_minimal() {
        let json = r#"{"name":"test","version":"0.1.0","displayName":"Test"}"#;
        let m: ExtensionManifest = serde_json::from_str(json).unwrap();
        assert_eq!(m.name, "test");
    }
}
