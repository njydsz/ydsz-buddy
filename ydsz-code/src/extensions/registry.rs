//! # Extension 注册表

use std::collections::HashMap;
use std::sync::Arc;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use super::manifest::ExtensionManifest;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExtensionState { Installed, Activated, Deactivated, Error }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionEntry {
    pub manifest: ExtensionManifest,
    pub install_path: String,
    pub state: ExtensionState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub struct ExtensionRegistry {
    extensions: Arc<RwLock<HashMap<String, ExtensionEntry>>>,
}

impl ExtensionRegistry {
    pub fn new() -> Self { Self { extensions: Arc::new(RwLock::new(HashMap::new())) } }
    pub fn register(&self, entry: ExtensionEntry) { self.extensions.write().insert(entry.manifest.name.clone(), entry); }
    pub fn unregister(&self, name: &str) -> Option<ExtensionEntry> { self.extensions.write().remove(name) }
    pub fn get(&self, name: &str) -> Option<ExtensionEntry> { self.extensions.read().get(name).cloned() }
    pub fn list(&self) -> Vec<ExtensionEntry> { self.extensions.read().values().cloned().collect() }
    pub fn list_activated(&self) -> Vec<ExtensionEntry> { self.extensions.read().values().filter(|e| e.state == ExtensionState::Activated).cloned().collect() }
    pub fn update_state(&self, name: &str, state: ExtensionState) { if let Some(e) = self.extensions.write().get_mut(name) { e.state = state; } }
    pub fn list_commands(&self) -> Vec<super::manifest::CommandContribution> {
        self.extensions.read().values().filter(|e| e.state == ExtensionState::Activated).flat_map(|e| e.manifest.contributes.commands.clone()).collect()
    }
}
impl Default for ExtensionRegistry { fn default() -> Self { Self::new() } }

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::manifest::ExtensionContribution;

    fn make_ext(name: &str) -> ExtensionEntry {
        ExtensionEntry {
            manifest: ExtensionManifest { name: name.to_string(), version: "1.0.0".to_string(), display_name: name.to_string(), description: String::new(), author: String::new(), categories: vec![], main: None, contributes: ExtensionContribution::default(), extension_dependencies: vec![], activation_events: vec![] },
            install_path: "/test".to_string(), state: ExtensionState::Installed, error: None,
        }
    }
    #[test] fn register_and_get() { let r = ExtensionRegistry::new(); r.register(make_ext("ext1")); assert!(r.get("ext1").is_some()); }
    #[test] fn list_activated() { let r = ExtensionRegistry::new(); r.register(make_ext("ext1")); r.update_state("ext1", ExtensionState::Activated); r.register(make_ext("ext2")); assert_eq!(r.list_activated().len(), 1); }
}
