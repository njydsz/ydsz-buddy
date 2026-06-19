use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::State;

pub struct ProviderState {
    api_keys: Arc<Mutex<HashMap<String, String>>>,
}

#[derive(Debug, Serialize)]
pub struct Model {
    pub id: String,
    pub name: String,
    pub provider: String,
}

impl ProviderState {
    pub fn new() -> Self {
        Self {
            api_keys: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

#[tauri::command]
pub async fn list_models(provider: Option<String>) -> Result<Vec<Model>, String> {
    // Return a default list of supported models
    let models = vec![
        Model {
            id: "gpt-4".to_string(),
            name: "GPT-4".to_string(),
            provider: "openai".to_string(),
        },
        Model {
            id: "gpt-3.5-turbo".to_string(),
            name: "GPT-3.5 Turbo".to_string(),
            provider: "openai".to_string(),
        },
        Model {
            id: "claude-3-opus".to_string(),
            name: "Claude 3 Opus".to_string(),
            provider: "anthropic".to_string(),
        },
        Model {
            id: "claude-3-sonnet".to_string(),
            name: "Claude 3 Sonnet".to_string(),
            provider: "anthropic".to_string(),
        },
    ];
    
    if let Some(p) = provider {
        Ok(models.into_iter().filter(|m| m.provider == p).collect())
    } else {
        Ok(models)
    }
}

#[tauri::command]
pub async fn set_api_key(
    state: State<'_, ProviderState>,
    provider: String,
    key: String,
) -> Result<(), String> {
    let mut api_keys = state.api_keys.lock().map_err(|e| e.to_string())?;
    api_keys.insert(provider, key);
    Ok(())
}

#[tauri::command]
pub async fn get_provider_status(
    state: State<'_, ProviderState>,
) -> Result<serde_json::Value, String> {
    let api_keys = state.api_keys.lock().map_err(|e| e.to_string())?;
    
    let mut status = serde_json::Map::new();
    for (provider, key) in api_keys.iter() {
        status.insert(
            provider.clone(),
            serde_json::json!({
                "configured": !key.is_empty(),
            }),
        );
    }
    
    Ok(serde_json::Value::Object(status))
}
