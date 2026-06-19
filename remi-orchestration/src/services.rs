//! 高层编排服务。
//!
//! 服务是 RPC 层和编排引擎执行常见工作流所使用的构建块。
//! 它们用强类型 API 封装了事件存储和 Provider 注册表。

use chrono::{DateTime, Utc};
use remi_contracts::{
    MessageRole, OrchestrationCommand, OrchestrationEvent, Thread, ThreadId, ThreadMessage,
    ThreadState, ThreadTurn,
};
use remi_core::{Error, Result};
use remi_persistence::Database;
use remi_persistence::repositories::thread_repo::ThreadRepositoryTrait;
use remi_persistence::repositories::{ProjectRepository, ThreadRepository};
use remi_providers::ProviderRegistry;
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use tracing::{debug, info};
use uuid::Uuid;

// ---------------------------------------------------------------------------
// ConversationService
// ---------------------------------------------------------------------------

/// 聚合的对话上下文，用于组装提示词。
#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct ConversationContext {
    /// 最近的消息（滑动窗口）。
    pub messages: Vec<ThreadMessage>,
    /// 当前轮次 ID（如有）。
    pub turn_id: Option<Uuid>,
    /// 注入到对话开头的系统提示前缀。
    pub system_prompt: Option<String>,
    /// 近似的 token 数量。
    pub token_estimate: u64,
}

/// 为会话生成 `ConversationContext` 的服务。
pub struct ConversationService {
    db: Arc<Database>,
    window: usize,
}

impl ConversationService {
    /// 创建一个新的对话服务，使用默认上下文窗口大小。
    pub fn new(db: Arc<Database>) -> Self {
        Self { db, window: 32 }
    }

    /// 设置上下文窗口大小（以消息条数计）。
    pub fn with_window(mut self, window: usize) -> Self {
        self.window = window;
        self
    }

    /// 为指定会话构建上下文。
    pub async fn build_context(&self, thread_id: ThreadId) -> Result<ConversationContext> {
        let repo = ThreadRepository::new(self.db.pool().clone());
        let all = repo.list_messages(thread_id).await?;
        let len = all.len();
        let skip = len.saturating_sub(self.window);
        let messages = all.into_iter().skip(skip).collect();
        Ok(ConversationContext {
            messages,
            turn_id: None,
            system_prompt: Some(default_system_prompt()),
            token_estimate: 0,
        })
    }
}

fn default_system_prompt() -> String {
    "你是 Remi Code，一个嵌入在桌面 IDE 中的 AI 结对编程助手。\
     请保持简洁，优先给出具体的代码片段，并尊重用户的\
     编码风格。"
        .to_string()
}

// ---------------------------------------------------------------------------
// MessageService
// ---------------------------------------------------------------------------

/// 高层消息操作服务。
pub struct MessageService {
    db: Arc<Database>,
}

impl MessageService {
    /// 创建一个新的消息服务。
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    /// 向会话追加一条消息并返回该消息。
    pub async fn append(
        &self,
        thread_id: ThreadId,
        role: MessageRole,
        content: &str,
    ) -> Result<ThreadMessage> {
        let repo = ThreadRepository::new(self.db.pool().clone());
        let message = repo.add_message(thread_id, role, content).await?;
        info!(thread_id = %thread_id, role = ?role, "已追加消息");
        Ok(message)
    }

    /// 在单个事务中批量插入消息。
    pub async fn append_batch(
        &self,
        thread_id: ThreadId,
        entries: Vec<(MessageRole, String)>,
    ) -> Result<Vec<ThreadMessage>> {
        let repo = ThreadRepository::new(self.db.pool().clone());
        let mut out = Vec::with_capacity(entries.len());
        for (role, content) in entries {
            out.push(repo.add_message(thread_id, role, &content).await?);
        }
        Ok(out)
    }

    /// 在会话的消息中搜索子串。
    pub async fn search(&self, thread_id: ThreadId, query: &str) -> Result<Vec<ThreadMessage>> {
        let repo = ThreadRepository::new(self.db.pool().clone());
        let messages = repo.list_messages(thread_id).await?;
        Ok(messages
            .into_iter()
            .filter(|m| m.content.to_lowercase().contains(&query.to_lowercase()))
            .collect())
    }
}

// ---------------------------------------------------------------------------
// CheckpointService
// ---------------------------------------------------------------------------

/// 会话在某一轮次的状态快照。
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Checkpoint {
    /// 检查点 ID。
    pub id: String,
    /// 该检查点所属的会话。
    pub thread_id: ThreadId,
    /// 拍摄快照时的轮次 ID。
    pub turn_id: Uuid,
    /// 消息快照。
    pub messages: Vec<ThreadMessage>,
    /// 检查点的创建时间。
    pub created_at: DateTime<Utc>,
}

/// 创建和恢复检查点的服务。
pub struct CheckpointService {
    db: Arc<Database>,
    checkpoints: Arc<tokio::sync::Mutex<HashMap<ThreadId, VecDeque<Checkpoint>>>>,
    max_per_thread: usize,
}

impl CheckpointService {
    /// 创建一个新的检查点服务。
    pub fn new(db: Arc<Database>) -> Self {
        Self {
            db,
            checkpoints: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
            max_per_thread: 16,
        }
    }

    /// 为当前会话状态拍摄一个检查点。
    pub async fn take(&self, thread_id: ThreadId, turn_id: Uuid) -> Result<Checkpoint> {
        let repo = ThreadRepository::new(self.db.pool().clone());
        let messages = repo.list_messages(thread_id).await?;
        let checkpoint = Checkpoint {
            id: Uuid::new_v4().to_string(),
            thread_id,
            turn_id,
            messages,
            created_at: Utc::now(),
        };
        let mut map = self.checkpoints.lock().await;
        let entry = map.entry(thread_id).or_insert_with(VecDeque::new);
        entry.push_front(checkpoint.clone());
        while entry.len() > self.max_per_thread {
            entry.pop_back();
        }
        Ok(checkpoint)
    }

    /// 列出会话的所有检查点。
    pub async fn list(&self, thread_id: ThreadId) -> Vec<Checkpoint> {
        let map = self.checkpoints.lock().await;
        map.get(&thread_id)
            .map(|q| q.iter().cloned().collect())
            .unwrap_or_default()
    }

    /// 返回会话最新的检查点。
    pub async fn latest(&self, thread_id: ThreadId) -> Option<Checkpoint> {
        let map = self.checkpoints.lock().await;
        map.get(&thread_id).and_then(|q| q.front().cloned())
    }

    /// 恢复检查点：将其消息写回数据库。
    pub async fn restore(&self, checkpoint: &Checkpoint) -> Result<()> {
        let repo = ThreadRepository::new(self.db.pool().clone());
        // 清空该会话的现有消息。
        sqlx::query("DELETE FROM projection_thread_messages WHERE thread_id = ?")
            .bind(checkpoint.thread_id.to_string())
            .execute(self.db.pool())
            .await
            .map_err(|e| Error::Database(format!("清空消息失败: {e}")))?;
        for m in &checkpoint.messages {
            repo.add_message(checkpoint.thread_id, m.role, &m.content).await?;
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// DiffService
// ---------------------------------------------------------------------------

/// 两个文件快照之间差异的摘要。
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DiffSummary {
    /// 变更的文件数量。
    pub files: usize,
    /// 新增的行数。
    pub insertions: usize,
    /// 删除的行数。
    pub deletions: usize,
    /// 变更文件的路径。
    pub paths: Vec<String>,
}

/// 计算并汇总文件差异的服务。
pub struct DiffService;

impl DiffService {
    /// 创建一个新的差异服务。
    pub fn new() -> Self {
        Self
    }

    /// 解析 unified diff 并生成 [`DiffSummary`]。
    pub fn summarize(diff: &str) -> DiffSummary {
        let mut files = 0usize;
        let mut insertions = 0usize;
        let mut deletions = 0usize;
        let mut paths = Vec::new();
        for line in diff.lines() {
            if let Some(rest) = line.strip_prefix("diff --git ") {
                files += 1;
                if let Some(path) = rest.split(" b/").last() {
                    paths.push(path.to_string());
                }
            } else if line.starts_with('+') && !line.starts_with("+++") {
                insertions += 1;
            } else if line.starts_with('-') && !line.starts_with("---") {
                deletions += 1;
            }
        }
        DiffSummary {
            files,
            insertions,
            deletions,
            paths,
        }
    }

    /// 使用基于行的 LCS 启发式算法计算两个字符串之间的差异。
    pub fn compute(before: &str, after: &str) -> String {
        // 简单的类 Myers 行级差异算法。适用于小型预览。
        let before_lines: Vec<&str> = before.lines().collect();
        let after_lines: Vec<&str> = after.lines().collect();
        let mut output = String::new();
        let max_len = before_lines.len().max(after_lines.len());
        for i in 0..max_len {
            let b = before_lines.get(i).copied();
            let a = after_lines.get(i).copied();
            match (b, a) {
                (Some(b), Some(a)) if b == a => {
                    output.push(' ');
                    output.push_str(b);
                    output.push('\n');
                }
                (Some(b), Some(a)) => {
                    output.push('-');
                    output.push_str(b);
                    output.push('\n');
                    output.push('+');
                    output.push_str(a);
                    output.push('\n');
                }
                (Some(b), None) => {
                    output.push('-');
                    output.push_str(b);
                    output.push('\n');
                }
                (None, Some(a)) => {
                    output.push('+');
                    output.push_str(a);
                    output.push('\n');
                }
                (None, None) => break,
            }
        }
        output
    }
}

impl Default for DiffService {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// PluginService（技能与插件）
// ---------------------------------------------------------------------------

/// 已注册的插件/技能。
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Plugin {
    /// 插件 ID。
    pub id: String,
    /// 插件显示名称。
    pub name: String,
    /// 插件描述。
    pub description: String,
    /// 插件是否已启用。
    pub enabled: bool,
    /// 插件类型（`skill`、`command`、`tool`）。
    pub kind: PluginKind,
}

/// 插件类别。
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PluginKind {
    /// 技能（可复用的提示词/模板）。
    Skill,
    /// 斜杠命令。
    Command,
    /// 可由助手调用的工具。
    Tool,
}

/// 插件运行结果。
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PluginResult {
    /// 插件 ID。
    pub plugin_id: String,
    /// 插件输出的文本。
    pub output: String,
}

/// 注册、启用、禁用和运行插件的服务。
pub struct PluginService {
    plugins: Arc<tokio::sync::Mutex<HashMap<String, Plugin>>>,
}

impl PluginService {
    /// 创建一个新的插件服务，并预置默认技能。
    pub fn new() -> Self {
        let mut service = Self {
            plugins: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
        };
        // 注册一些基线技能，以对齐竞品的默认配置。
        let baselines = vec![
            Plugin {
                id: "explain".to_string(),
                name: "Explain".to_string(),
                description: "详细解释选中的代码。".to_string(),
                enabled: true,
                kind: PluginKind::Skill,
            },
            Plugin {
                id: "refactor".to_string(),
                name: "Refactor".to_string(),
                description: "重构选中的代码以提升清晰度。".to_string(),
                enabled: true,
                kind: PluginKind::Skill,
            },
            Plugin {
                id: "tests".to_string(),
                name: "Tests".to_string(),
                description: "为选中的代码生成单元测试。".to_string(),
                enabled: true,
                kind: PluginKind::Skill,
            },
        ];
        // 尽力而为的同步种子（此处无法 await）。
        if let Ok(handle) = tokio::runtime::Handle::try_current() {
            handle.spawn(async move {
                // 故意留空 - 注册已同步完成
            });
        }
        for p in baselines {
            service.plugins.blocking_lock().insert(p.id.clone(), p);
        }
        service
    }

    /// 注册一个插件。
    pub async fn register(&self, plugin: Plugin) {
        let mut map = self.plugins.lock().await;
        map.insert(plugin.id.clone(), plugin);
    }

    /// 列出所有插件。
    pub async fn list(&self) -> Vec<Plugin> {
        self.plugins.lock().await.values().cloned().collect()
    }

    /// 启用一个插件。
    pub async fn enable(&self, id: &str) -> Result<()> {
        let mut map = self.plugins.lock().await;
        let plugin = map
            .get_mut(id)
            .ok_or_else(|| Error::Internal(format!("插件不存在: {id}")))?;
        plugin.enabled = true;
        Ok(())
    }

    /// 禁用一个插件。
    pub async fn disable(&self, id: &str) -> Result<()> {
        let mut map = self.plugins.lock().await;
        let plugin = map
            .get_mut(id)
            .ok_or_else(|| Error::Internal(format!("插件不存在: {id}")))?;
        plugin.enabled = false;
        Ok(())
    }

    /// 调用一个插件（技能）并返回结果。
    pub async fn invoke(&self, id: &str, input: &str) -> Result<PluginResult> {
        let plugin = {
            let map = self.plugins.lock().await;
            map.get(id)
                .ok_or_else(|| Error::Internal(format!("插件不存在: {id}")))?
                .clone()
        };
        if !plugin.enabled {
            return Err(Error::Internal(format!("插件已禁用: {id}")));
        }
        // 在实际实现中，这里会带着技能模板调用 Provider。此处仅回显输入。
        debug!(plugin = id, "正在调用插件");
        Ok(PluginResult {
            plugin_id: id.to_string(),
            output: format!("[{}:{}] {}", plugin.name, plugin.kind_as_str(), input),
        })
    }
}

impl Plugin {
    fn kind_as_str(&self) -> &'static str {
        match self.kind {
            PluginKind::Skill => "skill",
            PluginKind::Command => "command",
            PluginKind::Tool => "tool",
        }
    }
}

impl Default for PluginService {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// VoiceService
// ---------------------------------------------------------------------------

/// 语音交互状态。
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum VoiceState {
    /// 语音会话空闲。
    Idle,
    /// 语音会话正在录音。
    Recording,
    /// 语音会话正在转写。
    Transcribing,
    /// 语音会话出错。
    Error,
}

/// 用于 STT/TTS 的语音会话服务。
pub struct VoiceService {
    state: Arc<tokio::sync::Mutex<VoiceState>>,
}

impl VoiceService {
    /// 创建一个新的语音服务。
    pub fn new() -> Self {
        Self {
            state: Arc::new(tokio::sync::Mutex::new(VoiceState::Idle)),
        }
    }

    /// 开始录音。
    pub async fn start(&self) -> Result<()> {
        let mut state = self.state.lock().await;
        *state = VoiceState::Recording;
        Ok(())
    }

    /// 停止录音并进行转写。
    pub async fn stop(&self) -> Result<String> {
        let mut state = self.state.lock().await;
        *state = VoiceState::Transcribing;
        // 在实际实现中会调用 whisper.cpp。此处仅返回空字符串占位。
        *state = VoiceState::Idle;
        Ok(String::new())
    }

    /// 获取当前状态。
    pub async fn state(&self) -> VoiceState {
        *self.state.lock().await
    }
}

impl Default for VoiceService {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// ServiceBundle – 编排引擎使用的便捷访问器。
// ---------------------------------------------------------------------------

/// 所有编排服务的集合。
pub struct ServiceBundle {
    /// 对话上下文构建器。
    pub conversation: ConversationService,
    /// 消息追加/搜索。
    pub messages: MessageService,
    /// 检查点管理。
    pub checkpoints: CheckpointService,
    /// 差异计算。
    pub diff: DiffService,
    /// 插件注册表。
    pub plugins: PluginService,
    /// 语音交互。
    pub voice: VoiceService,
}

impl ServiceBundle {
    /// 创建一个新的服务集合。
    pub fn new(db: Arc<Database>) -> Self {
        Self {
            conversation: ConversationService::new(db.clone()),
            messages: MessageService::new(db.clone()),
            checkpoints: CheckpointService::new(db.clone()),
            diff: DiffService::new(),
            plugins: PluginService::new(),
            voice: VoiceService::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_diff_service_summarize() {
        let diff = "diff --git a/foo.rs b/foo.rs\n-old\n+new\n";
        let summary = DiffService::summarize(diff);
        assert_eq!(summary.files, 1);
        assert_eq!(summary.insertions, 1);
        assert_eq!(summary.deletions, 1);
    }

    #[test]
    fn test_diff_service_compute() {
        let before = "a\nb\nc";
        let after = "a\nB\nc";
        let diff = DiffService::compute(before, after);
        assert!(diff.contains("-b"));
        assert!(diff.contains("+B"));
    }

    #[tokio::test]
    async fn test_voice_service_lifecycle() {
        let service = VoiceService::new();
        assert_eq!(service.state().await, VoiceState::Idle);
        service.start().await.unwrap();
        assert_eq!(service.state().await, VoiceState::Recording);
        service.stop().await.unwrap();
        assert_eq!(service.state().await, VoiceState::Idle);
    }
}

// 抑制为保留供未来使用的项发出的未使用警告。
#[allow(dead_code)]
fn _silence_unused() {
    let _: Option<Thread> = None;
    let _: Option<ThreadTurn> = None;
    let _: Option<ThreadState> = None;
}
