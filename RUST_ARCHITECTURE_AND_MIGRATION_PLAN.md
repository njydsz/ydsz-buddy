# Rust 全新后端架构设计与迁移方案

> 基于 Peak Code 后端架构的 Rust 全量迁移重构设计（桌面端专用）

**版本**: v1.0  
**日期**: 2026-06-19  
**状态**: 待确认

---

## 目录

1. [架构设计原则](#一架构设计原则)
2. [模块化工程架构](#二模块化工程架构)
3. [技术选型](#三技术选型)
4. [接口规范设计](#四接口规范设计)
5. [性能优化策略](#五性能优化策略)
6. [分模块精细化迁移方案](#六分模块精细化迁移方案)
7. [质量验收标准](#七质量验收标准)
8. [风险预判与应对](#八风险预判与应对)
9. [后续迭代优化规划](#九后续迭代优化规划)

---

## 一、架构设计原则

### 1.1 核心目标

1. **高性能**：利用 Rust 零成本抽象和多线程优势，突破 Node.js 单线程瓶颈
2. **内存安全**：编译期保证内存安全，无 GC 停顿
3. **桌面端优化**：针对本地运行场景优化，减少网络开销
4. **模块化清晰**：remi-* 系列模块职责独立，便于维护迭代
5. **接口兼容**：保持与现有桌面前端的 WebSocket RPC 协议完全兼容

### 1.2 设计约束

- **无 Web 端**：仅考虑桌面端（Tauri）场景，移除 HTTP 服务器相关逻辑
- **本地优先**：所有服务本地运行，无需远程服务器
- **协议兼容**：WebSocket RPC 协议与 Peak Code 完全一致，前端零改动
- **渐进式迁移**：按模块分阶段迁移，每阶段可独立验证

---

## 二、模块化工程架构

### 2.1 模块划分

```
remi-code/
├── Cargo.toml                    # Workspace 根配置
├── remi-core/                    # 核心领域模型与合约
├── remi-config/                  # 配置管理
├── remi-persistence/             # 持久化层（SQLite）
├── remi-orchestration/           # 编排引擎（CQRS/ES）
├── remi-provider/                # AI Provider 管理
├── remi-git/                     # Git 操作服务
├── remi-terminal/                # 终端管理
├── remi-workspace/               # 工作空间与文件系统
├── remi-auth/                    # 认证与授权
├── remi-checkpoint/              # 检查点管理
├── remi-telemetry/               # 遥测与分析
├── remi-server/                  # WebSocket 服务器（桌面端）
└── remi-cli/                     # CLI 入口
```

### 2.2 模块职责定义

#### remi-core（核心合约）

**职责**：定义跨模块共享的领域模型、事件、命令、错误类型

**核心内容**：
```rust
// 领域实体
pub struct Project { id, kind, title, workspace_root, ... }
pub struct Thread { id, project_id, title, model_selection, ... }
pub struct Message { id, role, text, attachments, ... }
pub struct Session { thread_id, status, provider_name, ... }

// 事件定义（26 种）
pub enum OrchestrationEvent {
    ProjectCreated(ProjectCreatedPayload),
    ThreadCreated(ThreadCreatedPayload),
    ThreadMessageSent(ThreadMessageSentPayload),
    // ... 其他事件
}

// 命令定义（30+ 种）
pub enum OrchestrationCommand {
    ProjectCreate(ProjectCreateCommand),
    ThreadCreate(ThreadCreateCommand),
    ThreadTurnStart(ThreadTurnStartCommand),
    // ... 其他命令
}

// Provider 相关
pub enum ProviderKind { Codex, ClaudeAgent, Cursor, Gemini, Grok, Kilo, OpenCode, Pi }
pub struct ModelSelection { provider: ProviderKind, model: String, options: ProviderOptions }

// 错误类型
pub enum CoreError { ValidationError(String), NotFoundError(String), ... }
```

**依赖**：serde, chrono, uuid

---

#### remi-config（配置管理）

**职责**：服务器配置解析、环境变量、CLI 参数、路径派生

**核心内容**：
```rust
pub struct ServerConfig {
    pub mode: RuntimeMode,           // Desktop
    pub port: u16,
    pub host: Option<String>,
    pub base_dir: PathBuf,
    pub state_dir: PathBuf,
    pub db_path: PathBuf,
    pub secrets_dir: PathBuf,
    pub logs_dir: PathBuf,
    pub attachments_dir: PathBuf,
    pub worktrees_dir: PathBuf,
    pub settings_path: PathBuf,
    pub auth_token: Option<String>,
    pub log_provider_events: bool,
    pub log_websocket_events: bool,
}

pub enum RuntimeMode { Desktop }

impl ServerConfig {
    pub fn from_args_and_env(args: CliArgs) -> Result<Self, ConfigError>;
    pub fn derive_paths(base_dir: &Path) -> Result<DerivedPaths, ConfigError>;
}
```

**依赖**：config-rs, clap, remi-core

---

#### remi-persistence（持久化层）

**职责**：SQLite 数据库管理、迁移、事件存储、投影存储

**核心内容**：
```rust
// 数据库客户端
pub struct SqliteClient {
    conn: rusqlite::Connection,
}

impl SqliteClient {
    pub fn new(db_path: &Path) -> Result<Self, PersistenceError>;
    pub fn run_migrations(&self) -> Result<(), PersistenceError>;
    pub fn execute<T>(&self, sql: &str, params: &[&dyn ToSql]) -> Result<T, PersistenceError>;
}

// 事件存储
pub trait EventStore: Send + Sync {
    fn append_event(&self, event: &OrchestrationEvent) -> Result<Sequence, PersistenceError>;
    fn read_events(&self, from_sequence: Sequence) -> Result<Vec<OrchestrationEvent>, PersistenceError>;
}

// 投影存储
pub trait ProjectionRepository: Send + Sync {
    fn save_project(&self, project: &Project) -> Result<(), PersistenceError>;
    fn save_thread(&self, thread: &Thread) -> Result<(), PersistenceError>;
    fn get_project(&self, id: ProjectId) -> Result<Option<Project>, PersistenceError>;
    fn get_thread(&self, id: ThreadId) -> Result<Option<Thread>, PersistenceError>;
    fn list_projects(&self) -> Result<Vec<Project>, PersistenceError>;
    fn list_threads(&self) -> Result<Vec<Thread>, PersistenceError>;
}

// 迁移管理
pub struct Migration {
    pub version: u32,
    pub name: &'static str,
    pub sql: &'static str,
}

pub fn run_migrations(client: &SqliteClient) -> Result<(), PersistenceError>;
```

**数据库表结构**：
```sql
-- 事件存储
CREATE TABLE orchestration_events (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    aggregate_kind TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    payload TEXT NOT NULL,  -- JSON
    occurred_at TEXT NOT NULL,
    command_id TEXT,
    metadata TEXT
);

-- 项目投影
CREATE TABLE projection_projects (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    workspace_root TEXT NOT NULL,
    default_model_selection TEXT,  -- JSON
    scripts TEXT NOT NULL,  -- JSON array
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

-- 线程投影
CREATE TABLE projection_threads (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    title TEXT NOT NULL,
    model_selection TEXT NOT NULL,  -- JSON
    runtime_mode TEXT NOT NULL,
    interaction_mode TEXT NOT NULL,
    env_mode TEXT NOT NULL,
    branch TEXT,
    worktree_path TEXT,
    -- ... 其他字段
    messages TEXT NOT NULL,  -- JSON array
    activities TEXT NOT NULL,  -- JSON array
    checkpoints TEXT NOT NULL,  -- JSON array
    session TEXT,  -- JSON
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    FOREIGN KEY (project_id) REFERENCES projection_projects(id)
);

-- 投影器游标
CREATE TABLE projection_state (
    projector_name TEXT PRIMARY KEY,
    last_applied_sequence INTEGER NOT NULL
);

-- 认证会话
CREATE TABLE auth_sessions (
    session_id TEXT PRIMARY KEY,
    role TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- 配对链接
CREATE TABLE auth_pairing_links (
    id TEXT PRIMARY KEY,
    credential_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    revoked_at TEXT
);
```

**依赖**：rusqlite, serde_json, remi-core

---

#### remi-orchestration（编排引擎）

**职责**：命令分发、事件持久化、投影器、读模型查询、Reactor 模式

**核心内容**：
```rust
// 编排引擎服务
pub struct OrchestrationEngine {
    event_store: Arc<dyn EventStore>,
    projection_repo: Arc<dyn ProjectionRepository>,
    command_queue: mpsc::Sender<CommandMessage>,
}

impl OrchestrationEngine {
    pub async fn dispatch(&self, command: OrchestrationCommand) -> Result<Sequence, OrchestrationError>;
    pub async fn read_events(&self, from_sequence: Sequence) -> Result<Vec<OrchestrationEvent>, OrchestrationError>;
    pub async fn get_snapshot(&self) -> Result<OrchestrationReadModel, OrchestrationError>;
    pub async fn get_shell_snapshot(&self) -> Result<OrchestrationShellSnapshot, OrchestrationError>;
    pub async fn stream_domain_events(&self) -> broadcast::Receiver<OrchestrationEvent>;
}

// 投影器
pub struct Projector {
    event_store: Arc<dyn EventStore>,
    projection_repo: Arc<dyn ProjectionRepository>,
}

impl Projector {
    pub async fn run(&self, mut shutdown: broadcast::Receiver<()>) -> Result<(), OrchestrationError>;
    async fn apply_event(&self, event: &OrchestrationEvent) -> Result<(), OrchestrationError>;
}

// Provider 命令反应器
pub struct ProviderCommandReactor {
    provider_service: Arc<ProviderService>,
    orchestration_engine: Arc<OrchestrationEngine>,
}

impl ProviderCommandReactor {
    pub async fn run(&self, mut shutdown: broadcast::Receiver<()>) -> Result<(), OrchestrationError>;
}

// 检查点反应器
pub struct CheckpointReactor {
    checkpoint_store: Arc<CheckpointStore>,
    orchestration_engine: Arc<OrchestrationEngine>,
}

impl CheckpointReactor {
    pub async fn run(&self, mut shutdown: broadcast::Receiver<()>) -> Result<(), OrchestrationError>;
}

// 读模型查询服务
pub struct ProjectionSnapshotQuery {
    projection_repo: Arc<dyn ProjectionRepository>,
}

impl ProjectionSnapshotQuery {
    pub async fn get_snapshot(&self) -> Result<OrchestrationReadModel, QueryError>;
    pub async fn get_shell_snapshot(&self) -> Result<OrchestrationShellSnapshot, QueryError>;
    pub async fn get_thread_detail(&self, thread_id: ThreadId) -> Result<Option<Thread>, QueryError>;
    pub async fn get_counts(&self) -> Result<ProjectionCounts, QueryError>;
}
```

**依赖**：tokio, remi-core, remi-persistence, remi-provider

---

#### remi-provider（Provider 管理）

**职责**：AI Provider 适配器、会话管理、健康检查、ACP 协议

**核心内容**：
```rust
// Provider 适配器 trait
#[async_trait]
pub trait ProviderAdapter: Send + Sync {
    async fn start_session(&self, input: SessionStartInput) -> Result<ProviderSession, ProviderError>;
    async fn send_turn(&self, input: TurnInput) -> Result<TurnResult, ProviderError>;
    async fn steer_turn(&self, input: SteerInput) -> Result<TurnResult, ProviderError>;
    async fn interrupt_turn(&self, session_id: SessionId) -> Result<(), ProviderError>;
    async fn stop_session(&self, session_id: SessionId) -> Result<(), ProviderError>;
    async fn stream_events(&self) -> Result<Receiver<ProviderRuntimeEvent>, ProviderError>;
    fn capabilities(&self) -> ProviderCapabilities;
}

// Provider 服务（门面）
pub struct ProviderService {
    adapters: HashMap<ProviderKind, Arc<dyn ProviderAdapter>>,
    session_directory: SessionDirectory,
    event_bus: broadcast::Sender<ProviderRuntimeEvent>,
}

impl ProviderService {
    pub async fn start_session(&self, thread_id: ThreadId, input: SessionStartInput) -> Result<ProviderSession, ProviderError>;
    pub async fn send_turn(&self, input: TurnInput) -> Result<TurnResult, ProviderError>;
    pub async fn steer_turn(&self, input: SteerInput) -> Result<TurnResult, ProviderError>;
    pub async fn interrupt_turn(&self, input: InterruptInput) -> Result<(), ProviderError>;
    pub async fn stop_session(&self, input: StopInput) -> Result<(), ProviderError>;
    pub async fn list_sessions(&self) -> Vec<ProviderSession>;
    pub fn stream_events(&self) -> broadcast::Receiver<ProviderRuntimeEvent>;
}

// 具体适配器实现
pub struct CodexAdapter { /* ... */ }
pub struct ClaudeAdapter { /* ... */ }
pub struct CursorAdapter { /* ... */ }
pub struct GeminiAdapter { /* ... */ }
pub struct GrokAdapter { /* ... */ }
pub struct KiloAdapter { /* ... */ }
pub struct OpenCodeAdapter { /* ... */ }
pub struct PiAdapter { /* ... */ }

// Provider 健康检查
pub struct ProviderHealth {
    adapters: HashMap<ProviderKind, Arc<dyn ProviderAdapter>>,
    cache: RwLock<HashMap<ProviderKind, ProviderStatus>>,
}

impl ProviderHealth {
    pub async fn refresh(&self) -> Result<HashMap<ProviderKind, ProviderStatus>, HealthError>;
    pub async fn get_statuses(&self) -> HashMap<ProviderKind, ProviderStatus>;
    pub fn stream_changes(&self) -> broadcast::Receiver<HashMap<ProviderKind, ProviderStatus>>;
}

// Provider 会话清理
pub struct ProviderSessionReaper {
    provider_service: Arc<ProviderService>,
    orchestration_engine: Arc<OrchestrationEngine>,
}

impl ProviderSessionReaper {
    pub async fn run(&self, mut shutdown: broadcast::Receiver<()>) -> Result<(), ProviderError>;
}
```

**依赖**：tokio, async-trait, remi-core

---

#### remi-git（Git 服务）

**职责**：Git 命令封装、分支管理、worktree、状态广播

**核心内容**：
```rust
// Git 核心操作
pub struct GitCore {
    worktrees_dir: PathBuf,
}

impl GitCore {
    pub async fn pull(&self, cwd: &Path) -> Result<(), GitError>;
    pub async fn status(&self, cwd: &Path) -> Result<GitStatus, GitError>;
    pub async fn list_branches(&self, cwd: &Path) -> Result<Vec<Branch>, GitError>;
    pub async fn create_branch(&self, cwd: &Path, name: &str) -> Result<(), GitError>;
    pub async fn checkout_branch(&self, cwd: &Path, name: &str) -> Result<(), GitError>;
    pub async fn create_worktree(&self, cwd: &Path, path: &Path, branch: &str) -> Result<(), GitError>;
    pub async fn remove_worktree(&self, cwd: &Path, path: &Path) -> Result<(), GitError>;
    pub async fn stash_and_checkout(&self, cwd: &Path, branch: &str) -> Result<(), GitError>;
    pub async fn stash_drop(&self, cwd: &Path) -> Result<(), GitError>;
    pub async fn init_repo(&self, cwd: &Path) -> Result<(), GitError>;
}

// Git 高级操作
pub struct GitManager {
    git_core: Arc<GitCore>,
    status_broadcaster: Arc<GitStatusBroadcaster>,
}

impl GitManager {
    pub async fn run_stacked_action(&self, input: StackedActionInput, progress: ProgressReporter) -> Result<(), GitError>;
    pub async fn summarize_diff(&self, cwd: &Path) -> Result<DiffSummary, GitError>;
    pub async fn read_working_tree_diff(&self, cwd: &Path) -> Result<String, GitError>;
    pub async fn prepare_pull_request_thread(&self, input: PrInput) -> Result<(), GitError>;
    pub async fn handoff_thread(&self, input: HandoffInput) -> Result<(), GitError>;
}

// Git 状态广播
pub struct GitStatusBroadcaster {
    cache: RwLock<HashMap<PathBuf, GitStatus>>,
    event_tx: broadcast::Sender<GitStatusEvent>,
}

impl GitStatusBroadcaster {
    pub async fn refresh_status(&self, cwd: &Path) -> Result<(), GitError>;
    pub async fn get_status(&self, cwd: &Path) -> Option<GitStatus>;
    pub fn stream_changes(&self) -> broadcast::Receiver<GitStatusEvent>;
}
```

**依赖**：tokio, tokio::process, remi-core

---

#### remi-terminal（终端管理）

**职责**：PTY 终端会话管理

**核心内容**：
```rust
pub struct TerminalManager {
    sessions: RwLock<HashMap<TerminalId, TerminalSession>>,
    event_tx: broadcast::Sender<TerminalEvent>,
}

impl TerminalManager {
    pub async fn open(&self, input: TerminalOpenInput) -> Result<TerminalId, TerminalError>;
    pub async fn write(&self, id: TerminalId, data: &[u8]) -> Result<(), TerminalError>;
    pub async fn resize(&self, id: TerminalId, cols: u16, rows: u16) -> Result<(), TerminalError>;
    pub async fn clear(&self, id: TerminalId) -> Result<(), TerminalError>;
    pub async fn restart(&self, id: TerminalId) -> Result<(), TerminalError>;
    pub async fn close(&self, id: TerminalId) -> Result<(), TerminalError>;
    pub fn subscribe(&self) -> broadcast::Receiver<TerminalEvent>;
}

struct TerminalSession {
    id: TerminalId,
    pty: Box<dyn portable_pty::MasterPty>,
    cwd: PathBuf,
}
```

**依赖**：tokio, portable-pty, remi-core

---

#### remi-workspace（工作空间）

**职责**：文件系统浏览、目录搜索、文件操作

**核心内容**：
```rust
pub struct WorkspaceService {
    worktrees_dir: PathBuf,
}

impl WorkspaceService {
    pub async fn list_directories(&self, input: ListDirInput) -> Result<Vec<DirectoryEntry>, WorkspaceError>;
    pub async fn search_entries(&self, input: SearchInput) -> Result<Vec<SearchResult>, WorkspaceError>;
    pub async fn search_local_entries(&self, input: SearchLocalInput) -> Result<Vec<SearchResult>, WorkspaceError>;
    pub async fn browse(&self, input: BrowseInput) -> Result<Vec<DirectoryEntry>, WorkspaceError>;
    pub async fn write_file(&self, input: WriteFileInput) -> Result<(), WorkspaceError>;
}
```

**依赖**：tokio, walkdir, globset, remi-core

---

#### remi-auth（认证授权）

**职责**：认证、会话凭证、配对链接、密钥存储

**核心内容**：
```rust
pub struct AuthService {
    secret_store: Arc<SecretStore>,
    session_store: Arc<SessionStore>,
    pairing_store: Arc<PairingStore>,
}

impl AuthService {
    pub async fn authenticate_http_request(&self, request: &HttpRequest) -> Result<Session, AuthError>;
    pub async fn authenticate_websocket_upgrade(&self, request: &HttpRequest) -> Result<Session, AuthError>;
    pub async fn exchange_bootstrap_credential(&self, credential: BootstrapCredential) -> Result<BootstrapResult, AuthError>;
    pub async fn issue_pairing_credential(&self, session: &Session) -> Result<PairingCredential, AuthError>;
    pub async fn list_pairing_links(&self) -> Result<Vec<PairingLink>, AuthError>;
    pub async fn revoke_pairing_link(&self, id: PairingLinkId) -> Result<(), AuthError>;
    pub async fn list_client_sessions(&self, session_id: SessionId) -> Result<Vec<Session>, AuthError>;
    pub async fn revoke_client_session(&self, session_id: SessionId, target_id: SessionId) -> Result<(), AuthError>;
}

pub struct SecretStore {
    secrets_dir: PathBuf,
}

impl SecretStore {
    pub async fn store_secret(&self, key: &str, value: &[u8]) -> Result<(), AuthError>;
    pub async fn load_secret(&self, key: &str) -> Result<Option<Vec<u8>>, AuthError>;
    pub async fn delete_secret(&self, key: &str) -> Result<(), AuthError>;
}
```

**依赖**：tokio, sha2, hmac, remi-core, remi-persistence

---

#### remi-checkpoint（检查点管理）

**职责**：Git 检查点存储、Diff 查询

**核心内容**：
```rust
pub struct CheckpointStore {
    git_core: Arc<GitCore>,
}

impl CheckpointStore {
    pub async fn create_checkpoint(&self, thread_id: ThreadId, cwd: &Path) -> Result<CheckpointRef, CheckpointError>;
    pub async fn revert_to_checkpoint(&self, thread_id: ThreadId, checkpoint_ref: &CheckpointRef) -> Result<(), CheckpointError>;
}

pub struct CheckpointDiffQuery {
    checkpoint_store: Arc<CheckpointStore>,
    orchestration_engine: Arc<OrchestrationEngine>,
}

impl CheckpointDiffQuery {
    pub async fn get_turn_diff(&self, input: TurnDiffInput) -> Result<TurnDiff, CheckpointError>;
    pub async fn get_full_thread_diff(&self, input: FullThreadDiffInput) -> Result<ThreadDiff, CheckpointError>;
}
```

**依赖**：tokio, remi-core, remi-git, remi-orchestration

---

#### remi-telemetry（遥测）

**职责**：分析数据收集

**核心内容**：
```rust
pub struct AnalyticsService {
    anonymous_id: String,
}

impl AnalyticsService {
    pub async fn record(&self, event: &str, properties: serde_json::Value) -> Result<(), TelemetryError>;
    pub async fn record_startup_heartbeat(&self, thread_count: usize, project_count: usize) -> Result<(), TelemetryError>;
}
```

**依赖**：tokio, reqwest, remi-core

---

#### remi-server（WebSocket 服务器）

**职责**：WebSocket RPC、服务器生命周期、推送订阅

**核心内容**：
```rust
pub struct Server {
    config: Arc<ServerConfig>,
    orchestration_engine: Arc<OrchestrationEngine>,
    provider_service: Arc<ProviderService>,
    git_manager: Arc<GitManager>,
    terminal_manager: Arc<TerminalManager>,
    workspace_service: Arc<WorkspaceService>,
    auth_service: Arc<AuthService>,
    // ... 其他服务
}

impl Server {
    pub async fn start(&self) -> Result<(), ServerError>;
    pub async fn stop(&self) -> Result<(), ServerError>;
}

// WebSocket RPC
async fn websocket_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<ServerState>>,
) -> impl IntoResponse;

async fn handle_websocket_message(
    socket: WebSocket,
    state: Arc<ServerState>,
) {
    // 处理 RPC 方法调用
    // 处理推送订阅
}

// RPC 方法实现（60+ 方法）
async fn dispatch_command(state: &ServerState, command: OrchestrationCommand) -> Result<Sequence, RpcError>;
async fn get_snapshot(state: &ServerState) -> Result<OrchestrationReadModel, RpcError>;
async fn git_status(state: &ServerState, input: GitStatusInput) -> Result<GitStatus, RpcError>;
async fn terminal_open(state: &ServerState, input: TerminalOpenInput) -> Result<TerminalId, RpcError>;
// ... 其他方法
```

**依赖**：axum, tokio-tungstenite, tower, remi-core, remi-config, remi-orchestration, remi-provider, remi-git, remi-terminal, remi-workspace, remi-auth, remi-checkpoint, remi-telemetry

---

#### remi-cli（CLI 入口）

**职责**：命令行参数解析、服务器启动

**核心内容**：
```rust
#[derive(Parser)]
#[command(name = "remi-code")]
struct Cli {
    #[arg(long)]
    port: Option<u16>,
    
    #[arg(long)]
    host: Option<String>,
    
    #[arg(long)]
    home_dir: Option<PathBuf>,
    
    #[arg(long)]
    auth_token: Option<String>,
    
    #[arg(long)]
    log_provider_events: bool,
    
    #[arg(long)]
    log_websocket_events: bool,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();
    
    // 加载配置
    let config = ServerConfig::from_args_and_env(cli)?;
    
    // 初始化日志
    tracing_subscriber::init();
    
    // 构建服务层
    let services = build_service_layer(&config).await?;
    
    // 启动服务器
    let server = Server::new(services);
    server.start().await?;
    
    // 等待关闭信号
    shutdown_signal().await;
    
    server.stop().await?;
    
    Ok(())
}

async fn build_service_layer(config: &ServerConfig) -> Result<ServiceLayer, Box<dyn std::error::Error>> {
    // 初始化数据库
    let sqlite_client = SqliteClient::new(&config.db_path)?;
    sqlite_client.run_migrations()?;
    
    // 初始化各服务
    let event_store = Arc::new(SqliteEventStore::new(sqlite_client.clone()));
    let projection_repo = Arc::new(SqliteProjectionRepository::new(sqlite_client.clone()));
    
    let orchestration_engine = Arc::new(OrchestrationEngine::new(event_store.clone(), projection_repo.clone()));
    let provider_service = Arc::new(ProviderService::new());
    let git_manager = Arc::new(GitManager::new(config.worktrees_dir.clone()));
    let terminal_manager = Arc::new(TerminalManager::new());
    let workspace_service = Arc::new(WorkspaceService::new(config.worktrees_dir.clone()));
    let auth_service = Arc::new(AuthService::new(config.secrets_dir.clone()));
    
    Ok(ServiceLayer {
        config: Arc::new(config.clone()),
        orchestration_engine,
        provider_service,
        git_manager,
        terminal_manager,
        workspace_service,
        auth_service,
    })
}
```

**依赖**：clap, tokio, tracing, remi-config, remi-server

---

## 三、技术选型

### 3.1 核心技术栈

| 层次 | 技术 | 版本 | 选型理由 |
|------|------|------|----------|
| **运行时** | Tokio | 1.x | 异步运行时，高性能并发 |
| **Web 框架** | Axum | 0.7 | 类型安全、基于 Tower、生态成熟 |
| **WebSocket** | tokio-tungstenite | 0.21 | 异步 WebSocket 实现 |
| **序列化** | serde + serde_json | 1.x | 高性能序列化，类型安全 |
| **数据库** | rusqlite | 0.31 | SQLite 绑定，支持并发读 |
| **进程管理** | tokio::process | - | 异步子进程管理 |
| **PTY** | portable-pty | 0.8 | 跨平台伪终端 |
| **日志** | tracing | 0.1 | 结构化日志，性能优秀 |
| **配置** | config-rs | 0.14 | 多源配置管理 |
| **错误处理** | thiserror + anyhow | - | 类型化错误 + 便捷错误 |
| **CLI** | clap | 4.x | 命令行参数解析 |

### 3.2 依赖关系图

```
remi-cli
    ├── remi-config
    └── remi-server
            ├── remi-orchestration
            │       ├── remi-persistence
            │       ├── remi-provider
            │       └── remi-core
            ├── remi-git
            ├── remi-terminal
            ├── remi-workspace
            ├── remi-auth
            ├── remi-checkpoint
            └── remi-telemetry
```

---

## 四、接口规范设计

### 4.1 WebSocket RPC 协议

保持与 Peak Code 完全兼容的协议格式：

```rust
// 请求
#[derive(Serialize, Deserialize)]
struct WebSocketRequest {
    id: String,
    body: WebSocketRequestBody,
}

// 响应
#[derive(Serialize, Deserialize)]
struct WebSocketResponse {
    id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<RpcError>,
}

// 推送
#[derive(Serialize, Deserialize)]
struct WebSocketPush {
    #[serde(rename = "type")]
    push_type: String,  // "push"
    sequence: u64,
    channel: String,
    data: serde_json::Value,
}

// RPC 错误
#[derive(Serialize, Deserialize)]
struct RpcError {
    message: String,
}
```

### 4.2 RPC 方法清单（保持兼容）

完整迁移 Peak Code 的 60+ RPC 方法，方法名和参数结构保持一致：

```rust
// 编排方法
const ORCHESTRATION_METHODS: &[&str] = &[
    "orchestration.dispatchCommand",
    "orchestration.importThread",
    "orchestration.getSnapshot",
    "orchestration.getShellSnapshot",
    "orchestration.repairState",
    "orchestration.getTurnDiff",
    "orchestration.getFullThreadDiff",
    "orchestration.replayEvents",
    "orchestration.subscribeShell",
    "orchestration.unsubscribeShell",
    "orchestration.subscribeThread",
    "orchestration.unsubscribeThread",
];

// Git 方法
const GIT_METHODS: &[&str] = &[
    "git.pull",
    "git.status",
    "git.readWorkingTreeDiff",
    "git.summarizeDiff",
    "git.runStackedAction",
    "git.listBranches",
    "git.createWorktree",
    "git.createDetachedWorktree",
    "git.removeWorktree",
    "git.createBranch",
    "git.checkout",
    "git.stashAndCheckout",
    "git.stashDrop",
    "git.stashInfo",
    "git.removeIndexLock",
    "git.init",
    "git.handoffThread",
    "git.resolvePullRequest",
    "git.preparePullRequestThread",
];

// 终端方法
const TERMINAL_METHODS: &[&str] = &[
    "terminal.open",
    "terminal.write",
    "terminal.resize",
    "terminal.clear",
    "terminal.restart",
    "terminal.close",
    "terminal.subscribeEvents",
];

// 服务器方法
const SERVER_METHODS: &[&str] = &[
    "server.getConfig",
    "server.getEnvironment",
    "server.getSettings",
    "server.updateSettings",
    "server.refreshProviders",
    "server.updateProvider",
    "server.listWorktrees",
    "server.getProviderUsageSnapshot",
    "server.getDiagnostics",
    "server.transcribeVoice",
    "server.upsertKeybinding",
    "server.subscribeLifecycle",
    "server.subscribeConfig",
    "server.subscribeProviderStatuses",
    "server.subscribeSettings",
];

// Provider 方法
const PROVIDER_METHODS: &[&str] = &[
    "provider.getComposerCapabilities",
    "provider.compactThread",
    "provider.listCommands",
    "provider.listSkills",
    "provider.listPlugins",
    "provider.readPlugin",
    "provider.listModels",
    "provider.listAgents",
    "skills.listLocal",
];
```

### 4.3 推送通道（保持兼容）

```rust
const PUSH_CHANNELS: &[&str] = &[
    "server.welcome",
    "server.maintenanceUpdated",
    "server.configUpdated",
    "server.providerStatusesUpdated",
    "server.settingsUpdated",
    "git.actionProgress",
    "terminal.event",
    "orchestration.domainEvent",
    "orchestration.shellEvent",
    "orchestration.threadEvent",
];
```

---

## 五、性能优化策略

### 5.1 并发优化

1. **异步 I/O**：所有 I/O 操作（数据库、文件、网络）使用 async/await
2. **连接池**：SQLite 使用连接池（r2d2）提升并发读性能
3. **任务并行**：使用 tokio::spawn 并行执行独立任务
4. **流式处理**：大文件读取、事件流使用 Stream 避免内存峰值

### 5.2 内存优化

1. **零拷贝**：使用 `&str` 和 `Bytes` 避免不必要的内存分配
2. **对象池**：复用频繁创建的对象（如 JSON 序列化器）
3. **延迟加载**：按需加载数据，避免一次性加载全部数据

### 5.3 启动优化

1. **延迟初始化**：非关键服务延迟初始化，加快启动速度
2. **并行初始化**：独立服务并行初始化
3. **预编译正则**：正则表达式预编译，避免运行时开销

### 5.4 性能指标目标

| 指标 | Peak Code (Node.js) | Remi Code (Rust) 目标 | 提升幅度 |
|------|---------------------|----------------------|----------|
| 启动时间 | ~5s | ~1s | 80% |
| 内存占用 | ~300MB | ~50MB | 83% |
| RPC 响应时间 | ~50ms | ~10ms | 80% |
| 并发连接数 | ~50 | ~100+ | 100% |

---

## 六、分模块精细化迁移方案

### 6.1 迁移总体策略

#### 6.1.1 迁移原则

1. **功能完整性**：100% 复刻 Peak Code 后端所有功能
2. **接口兼容性**：WebSocket RPC 协议完全兼容，前端零改动
3. **渐进式迁移**：按模块分阶段迁移，每阶段可独立验证
4. **性能优先**：充分利用 Rust 性能优势，优化瓶颈
5. **桌面端优化**：针对本地运行场景优化，减少不必要的网络开销

#### 6.1.2 迁移阶段规划

| 阶段 | 模块 | 预计工作量 | 验收标准 |
|------|------|------------|----------|
| **阶段 1** | remi-core + remi-config | 基础 | 领域模型定义完成，配置解析通过 |
| **阶段 2** | remi-persistence | 核心 | 数据库迁移、事件存储、投影存储通过测试 |
| **阶段 3** | remi-orchestration | 核心 | 命令分发、事件流、投影器、读模型查询通过测试 |
| **阶段 4** | remi-provider | 核心 | 8 种 Provider 适配器、会话管理、健康检查通过测试 |
| **阶段 5** | remi-git | 重要 | Git 操作、分支管理、worktree、状态广播通过测试 |
| **阶段 6** | remi-terminal | 重要 | PTY 终端管理、事件订阅通过测试 |
| **阶段 7** | remi-workspace | 重要 | 文件系统浏览、搜索、文件操作通过测试 |
| **阶段 8** | remi-auth | 重要 | 认证、会话管理、配对链接通过测试 |
| **阶段 9** | remi-checkpoint + remi-telemetry | 辅助 | 检查点管理、遥测通过测试 |
| **阶段 10** | remi-server + remi-cli | 集成 | WebSocket 服务器、RPC 方法、CLI 入口通过集成测试 |

---

### 6.2 阶段 1：remi-core + remi-config

#### 迁移内容

**remi-core**：
1. 定义所有领域实体（Project、Thread、Message、Session 等）
2. 定义所有事件类型（26 种 OrchestrationEvent）
3. 定义所有命令类型（30+ 种 OrchestrationCommand）
4. 定义 Provider 相关类型（ProviderKind、ModelSelection 等）
5. 定义错误类型（CoreError）

**remi-config**：
1. 实现 ServerConfig 结构体
2. 实现 CLI 参数解析（clap）
3. 实现环境变量读取
4. 实现路径派生逻辑
5. 实现配置验证

#### 技术难点

1. **类型映射**：TypeScript 类型 -> Rust 类型，确保 serde 序列化兼容
2. **Tagged Union**：TypeScript 的 Tagged Union -> Rust enum，确保 JSON 格式一致
3. **可选字段**：TypeScript 的 `optional` -> Rust 的 `Option<T>`，确保默认值处理正确

#### 解决方案

1. 使用 `#[serde(tag = "_tag")]` 处理 Tagged Union
2. 使用 `#[serde(default)]` 处理可选字段默认值
3. 使用 `#[serde(rename_all = "camelCase")]` 保持字段名兼容

#### 验收标准

- [ ] 所有领域模型定义完成
- [ ] 所有事件类型定义完成
- [ ] 所有命令类型定义完成
- [ ] 配置解析测试通过
- [ ] 序列化/反序列化测试通过（与 Peak Code JSON 格式兼容）

---

### 6.3 阶段 2：remi-persistence

#### 迁移内容

1. 实现 SqliteClient（rusqlite 封装）
2. 实现数据库迁移系统
3. 实现 EventStore trait 和 SqliteEventStore
4. 实现 ProjectionRepository trait 和 SqliteProjectionRepository
5. 实现投影状态管理

#### 技术难点

1. **并发控制**：SQLite 写锁竞争
2. **事务管理**：确保事件追加和投影更新的原子性
3. **迁移兼容性**：与 Peak Code 数据库格式兼容

#### 解决方案

1. 使用 SQLite WAL 模式提升并发读性能
2. 使用事务确保原子性
3. 迁移脚本与 Peak Code 保持一致

#### 验收标准

- [ ] 数据库连接测试通过
- [ ] 迁移系统测试通过
- [ ] 事件存储测试通过（追加、读取）
- [ ] 投影存储测试通过（保存、查询、列表）
- [ ] 并发读写测试通过

---

### 6.4 阶段 3：remi-orchestration

#### 迁移内容

1. 实现 OrchestrationEngine（命令分发、事件读取）
2. 实现 Projector（事件消费、投影更新）
3. 实现 ProviderCommandReactor（命令 -> Provider 调用）
4. 实现 CheckpointReactor（检查点处理）
5. 实现 ProjectionSnapshotQuery（读模型查询）
6. 实现事件流广播

#### 技术难点

1. **命令序列化**：确保命令队列的有序处理
2. **事件流**：使用 tokio::broadcast 实现事件广播
3. **投影器游标**：确保投影器不重复消费事件
4. **状态修复**：实现 repairState 功能

#### 解决方案

1. 使用 mpsc channel 实现命令队列
2. 使用 broadcast channel 实现事件流
3. 使用 projection_state 表跟踪游标
4. 实现投影重放逻辑

#### 验收标准

- [ ] 命令分发测试通过
- [ ] 事件持久化测试通过
- [ ] 投影器测试通过（事件消费、投影更新）
- [ ] 读模型查询测试通过
- [ ] 事件流订阅测试通过
- [ ] 状态修复测试通过

---

### 6.5 阶段 4：remi-provider

#### 迁移内容

1. 定义 ProviderAdapter trait
2. 实现 8 种 Provider 适配器（Codex、Claude、Cursor、Gemini、Grok、Kilo、OpenCode、Pi）
3. 实现 ProviderService（门面模式）
4. 实现 ProviderHealth（健康检查）
5. 实现 ProviderSessionReaper（会话清理）
6. 实现 Provider 事件流

#### 技术难点

1. **进程管理**：异步子进程管理（tokio::process）
2. **JSON-RPC**：与 Provider CLI 的 JSON-RPC 通信
3. **ACP 协议**：Cursor/Gemini/Grok 的 ACP 协议实现
4. **事件转换**：Provider 原生事件 -> OrchestrationEvent

#### 解决方案

1. 使用 tokio::process 管理子进程
2. 使用 serde_json 处理 JSON-RPC
3. 参考 Peak Code 的 ACP 实现
4. 实现事件转换层

#### 验收标准

- [ ] ProviderAdapter trait 定义完成
- [ ] 8 种 Provider 适配器实现完成
- [ ] ProviderService 测试通过（会话启动、Turn 发送、中断、停止）
- [ ] ProviderHealth 测试通过（健康检查、状态缓存）
- [ ] ProviderSessionReaper 测试通过
- [ ] Provider 事件流测试通过

---

### 6.6 阶段 5：remi-git

#### 迁移内容

1. 实现 GitCore（底层 Git 命令封装）
2. 实现 GitManager（高级 Git 操作）
3. 实现 GitStatusBroadcaster（状态缓存与广播）
4. 实现 GitHubCli（GitHub CLI 集成）

#### 技术难点

1. **Git 命令**：大量 Git 命令的正确封装
2. **异步执行**：Git 命令的异步执行
3. **状态广播**：Git 状态的缓存与广播
4. **Worktree 管理**：Worktree 的创建、移除、路径管理

#### 解决方案

1. 使用 tokio::process 执行 Git 命令
2. 使用 RwLock 缓存 Git 状态
3. 使用 broadcast channel 广播状态变化
4. 严格遵循 Git Worktree 规范

#### 验收标准

- [ ] GitCore 测试通过（pull、status、branch、worktree、stash、checkout、init）
- [ ] GitManager 测试通过（stacked action、diff 摘要、PR 准备、线程交接）
- [ ] GitStatusBroadcaster 测试通过（状态缓存、广播）
- [ ] 并发 Git 操作测试通过

---

### 6.7 阶段 6：remi-terminal

#### 迁移内容

1. 实现 TerminalManager（终端会话管理）
2. 集成 portable-pty（伪终端）
3. 实现终端事件流

#### 技术难点

1. **PTY 集成**：portable-pty 的异步集成
2. **事件流**：终端输出的实时广播
3. **跨平台**：Windows/macOS/Linux 兼容

#### 解决方案

1. 使用 portable-pty 的异步 API
2. 使用 broadcast channel 广播终端事件
3. 使用条件编译处理平台差异

#### 验收标准

- [ ] TerminalManager 测试通过（open、write、resize、clear、restart、close）
- [ ] 终端事件流测试通过
- [ ] 跨平台测试通过（Windows、macOS、Linux）

---

### 6.8 阶段 7：remi-workspace

#### 迁移内容

1. 实现 WorkspaceService（文件系统操作）
2. 实现目录列表、搜索、浏览
3. 实现文件写入

#### 技术难点

1. **路径安全**：防止路径遍历攻击
2. **性能优化**：大目录的搜索性能
3. **符号链接**：符号链接的正确处理

#### 解决方案

1. 使用 canonicalize 验证路径
2. 使用 walkdir 和 globset 优化搜索
3. 使用 follow_links 选项控制符号链接

#### 验收标准

- [ ] WorkspaceService 测试通过（list_directories、search_entries、browse、write_file）
- [ ] 路径安全测试通过
- [ ] 大目录性能测试通过

---

### 6.9 阶段 8：remi-auth

#### 迁移内容

1. 实现 AuthService（认证门面）
2. 实现 SecretStore（密钥存储）
3. 实现 SessionStore（会话存储）
4. 实现 PairingStore（配对链接存储）
5. 实现 HTTP 请求认证
6. 实现 WebSocket 升级认证

#### 技术难点

1. **密钥安全**：密钥的安全存储和加载
2. **会话管理**：会话的创建、验证、撤销
3. **配对流程**：Bootstrap 凭证交换、配对链接管理

#### 解决方案

1. 使用文件系统存储密钥，设置文件权限
2. 使用 SQLite 存储会话和配对链接
3. 实现完整的认证流程

#### 验收标准

- [ ] AuthService 测试通过（HTTP 认证、WebSocket 认证）
- [ ] SecretStore 测试通过（存储、加载、删除）
- [ ] SessionStore 测试通过（创建、验证、撤销）
- [ ] PairingStore 测试通过（创建、列表、撤销）
- [ ] 认证流程测试通过

---

### 6.10 阶段 9：remi-checkpoint + remi-telemetry

#### 迁移内容

**remi-checkpoint**：
1. 实现 CheckpointStore（检查点存储）
2. 实现 CheckpointDiffQuery（Diff 查询）

**remi-telemetry**：
1. 实现 AnalyticsService（分析数据收集）

#### 技术难点

1. **检查点**：Git stash/commit 的正确使用
2. **Diff 查询**：Turn Diff 和 Full Thread Diff 的计算

#### 解决方案

1. 使用 Git stash 创建检查点
2. 使用 Git diff 计算差异

#### 验收标准

- [ ] CheckpointStore 测试通过（创建、恢复）
- [ ] CheckpointDiffQuery 测试通过（Turn Diff、Full Thread Diff）
- [ ] AnalyticsService 测试通过（事件记录）

---

### 6.11 阶段 10：remi-server + remi-cli

#### 迁移内容

**remi-server**：
1. 实现 WebSocket 服务器（tokio-tungstenite）
2. 实现 WebSocket RPC
3. 实现 60+ RPC 方法
4. 实现 10 个推送通道
5. 实现服务器生命周期管理

**remi-cli**：
1. 实现 CLI 入口（clap）
2. 实现服务层构建
3. 实现服务器启动和关闭

#### 技术难点

1. **WebSocket RPC**：完整的 RPC 框架实现
2. **方法路由**：60+ 方法的正确路由
3. **推送订阅**：10 个推送通道的订阅管理
4. **生命周期**：服务器的优雅启动和关闭

#### 解决方案

1. 使用 tokio-tungstenite 实现 WebSocket
2. 使用 match 路由 RPC 方法
3. 使用 broadcast channel 管理推送订阅
4. 使用 tokio::signal 处理关闭信号

#### 验收标准

- [ ] WebSocket RPC 测试通过（60+ 方法）
- [ ] 推送订阅测试通过（10 个通道）
- [ ] 服务器生命周期测试通过（启动、关闭）
- [ ] CLI 测试通过（参数解析、服务器启动）
- [ ] **集成测试**：与桌面前端联调测试通过

---

## 七、质量验收标准

### 7.1 功能完整性

- [ ] 所有 Peak Code 后端功能 100% 复刻
- [ ] 所有 RPC 方法功能一致
- [ ] 所有推送通道功能一致
- [ ] 所有数据模型结构一致

### 7.2 接口兼容性

- [ ] WebSocket RPC 协议格式完全兼容
- [ ] JSON 序列化/反序列化格式完全兼容
- [ ] 桌面前端零改动即可对接

### 7.3 性能指标

- [ ] 启动时间 < 1 秒（Peak Code 约 3-5 秒）
- [ ] 内存占用 < 50MB（Peak Code 约 150-200MB）
- [ ] RPC 方法响应时间 < 10ms（P99）
- [ ] 并发连接数 > 100

### 7.4 稳定性

- [ ] 无内存泄漏（valgrind 检测通过）
- [ ] 无数据竞争（tokio::test 并发测试通过）
- [ ] 错误处理完善（所有错误类型定义完整）
- [ ] 日志记录完整（tracing 结构化日志）

### 7.5 测试覆盖

- [ ] 单元测试覆盖率 > 80%
- [ ] 集成测试覆盖所有 RPC 方法
- [ ] 端到端测试覆盖核心流程

---

## 八、风险预判与应对

### 8.1 技术风险

| 风险 | 影响 | 应对措施 |
|------|------|----------|
| **Provider 协议复杂** | 高 | 详细研究 Peak Code 实现，逐步验证 |
| **ACP 协议实现** | 高 | 参考 Peak Code 的 ACP 实现，充分测试 |
| **WebSocket RPC 兼容性** | 高 | 与 Peak Code 协议格式严格对齐，前端联调验证 |
| **SQLite 并发性能** | 中 | 使用 WAL 模式，必要时可升级到 PostgreSQL |
| **跨平台 PTY** | 中 | 使用 portable-pty，充分测试各平台 |

### 8.2 进度风险

| 风险 | 影响 | 应对措施 |
|------|------|----------|
| **模块依赖复杂** | 中 | 严格按阶段推进，每阶段独立验证 |
| **功能遗漏** | 高 | 详细对照 Peak Code 功能清单，逐一验证 |
| **性能不达标** | 中 | 早期进行性能基准测试，及时优化 |

### 8.3 质量风险

| 风险 | 影响 | 应对措施 |
|------|------|----------|
| **内存泄漏** | 高 | 使用 valgrind 检测，代码审查 |
| **数据竞争** | 高 | 使用 tokio::test 并发测试，代码审查 |
| **错误处理不完善** | 中 | 定义完整的错误类型，覆盖所有错误场景 |

---

## 九、后续迭代优化规划

### 9.1 短期优化（1-3 个月）

1. **性能调优**：根据实际使用情况进行性能调优
2. **错误处理优化**：完善错误提示和日志记录
3. **文档完善**：补充 API 文档、架构文档

### 9.2 中期优化（3-6 个月）

1. **数据库升级**：评估是否需要升级到 PostgreSQL
2. **Provider 扩展**：支持更多 AI Provider
3. **插件系统**：实现插件系统，支持扩展功能

### 9.3 长期优化（6-12 个月）

1. **分布式支持**：评估是否需要支持分布式部署
2. **云端同步**：实现云端数据同步
3. **AI 增强**：集成更多 AI 能力

---

## 十、文档更新规划

### 10.1 开发文档

1. **架构文档**：更新架构设计文档
2. **API 文档**：生成 API 文档（rustdoc）
3. **开发指南**：编写开发指南

### 10.2 运维文档

1. **部署文档**：编写部署文档
2. **配置文档**：编写配置文档
3. **故障排查**：编写故障排查指南

### 10.3 用户文档

1. **用户手册**：编写用户手册
2. **FAQ**：编写常见问题解答

---

**文档版本**: v1.0  
**最后更新**: 2026-06-19  
**负责人**: 技术负责人  
**审批人**: 待确认
