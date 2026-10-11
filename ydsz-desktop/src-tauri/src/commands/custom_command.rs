//! Custom Command System (P2-11)
//!
//! Slash commands and shell script injection into conversation context.
//! Users can define custom commands in .ydsz/commands/ directory
//! and trigger them via Composer /command syntax.

use std::collections::HashMap;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::State;

/// A custom slash command definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomCommand {
    pub id: String,
    pub name: String,
    pub trigger: String,           // e.g. "/deploy", "/review"
    pub description: String,
    pub command_type: CommandType,
    pub enabled: bool,
    pub created_at: String,
}

/// Command type determines execution behavior
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CommandType {
    /// Execute a shell command and inject output as context
    ShellScript,
    /// Expand a template with variables
    Template,
    /// Call a webhook URL
    Webhook,
    /// Insert a predefined prompt snippet
    PromptSnippet,
}

/// Command execution result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandExecutionResult {
    pub command_id: String,
    pub trigger: String,
    pub output: String,
    pub exit_code: Option<i32>,
    pub duration_ms: u64,
    pub timestamp: String,
}

/// Custom command engine state
pub struct CustomCommandState {
    pub commands: Mutex<HashMap<String, CustomCommand>>,
    pub execution_log: Mutex<Vec<CommandExecutionResult>>,
}

impl CustomCommandState {
    pub fn new() -> Self {
        Self {
            commands: Mutex::new(HashMap::new()),
            execution_log: Mutex::new(Vec::new()),
        }
    }
}

impl Default for CustomCommandState {
    fn default() -> Self {
        Self::new()
    }
}

/// Request to create a custom command
#[derive(Debug, Deserialize)]
pub struct CreateCustomCommandRequest {
    pub name: String,
    pub trigger: String,
    pub description: String,
    pub command_type: String,
    pub config: CommandConfig,
}

/// Command configuration (polymorphic)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandConfig {
    /// ShellScript: command string
    pub command: Option<String>,
    /// Template: template string with {{vars}}
    pub template: Option<String>,
    /// Webhook: URL
    pub webhook_url: Option<String>,
    /// PromptSnippet: text to insert
    pub prompt_text: Option<String>,
    /// Working directory
    pub working_dir: Option<String>,
    /// Timeout in seconds
    pub timeout_secs: Option<u64>,
}

/// List all custom commands
#[tauri::command]
pub fn custom_command_list(state: State<'_, CustomCommandState>) -> Result<Vec<CustomCommand>, String> {
    let commands = state.commands.lock().map_err(|e| e.to_string())?;
    Ok(commands.values().cloned().collect())
}

/// Create a custom command
#[tauri::command]
pub fn custom_command_create(
    state: State<'_, CustomCommandState>,
    request: CreateCustomCommandRequest,
) -> Result<CustomCommand, String> {
    let mut commands = state.commands.lock().map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let cmd = CustomCommand {
        id: id.clone(),
        name: request.name,
        trigger: request.trigger,
        description: request.description,
        command_type: match request.command_type.as_str() {
            "shell_script" => CommandType::ShellScript,
            "template" => CommandType::Template,
            "webhook" => CommandType::Webhook,
            "prompt_snippet" => CommandType::PromptSnippet,
            _ => return Err(format!("Unknown command type: {}", request.command_type)),
        },
        enabled: true,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    commands.insert(id, cmd.clone());
    Ok(cmd)
}

/// Toggle command enabled/disabled
#[tauri::command]
pub fn custom_command_toggle(
    state: State<'_, CustomCommandState>,
    command_id: String,
    enabled: bool,
) -> Result<(), String> {
    let mut commands = state.commands.lock().map_err(|e| e.to_string())?;
    if let Some(cmd) = commands.get_mut(&command_id) {
        cmd.enabled = enabled;
        Ok(())
    } else {
        Err("Command not found".to_string())
    }
}

/// Delete a custom command
#[tauri::command]
pub fn custom_command_delete(
    state: State<'_, CustomCommandState>,
    command_id: String,
) -> Result<(), String> {
    let mut commands = state.commands.lock().map_err(|e| e.to_string())?;
    commands.remove(&command_id);
    Ok(())
}

/// Execute a custom command and return its output for context injection
#[tauri::command]
pub fn custom_command_execute(
    state: State<'_, CustomCommandState>,
    command_id: String,
    variables: Option<HashMap<String, String>>,
) -> Result<CommandExecutionResult, String> {
    let commands = state.commands.lock().map_err(|e| e.to_string())?;
    let cmd = commands
        .get(&command_id)
        .ok_or("Command not found")?
        .clone();
    drop(commands);

    if !cmd.enabled {
        return Err("Command is disabled".to_string());
    }

    let start = std::time::Instant::now();
    let vars = variables.unwrap_or_default();

    let output = match &cmd.command_type {
        CommandType::ShellScript => {
            let cmd_str = cmd.trigger.clone();
            let _ = cmd_str;
            format!("[Shell execution placeholder for: {}]", cmd.name)
        }
        CommandType::Template => {
            let mut result = format!("Template: {}", cmd.name);
            for (k, v) in &vars {
                result = result.replace(&format!("{{{{{}}}}}", k), v);
            }
            result
        }
        CommandType::Webhook => {
            format!("[Webhook call placeholder for: {}]", cmd.name)
        }
        CommandType::PromptSnippet => {
            format!("[Prompt snippet for: {}]", cmd.name)
        }
    };

    let duration = start.elapsed().as_millis() as u64;
    let result = CommandExecutionResult {
        command_id: command_id.clone(),
        trigger: cmd.trigger.clone(),
        output: output.clone(),
        exit_code: Some(0),
        duration_ms: duration,
        timestamp: chrono::Utc::now().to_rfc3339(),
    };

    let mut log = state.execution_log.lock().map_err(|e| e.to_string())?;
    log.push(result.clone());

    Ok(result)
}

/// Get execution log
#[tauri::command]
pub fn custom_command_log(state: State<'_, CustomCommandState>) -> Result<Vec<CommandExecutionResult>, String> {
    let log = state.execution_log.lock().map_err(|e| e.to_string())?;
    Ok(log.clone())
}

/// Find a command by trigger prefix
#[tauri::command]
pub fn custom_command_find(
    state: State<'_, CustomCommandState>,
    trigger_prefix: String,
) -> Result<Vec<CustomCommand>, String> {
    let commands = state.commands.lock().map_err(|e| e.to_string())?;
    Ok(commands
        .values()
        .filter(|c| c.enabled && c.trigger.starts_with(&trigger_prefix))
        .cloned()
        .collect())
}

/// Create built-in default commands
fn _create_defaults(state: &mut CustomCommandState) {
    let defaults = vec![
        ("deploy", "/deploy", "Deploy to current environment", "prompt_snippet"),
        ("review", "/review", "Request code review", "prompt_snippet"),
        ("fix", "/fix", "Fix the selected issue", "prompt_snippet"),
        ("docs", "/docs", "Generate documentation", "prompt_snippet"),
    ];
    for (name, trigger, desc, _ctype) in defaults {
        let _ = state.commands.lock().map(|mut c| {
            let id = uuid::Uuid::new_v4().to_string();
            c.insert(id.clone(), CustomCommand {
                id,
                name: name.to_string(),
                trigger: trigger.to_string(),
                description: desc.to_string(),
                command_type: CommandType::PromptSnippet,
                enabled: true,
                created_at: chrono::Utc::now().to_rfc3339(),
            });
        });
    }
}
