//! # 云顶数字 契约测试（Contract Tests）
//!
//! 互联网大厂基线：
//! - **DTO 字段名稳定**：camelCase（与前端 TS 约定）
//! - **枚举值稳定**：lowercase 字符串（与前端 `Schema.Literal` 对应）
//! - **可选字段跳过**：`None` 字段在 JSON 中不出现
//! - **结构稳定**：字段类型、嵌套结构与 TS schema 一致
//!
//! ## 用法
//!
//! 每个 contract test 通过 `serde_json::to_value` 把 Rust DTO 转成 JSON，
//! 然后断言关键字段名 / 字段类型 / 字段值与契约保持一致。
//! 当 DTO 字段发生破坏性变更时（如重命名、类型变化），对应测试会失败。
//!
//! ## 同步规则
//!
//! 1. Rust 端加字段 → TS 端 `baseSchemas.ts` / `*.ts` 同步加
//! 2. Rust 端重命名字段 → TS 端同步重命名 + 通知所有调用方
//! 3. Rust 端删字段 → 灰度期保留 + `@deprecated` 标记，TS 端清除
//!
//! ## 已知契约（由本模块覆盖）
//!
//! - 领域模型：`Project` / `Thread` / `Message` / `Checkpoint` / `Activity`
//! - 事件标签：`_tag` 形如 `project.created` / `thread.message-sent`
//! - 命令标签：`_tag` 形如 `thread.turn.start` / `project.create`
//! - 枚举值：`ProjectKind` / `RuntimeMode` / `EnvMode` / `InteractionMode` / `DispatchMode` / `TurnStatus` / `CheckpointStatus` / `ProviderKind`
//! - 时间字段：ISO 8601 字符串（`DateTime<Utc>` → JSON 字符串）

use crate::commands::{
    OrchestrationCommand, ProjectCreateCommand, ThreadTurnStartCommand,
};
use crate::events::{
    EventMetadata, OrchestrationEvent, ProjectCreatedEvent, ProjectMetaUpdatedEvent,
    ProjectDeletedEvent,
};
use crate::models::{
    AssociatedWorktree, Checkpoint, CheckpointFile, CheckpointStatus, DispatchMode, EnvMode,
    InteractionMode, LatestTurn, Message, MessageRole, Project, ProjectKind, ProjectScript,
    RuntimeMode, SubagentInfo, Thread, ThreadId, TurnStatus,
};
use crate::provider::{ModelSelection, ProviderKind};

use chrono::Utc;
use serde_json::{json, Value};
use uuid::Uuid;

// ============================================================================
// 测试辅助宏：断言 JSON 字段存在
// ============================================================================

macro_rules! assert_field {
    ($v:expr, $($field:literal),+ $(,)?) => {
        $(
            assert!(
                $v.get($field).is_some(),
                "字段 `{}` 应存在于 JSON 中, got keys: {:?}",
                $field,
                $v.as_object().map(|m| m.keys().collect::<Vec<_>>()),
            );
        )+
    };
}

macro_rules! assert_field_absent {
    ($v:expr, $($field:literal),+ $(,)?) => {
        $(
            assert!(
                $v.get($field).is_none(),
                "字段 `{}` 不应出现在 JSON 中 (Option::None 应被 skip), got: {:?}",
                $field,
                $v,
            );
        )+
    };
}

fn fixed_uuid(seed: u8) -> Uuid {
    // 用固定字节序列以便 contract test 输出稳定
    let bytes = [seed; 16];
    Uuid::from_bytes(bytes)
}

// ============================================================================
// 1) Project 实体契约
// ============================================================================

#[test]
fn contract_project_uses_camel_case() {
    let p = Project {
        id: fixed_uuid(1),
        kind: ProjectKind::Local,
        title: "Demo".to_string(),
        workspace_root: "/tmp/demo".to_string(),
        default_model_selection: None,
        scripts: vec![],
        created_at: Utc::now(),
        updated_at: Utc::now(),
        deleted_at: None,
    };
    let v: Value = serde_json::to_value(&p).unwrap();

    // 必填字段存在
    assert_field!(v, "id", "kind", "title", "workspaceRoot", "scripts", "createdAt", "updatedAt");
    // 驼峰命名正确
    assert_eq!(v["workspaceRoot"], "/tmp/demo");
    assert_eq!(v["createdAt"], serde_json::to_value(p.created_at).unwrap());
    // 可选字段（None）应被跳过
    assert_field_absent!(v, "defaultModelSelection", "deletedAt");
}

#[test]
fn contract_project_kind_uses_lowercase() {
    assert_eq!(serde_json::to_value(ProjectKind::Local).unwrap(), json!("local"));
    assert_eq!(serde_json::to_value(ProjectKind::Remote).unwrap(), json!("remote"));
}

#[test]
fn contract_project_script_optional_description() {
    let s = ProjectScript {
        name: "build".to_string(),
        command: "cargo build".to_string(),
        description: None,
    };
    let v = serde_json::to_value(&s).unwrap();
    assert_field!(v, "name", "command");
    assert_field_absent!(v, "description");

    let s2 = ProjectScript {
        name: "test".to_string(),
        command: "cargo test".to_string(),
        description: Some("运行测试套件".to_string()),
    };
    let v2 = serde_json::to_value(&s2).unwrap();
    assert_eq!(v2["description"], "运行测试套件");
}

// ============================================================================
// 2) Thread 实体契约
// ============================================================================

fn empty_thread() -> Thread {
    Thread {
        id: fixed_uuid(2),
        project_id: fixed_uuid(3),
        title: "T".to_string(),
        model_selection: ModelSelection {
            provider: ProviderKind::Codex,
            model: "gpt-5".to_string(),
            options: None,
        },
        runtime_mode: RuntimeMode::Code,
        interaction_mode: InteractionMode::Agent,
        env_mode: EnvMode::Local,
        branch: None,
        worktree_path: None,
        associated_worktree: None,
        associated_worktree_branch: None,
        associated_worktree_ref: None,
        shell_summary: None,
        create_branch_flow_completed: false,
        is_pinned: false,
        parent_thread_id: None,
        subagent: None,
        fork_source_thread_id: None,
        sidechat_source_thread_id: None,
        last_known_pr: None,
        latest_turn: None,
        latest_user_message_at: None,
        has_pending_approvals: false,
        has_pending_user_input: false,
        has_actionable_proposed_plan: false,
        messages: vec![],
        proposed_plans: vec![],
        activities: vec![],
        checkpoints: vec![],
        session: None,
        created_at: Utc::now(),
        updated_at: Utc::now(),
        archived_at: None,
        deleted_at: None,
        handoff: None,
    }
}

#[test]
fn contract_thread_uses_camel_case() {
    let t = empty_thread();
    let v: Value = serde_json::to_value(&t).unwrap();

    // 必填 camelCase 字段
    assert_field!(
        v,
        "id",
        "projectId",
        "title",
        "modelSelection",
        "runtimeMode",
        "interactionMode",
        "envMode",
        "createBranchFlowCompleted",
        "isPinned",
        "hasPendingApprovals",
        "hasPendingUserInput",
        "hasActionableProposedPlan",
        "messages",
        "proposedPlans",
        "activities",
        "checkpoints",
        "createdAt",
        "updatedAt",
    );

    // 关键字段类型
    assert!(v["id"].is_string(), "id 应为 UUID 字符串");
    assert!(v["messages"].is_array());
    assert!(v["hasPendingApprovals"].is_boolean());

    // None 可选字段应跳过
    assert_field_absent!(
        v,
        "branch",
        "worktreePath",
        "associatedWorktree",
        "associatedWorktreeBranch",
        "associatedWorktreeRef",
        "shellSummary",
        "parentThreadId",
        "subagent",
        "forkSourceThreadId",
        "sidechatSourceThreadId",
        "lastKnownPr",
        "latestTurn",
        "latestUserMessageAt",
        "session",
        "archivedAt",
        "deletedAt",
        "handoff",
    );
}

#[test]
fn contract_runtime_mode_uses_lowercase() {
    assert_eq!(serde_json::to_value(RuntimeMode::Work).unwrap(), json!("work"));
    assert_eq!(serde_json::to_value(RuntimeMode::Code).unwrap(), json!("code"));
}

#[test]
fn contract_interaction_mode_uses_lowercase() {
    assert_eq!(serde_json::to_value(InteractionMode::Agent).unwrap(), json!("agent"));
    assert_eq!(serde_json::to_value(InteractionMode::Chat).unwrap(), json!("chat"));
}

#[test]
fn contract_env_mode_uses_lowercase() {
    assert_eq!(serde_json::to_value(EnvMode::Local).unwrap(), json!("local"));
    assert_eq!(serde_json::to_value(EnvMode::Worktree).unwrap(), json!("worktree"));
}

#[test]
fn contract_dispatch_mode_uses_lowercase() {
    assert_eq!(serde_json::to_value(DispatchMode::Normal).unwrap(), json!("normal"));
    assert_eq!(serde_json::to_value(DispatchMode::Review).unwrap(), json!("review"));
    assert_eq!(serde_json::to_value(DispatchMode::Plan).unwrap(), json!("plan"));
    assert_eq!(serde_json::to_value(DispatchMode::Steer).unwrap(), json!("steer"));
}

#[test]
fn contract_provider_kind_uses_lowercase() {
    assert_eq!(serde_json::to_value(ProviderKind::Codex).unwrap(), json!("codex"));
    assert_eq!(serde_json::to_value(ProviderKind::ClaudeAgent).unwrap(), json!("claudeagent"));
    assert_eq!(serde_json::to_value(ProviderKind::Cursor).unwrap(), json!("cursor"));
    assert_eq!(serde_json::to_value(ProviderKind::Gemini).unwrap(), json!("gemini"));
    assert_eq!(serde_json::to_value(ProviderKind::Grok).unwrap(), json!("grok"));
    assert_eq!(serde_json::to_value(ProviderKind::Kilo).unwrap(), json!("kilo"));
    assert_eq!(serde_json::to_value(ProviderKind::OpenCode).unwrap(), json!("opencode"));
    assert_eq!(serde_json::to_value(ProviderKind::Pi).unwrap(), json!("pi"));
    // 国内 9 家 Provider
    assert_eq!(serde_json::to_value(ProviderKind::Glm).unwrap(), json!("glm"));
    assert_eq!(serde_json::to_value(ProviderKind::DeepSeek).unwrap(), json!("deepseek"));
    assert_eq!(serde_json::to_value(ProviderKind::Moonshot).unwrap(), json!("moonshot"));
    assert_eq!(serde_json::to_value(ProviderKind::Qwen).unwrap(), json!("qwen"));
    assert_eq!(serde_json::to_value(ProviderKind::Mimo).unwrap(), json!("mimo"));
    // MiniMax 在 rename_all = "lowercase" 下输出 "minimax"
    assert_eq!(serde_json::to_value(ProviderKind::MiniMax).unwrap(), json!("minimax"));
    // 新增 3 家国内 Provider
    assert_eq!(serde_json::to_value(ProviderKind::Doubao).unwrap(), json!("doubao"));
    assert_eq!(serde_json::to_value(ProviderKind::Ernie).unwrap(), json!("ernie"));
    assert_eq!(serde_json::to_value(ProviderKind::Hunyuan).unwrap(), json!("hunyuan"));
}

#[test]
fn contract_provider_kind_display_uses_camelcase() {
    // Display impl 使用 camelCase 匹配前端契约
    assert_eq!(ProviderKind::Codex.to_string(), "codex");
    assert_eq!(ProviderKind::ClaudeAgent.to_string(), "claudeAgent");
    assert_eq!(ProviderKind::Cursor.to_string(), "cursor");
    assert_eq!(ProviderKind::Gemini.to_string(), "gemini");
    assert_eq!(ProviderKind::Grok.to_string(), "grok");
    assert_eq!(ProviderKind::Kilo.to_string(), "kilo");
    assert_eq!(ProviderKind::OpenCode.to_string(), "opencode");
    assert_eq!(ProviderKind::Pi.to_string(), "pi");
    // 国内 9 家 Provider Display 命名
    assert_eq!(ProviderKind::Glm.to_string(), "glm");
    assert_eq!(ProviderKind::DeepSeek.to_string(), "deepseek");
    assert_eq!(ProviderKind::Moonshot.to_string(), "moonshot");
    assert_eq!(ProviderKind::Qwen.to_string(), "qwen");
    assert_eq!(ProviderKind::Mimo.to_string(), "mimo");
    assert_eq!(ProviderKind::MiniMax.to_string(), "MiniMax");
    // 新增 3 家国内 Provider Display 命名
    assert_eq!(ProviderKind::Doubao.to_string(), "doubao");
    assert_eq!(ProviderKind::Ernie.to_string(), "ernie");
    assert_eq!(ProviderKind::Hunyuan.to_string(), "hunyuan");
}

#[test]
fn contract_associated_worktree_uses_camel_case_with_ref_field() {
    let w = AssociatedWorktree {
        path: "/tmp/wt".to_string(),
        branch: "feat".to_string(),
        r#ref: "refs/heads/feat".to_string(),
    };
    let v = serde_json::to_value(&w).unwrap();
    assert_field!(v, "path", "branch", "ref");
    assert_eq!(v["ref"], "refs/heads/feat");
}

#[test]
fn contract_subagent_uses_camel_case() {
    let s = SubagentInfo {
        agent_id: "agent-1".to_string(),
        nickname: "Reviewer".to_string(),
        role: "代码审查员".to_string(),
    };
    let v = serde_json::to_value(&s).unwrap();
    assert_field!(v, "agentId", "nickname", "role");
    assert_eq!(v["agentId"], "agent-1");
    assert_eq!(v["nickname"], "Reviewer");
}

// ============================================================================
// 3) Message 契约
// ============================================================================

#[test]
fn contract_message_uses_camel_case() {
    let m = Message {
        id: fixed_uuid(4),
        role: MessageRole::User,
        text: "hi".to_string(),
        attachments: vec![],
        skills: vec![],
        mentions: vec![],
        dispatch_mode: Some(DispatchMode::Normal),
        turn_id: None,
        streaming: false,
        source: None,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };
    let v: Value = serde_json::to_value(&m).unwrap();
    assert_field!(
        v,
        "id",
        "role",
        "text",
        "attachments",
        "skills",
        "mentions",
        "dispatchMode",
        "streaming",
        "createdAt",
        "updatedAt",
    );
    assert_eq!(v["role"], "user");
    assert_eq!(v["dispatchMode"], "normal");
    assert_eq!(v["streaming"], false);
    assert_field_absent!(v, "turnId", "source");
}

#[test]
fn contract_message_role_uses_lowercase() {
    assert_eq!(serde_json::to_value(MessageRole::User).unwrap(), json!("user"));
    assert_eq!(serde_json::to_value(MessageRole::Assistant).unwrap(), json!("assistant"));
    assert_eq!(serde_json::to_value(MessageRole::System).unwrap(), json!("system"));
}

// ============================================================================
// 4) Checkpoint 契约
// ============================================================================

#[test]
fn contract_checkpoint_uses_camel_case() {
    let c = Checkpoint {
        id: "cp-1".to_string(),
        thread_id: fixed_uuid(5),
        turn_id: "turn-1".to_string(),
        git_ref: "abc123".to_string(),
        description: "Test".to_string(),
        status: CheckpointStatus::Ready,
        checkpoint_turn_count: 5,
        files: vec![CheckpointFile {
            path: "src/main.rs".to_string(),
            status: "modified".to_string(),
            additions: 10,
            deletions: 5,
            author: None,
        }],
        assistant_message_id: Some("msg-1".to_string()),
        created_at: Utc::now(),
        completed_at: Some(Utc::now()),
    };
    let v = serde_json::to_value(&c).unwrap();
    assert_field!(
        v,
        "id",
        "threadId",
        "turnId",
        "gitRef",
        "description",
        "status",
        "checkpointTurnCount",
        "files",
        "assistantMessageId",
        "createdAt",
        "completedAt",
    );
    assert_eq!(v["status"], "ready");
    assert_eq!(v["checkpointTurnCount"], 5);
    assert_eq!(v["files"][0]["path"], "src/main.rs");
    assert_eq!(v["files"][0]["additions"], 10);
}

#[test]
fn contract_checkpoint_status_uses_lowercase() {
    assert_eq!(serde_json::to_value(CheckpointStatus::Ready).unwrap(), json!("ready"));
    assert_eq!(serde_json::to_value(CheckpointStatus::Missing).unwrap(), json!("missing"));
    assert_eq!(serde_json::to_value(CheckpointStatus::Error).unwrap(), json!("error"));
}

#[test]
fn contract_latest_turn_uses_camel_case() {
    let t = LatestTurn {
        id: "turn-1".to_string(),
        status: TurnStatus::Running,
        requested_at: Some(Utc::now()),
        started_at: Some(Utc::now()),
        completed_at: None,
        assistant_message_id: None,
    };
    let v = serde_json::to_value(&t).unwrap();
    assert_field!(v, "id", "status", "requestedAt", "startedAt");
    assert_field_absent!(v, "completedAt", "assistantMessageId");
    assert_eq!(v["status"], "running");
}

#[test]
fn contract_turn_status_uses_lowercase() {
    assert_eq!(serde_json::to_value(TurnStatus::Running).unwrap(), json!("running"));
    assert_eq!(serde_json::to_value(TurnStatus::Completed).unwrap(), json!("completed"));
    assert_eq!(serde_json::to_value(TurnStatus::Failed).unwrap(), json!("failed"));
}

// ============================================================================
// 5) 事件契约
// ============================================================================

#[test]
fn contract_event_tag_format() {
    let e = ProjectCreatedEvent {
        sequence: 1,
        occurred_at: Utc::now(),
        command_id: None,
        event_metadata: EventMetadata::new(),
        project_id: fixed_uuid(6),
        title: "Hello".to_string(),
        workspace_root: "/tmp".to_string(),
    };
    let v: Value = serde_json::to_value(OrchestrationEvent::ProjectCreated(e)).unwrap();
    // 事件 tag 形如 'project.created'
    assert_eq!(v["_tag"], "project.created");
    // payload 字段为 camelCase
    assert_field!(v, "_tag", "projectId", "workspaceRoot", "title");
}

#[test]
fn contract_event_metadata_uses_camel_case() {
    let m = EventMetadata::new();
    let v = serde_json::to_value(&m).unwrap();
    assert_field!(v, "eventId", "causationEventId", "correlationId", "metadata");
}

// ============================================================================
// 6) 命令契约
// ============================================================================

#[test]
fn contract_command_tag_format() {
    let cmd = ProjectCreateCommand {
        command_id: Some("c-1".to_string()),
        project_id: fixed_uuid(7),
        title: "X".to_string(),
        workspace_root: "/".to_string(),
    };
    let v: Value = serde_json::to_value(OrchestrationCommand::ProjectCreate(cmd)).unwrap();
    assert_eq!(v["_tag"], "project.create");
    assert_field!(v, "_tag", "projectId", "title", "workspaceRoot");
}

#[test]
fn contract_thread_turn_start_command_fields() {
    let cmd = ThreadTurnStartCommand {
        command_id: Some("c-1".to_string()),
        thread_id: fixed_uuid(8),
        turn_id: "turn-1".to_string(),
        message_id: fixed_uuid(9),
        dispatch_mode: DispatchMode::Normal,
        message_text: "hello".to_string(),
        attachments: None,
        model_selection: None,
        provider_options: None,
        review_target: None,
        assistant_delivery_mode: None,
        runtime_mode: None,
        interaction_mode: None,
        source_proposed_plan: None,
        parent_turn_id: None,
        skills: vec![],
        mentions: vec![],
    };
    let v: Value = serde_json::to_value(OrchestrationCommand::ThreadTurnStart(cmd)).unwrap();
    assert_eq!(v["_tag"], "thread.turn.start");
    assert_field!(
        v,
        "_tag",
        "threadId",
        "turnId",
        "messageId",
        "dispatchMode",
        "messageText",
    );
    assert_eq!(v["dispatchMode"], "normal");
    assert_field_absent!(
        v,
        "attachments",
        "modelSelection",
        "providerOptions",
        "reviewTarget",
        "assistantDeliveryMode",
        "runtimeMode",
        "interactionMode",
        "sourceProposedPlan",
    );
}

// ============================================================================
// 7) ModelSelection 契约
// ============================================================================

#[test]
fn contract_model_selection_fields() {
    let m = ModelSelection {
        provider: ProviderKind::ClaudeAgent,
        model: "claude-3-opus".to_string(),
        options: None,
    };
    let v = serde_json::to_value(&m).unwrap();
    assert_field!(v, "provider", "model");
    assert_eq!(v["provider"], "claudeagent");
    assert_eq!(v["model"], "claude-3-opus");
    assert_field_absent!(v, "options");
}

// ============================================================================
// 8) 事件 tag 命名规范（基线）
// ============================================================================

/// 事件 tag 命名规范：`{aggregate}.{action}` 形如 `project.created`
/// 事件 tag 由 serde 派生宏生成，下表为契约基线。
#[test]
fn contract_event_tag_naming_convention() {
    let metadata = EventMetadata::new();
    let pid = fixed_uuid(10);
    let now = Utc::now();

    let cases: Vec<(OrchestrationEvent, &str)> = vec![
        (
            OrchestrationEvent::ProjectCreated(ProjectCreatedEvent {
                sequence: 1,
                occurred_at: now,
                command_id: None,
                event_metadata: metadata.clone(),
                project_id: pid,
                title: "t".to_string(),
                workspace_root: "/".to_string(),
            }),
            "project.created",
        ),
        (
            OrchestrationEvent::ProjectMetaUpdated(ProjectMetaUpdatedEvent {
                sequence: 2,
                occurred_at: now,
                command_id: None,
                project_id: pid,
                title: Some("x".to_string()),
            }),
            "project.meta-updated",
        ),
        (
            OrchestrationEvent::ProjectDeleted(ProjectDeletedEvent {
                sequence: 3,
                occurred_at: now,
                command_id: None,
                project_id: pid,
            }),
            "project.deleted",
        ),
    ];

    for (event, expected_tag) in cases {
        let v = serde_json::to_value(&event).unwrap();
        assert_eq!(
            v["_tag"], expected_tag,
            "事件 tag 不符合 `{}.xxx` 命名约定",
            expected_tag.split('.').next().unwrap_or("?"),
        );
    }
}

// ============================================================================
// 9) ThreadId 类型稳定（前端期望 UUID 字符串）
// ============================================================================

#[test]
fn contract_thread_id_serializes_as_uuid_string() {
    let id: ThreadId = fixed_uuid(11);
    let v: serde_json::Value = serde_json::to_value(id).unwrap();
    // UUID 应序列化为字符串，不是对象或数字
    assert!(v.is_string(), "ThreadId 应序列化为字符串, got {v:?}");
    // 解析回来应相等
    let parsed: Uuid = serde_json::from_value(v).unwrap();
    assert_eq!(parsed, id);
}

// ============================================================================
// 10) 时间字段契约（ISO 8601 字符串）
// ============================================================================

#[test]
fn contract_datetime_field_uses_iso8601_string() {
    let t = empty_thread();
    let v: serde_json::Value = serde_json::to_value(&t).unwrap();
    let created_at = v["createdAt"].as_str().expect("createdAt 应为字符串");
    // 简单格式校验：以 YYYY-MM-DD 开头（T 隔开）
    assert!(created_at.starts_with("20") && created_at.contains('T'),
        "createdAt 应为 ISO 8601 字符串, got {created_at}");
}
