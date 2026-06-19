//! RPC 协议定义。

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{
    AuthBootstrapInput, AuthBootstrapOutput, AuthCreatePairingCredentialInput,
    AuthCreatePairingCredentialOutput, AuthRevokeClientSessionInput, AuthRevokePairingLinkInput,
    CloseTerminalInput, CreateProjectInput, CreateTerminalInput, CreateTerminalOutput,
    FilesystemBrowseChunk, FilesystemBrowseInput, FilesystemBrowseResult, FilesystemEntry,
    GitActionProgressEvent, GitCheckoutInput, GitCreateBranchInput, GitCreateBranchResult,
    GitCreateDetachedWorktreeInput, GitCreateDetachedWorktreeResult, GitCreateWorktreeInput,
    GitCreateWorktreeResult, GitHandoffThreadInput, GitHandoffThreadResult, GitInitInput,
    GitListBranchesInput, GitListBranchesResult, GitPreparePullRequestThreadInput,
    GitPreparePullRequestThreadResult, GitPullInput, GitPullResult, GitReadWorkingTreeDiffInput,
    GitReadWorkingTreeDiffResult, GitRemoveIndexLockInput, GitRemoveWorktreeInput,
    GitResolvePullRequestResult, GitRunStackedActionInput, GitStashAndCheckoutInput,
    GitStashDropInput, GitStashInfoInput, GitStashInfoResult, GitStatusInput, GitStatusResult,
    GitSummarizeDiffInput, GitSummarizeDiffResult, OpenInEditorInput, ProjectId,
    ProviderListCommandsInput, ReadFileInput, ReadFileResult, ResizeTerminalInput,
    SubscribeTerminalOutputInput, TerminalOutputEvent, TerminalStatus, Thread, ThreadId,
    ThreadMessage, ThreadSendMessageInput, ThreadSendMessageOutput, ThreadTurn, WriteFileInput,
    WriteFileResult, WriteTerminalInput,
};

/// JSON-RPC 请求。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct JsonRpcRequest {
    /// JSON-RPC 版本。
    pub jsonrpc: String,
    /// 请求 ID。
    pub id: serde_json::Value,
    /// 方法名。
    pub method: String,
    /// 方法参数。
    pub params: Option<serde_json::Value>,
}

/// JSON-RPC 响应。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct JsonRpcResponse {
    /// JSON-RPC 版本。
    pub jsonrpc: String,
    /// 请求 ID。
    pub id: serde_json::Value,
    /// 结果（成功时）。
    pub result: Option<serde_json::Value>,
    /// 错误（失败时）。
    pub error: Option<JsonRpcError>,
}

/// JSON-RPC 错误。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct JsonRpcError {
    /// 错误码。
    pub code: i32,
    /// 错误信息。
    pub message: String,
    /// 附加数据。
    pub data: Option<serde_json::Value>,
}

/// JSON-RPC 通知。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct JsonRpcNotification {
    /// JSON-RPC 版本。
    pub jsonrpc: String,
    /// 方法名。
    pub method: String,
    /// 通知参数。
    pub params: Option<serde_json::Value>,
}

/// RPC 方法定义。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "method", content = "params")]
pub enum RpcMethod {
    // 认证方法
    /// 启动认证。
    #[serde(rename = "auth.bootstrap")]
    AuthBootstrap(AuthBootstrapInput),
    /// 创建配对凭证。
    #[serde(rename = "auth.createPairingCredential")]
    AuthCreatePairingCredential(AuthCreatePairingCredentialInput),
    /// 撤销配对链接。
    #[serde(rename = "auth.revokePairingLink")]
    AuthRevokePairingLink(AuthRevokePairingLinkInput),
    /// 撤销客户端会话。
    #[serde(rename = "auth.revokeClientSession")]
    AuthRevokeClientSession(AuthRevokeClientSessionInput),

    // 线程方法
    /// 列出线程。
    #[serde(rename = "thread.list")]
    ThreadList,
    /// 获取线程。
    #[serde(rename = "thread.get")]
    ThreadGet { thread_id: ThreadId },
    /// 创建线程。
    #[serde(rename = "thread.create")]
    ThreadCreate {
        project_id: uuid::Uuid,
        title: Option<String>,
    },
    /// 删除线程。
    #[serde(rename = "thread.delete")]
    ThreadDelete { thread_id: ThreadId },
    /// 列出线程消息。
    #[serde(rename = "thread.listMessages")]
    ThreadListMessages { thread_id: ThreadId },
    /// 列出线程轮次。
    #[serde(rename = "thread.listTurns")]
    ThreadListTurns { thread_id: ThreadId },
    /// 向线程发送消息。
    #[serde(rename = "thread.sendMessage")]
    ThreadSendMessage(ThreadSendMessageInput),

    // Git 方法
    /// Git 状态。
    #[serde(rename = "git.status")]
    GitStatus(GitStatusInput),
    /// Git 切换分支。
    #[serde(rename = "git.checkout")]
    GitCheckout(GitCheckoutInput),
    /// Git 创建分支。
    #[serde(rename = "git.createBranch")]
    GitCreateBranch(GitCreateBranchInput),
    /// Git 列出分支。
    #[serde(rename = "git.listBranches")]
    GitListBranches(GitListBranchesInput),
    /// Git 拉取。
    #[serde(rename = "git.pull")]
    GitPull(GitPullInput),
    /// Git 读取工作树差异。
    #[serde(rename = "git.readWorkingTreeDiff")]
    GitReadWorkingTreeDiff(GitReadWorkingTreeDiffInput),
    /// Git 差异摘要。
    #[serde(rename = "git.summarizeDiff")]
    GitSummarizeDiff(GitSummarizeDiffInput),
    /// Git 移除索引锁。
    #[serde(rename = "git.removeIndexLock")]
    GitRemoveIndexLock(GitRemoveIndexLockInput),
    /// Git 暂存信息。
    #[serde(rename = "git.stashInfo")]
    GitStashInfo(GitStashInfoInput),
    /// Git 删除暂存。
    #[serde(rename = "git.stashDrop")]
    GitStashDrop(GitStashDropInput),
    /// Git 暂存并切换。
    #[serde(rename = "git.stashAndCheckout")]
    GitStashAndCheckout(GitStashAndCheckoutInput),
    /// Git 运行堆叠操作。
    #[serde(rename = "git.runStackedAction")]
    GitRunStackedAction(GitRunStackedActionInput),
    /// Git 创建工作树。
    #[serde(rename = "git.createWorktree")]
    GitCreateWorktree(GitCreateWorktreeInput),
    /// Git 创建分离工作树。
    #[serde(rename = "git.createDetachedWorktree")]
    GitCreateDetachedWorktree(GitCreateDetachedWorktreeInput),
    /// Git 移除工作树。
    #[serde(rename = "git.removeWorktree")]
    GitRemoveWorktree(GitRemoveWorktreeInput),
    /// Git 初始化。
    #[serde(rename = "git.init")]
    GitInit(GitInitInput),
    /// Git 准备拉取请求线程。
    #[serde(rename = "git.preparePullRequestThread")]
    GitPreparePullRequestThread(GitPreparePullRequestThreadInput),
    /// Git 解析拉取请求结果。
    #[serde(rename = "git.resolvePullRequestResult")]
    GitResolvePullRequestResult(GitResolvePullRequestResult),
    /// Git 移交线程。
    #[serde(rename = "git.handoffThread")]
    GitHandoffThread(GitHandoffThreadInput),

    // 文件系统方法
    /// 浏览文件系统。
    #[serde(rename = "filesystem.browse")]
    FilesystemBrowse(FilesystemBrowseInput),
    /// 分页浏览文件系统。
    #[serde(rename = "filesystem.browseChunked")]
    FilesystemBrowseChunked {
        /// 浏览请求。
        input: FilesystemBrowseInput,
        /// 结果集中的偏移量。
        offset: usize,
        /// 最大条目数。
        limit: Option<usize>,
    },
    /// 读取单个文件。
    #[serde(rename = "filesystem.readFile")]
    FilesystemReadFile(ReadFileInput),
    /// 写入单个文件。
    #[serde(rename = "filesystem.writeFile")]
    FilesystemWriteFile(WriteFileInput),
    /// 创建目录。
    #[serde(rename = "filesystem.createDirectory")]
    FilesystemCreateDirectory(crate::CreateDirectoryInput),
    /// 删除路径。
    #[serde(rename = "filesystem.deletePath")]
    FilesystemDeletePath(crate::DeletePathInput),
    /// 搜索工作区。
    #[serde(rename = "filesystem.search")]
    FilesystemSearch {
        /// 根目录。
        path: String,
        /// 搜索查询。
        query: String,
        /// 最大结果数。
        #[serde(default)]
        limit: Option<usize>,
    },

    // 工作区工作树方法
    /// 列出管理的工作树。
    #[serde(rename = "workspace.worktree.list")]
    WorkspaceWorktreeList,
    /// 创建管理工作树。
    #[serde(rename = "workspace.worktree.create")]
    WorkspaceWorktreeCreate {
        /// 新工作树的标签。
        label: String,
    },
    /// 触碰管理工作树。
    #[serde(rename = "workspace.worktree.touch")]
    WorkspaceWorktreeTouch {
        /// 工作树 ID。
        id: String,
    },
    /// 移除管理工作树。
    #[serde(rename = "workspace.worktree.remove")]
    WorkspaceWorktreeRemove {
        /// 工作树 ID。
        id: String,
    },
    /// 垃圾回收过时的工作树。
    #[serde(rename = "workspace.worktree.gc")]
    WorkspaceWorktreeGc {
        /// GC 前的最大年龄（秒）。
        max_age_secs: u64,
    },

    // 编辑器方法
    /// 在编辑器中打开。
    #[serde(rename = "editor.open")]
    EditorOpen(OpenInEditorInput),

    // 终端方法
    /// 创建终端会话。
    #[serde(rename = "terminal.create")]
    TerminalCreate(CreateTerminalInput),
    /// 写入终端会话。
    #[serde(rename = "terminal.write")]
    TerminalWrite(WriteTerminalInput),
    /// 调整终端会话大小。
    #[serde(rename = "terminal.resize")]
    TerminalResize(ResizeTerminalInput),
    /// 关闭终端会话。
    #[serde(rename = "terminal.close")]
    TerminalClose(CloseTerminalInput),
    /// 订阅终端输出。
    #[serde(rename = "terminal.subscribeOutput")]
    TerminalSubscribeOutput(SubscribeTerminalOutputInput),
    /// 列出活跃的终端会话。
    #[serde(rename = "terminal.list")]
    TerminalList,
    /// 获取终端状态。
    #[serde(rename = "terminal.status")]
    TerminalStatus {
        /// 会话 ID。
        session_id: uuid::Uuid,
    },
    /// 清屏。
    #[serde(rename = "terminal.clear")]
    TerminalClear {
        /// 会话 ID。
        session_id: uuid::Uuid,
    },
    /// 重启终端会话。
    #[serde(rename = "terminal.restart")]
    TerminalRestart {
        /// 会话 ID。
        session_id: uuid::Uuid,
    },
    /// 获取终端标题。
    #[serde(rename = "terminal.title")]
    TerminalTitle {
        /// 会话 ID。
        session_id: uuid::Uuid,
    },
    /// 重播终端输出缓冲区。
    #[serde(rename = "terminal.replay")]
    TerminalReplay {
        /// 会话 ID。
        session_id: uuid::Uuid,
    },

    // 项目方法
    /// 列出所有项目。
    #[serde(rename = "projects.list")]
    ProjectsList,
    /// 添加新项目。
    #[serde(rename = "projects.add")]
    ProjectsAdd(CreateProjectInput),
    /// 移除项目。
    #[serde(rename = "projects.remove")]
    ProjectsRemove { project_id: ProjectId },

    // 提供者方法
    /// 列出提供者命令。
    #[serde(rename = "provider.listCommands")]
    ProviderListCommands(ProviderListCommandsInput),
}

/// RPC 响应类型。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "method", content = "result")]
pub enum RpcResponse {
    // Authentication responses
    #[serde(rename = "auth.bootstrap")]
    AuthBootstrap(AuthBootstrapOutput),
    #[serde(rename = "auth.createPairingCredential")]
    AuthCreatePairingCredential(AuthCreatePairingCredentialOutput),
    #[serde(rename = "auth.revokePairingLink")]
    AuthRevokePairingLink,
    #[serde(rename = "auth.revokeClientSession")]
    AuthRevokeClientSession,

    // 线程响应
    #[serde(rename = "thread.list")]
    ThreadList(Vec<Thread>),
    #[serde(rename = "thread.get")]
    ThreadGet(Thread),
    #[serde(rename = "thread.create")]
    ThreadCreate(Thread),
    #[serde(rename = "thread.delete")]
    ThreadDelete,
    #[serde(rename = "thread.listMessages")]
    ThreadListMessages(Vec<ThreadMessage>),
    #[serde(rename = "thread.listTurns")]
    ThreadListTurns(Vec<ThreadTurn>),
    #[serde(rename = "thread.sendMessage")]
    ThreadSendMessage(ThreadSendMessageOutput),

    // Git 响应
    #[serde(rename = "git.status")]
    GitStatus(GitStatusResult),
    #[serde(rename = "git.checkout")]
    GitCheckout,
    #[serde(rename = "git.createBranch")]
    GitCreateBranch(GitCreateBranchResult),
    #[serde(rename = "git.listBranches")]
    GitListBranches(GitListBranchesResult),
    #[serde(rename = "git.pull")]
    GitPull(GitPullResult),
    #[serde(rename = "git.readWorkingTreeDiff")]
    GitReadWorkingTreeDiff(GitReadWorkingTreeDiffResult),
    #[serde(rename = "git.summarizeDiff")]
    GitSummarizeDiff(GitSummarizeDiffResult),
    #[serde(rename = "git.removeIndexLock")]
    GitRemoveIndexLock,
    #[serde(rename = "git.stashInfo")]
    GitStashInfo(GitStashInfoResult),
    #[serde(rename = "git.stashDrop")]
    GitStashDrop,
    #[serde(rename = "git.stashAndCheckout")]
    GitStashAndCheckout,
    #[serde(rename = "git.runStackedAction")]
    GitRunStackedAction,
    #[serde(rename = "git.createWorktree")]
    GitCreateWorktree(GitCreateWorktreeResult),
    #[serde(rename = "git.createDetachedWorktree")]
    GitCreateDetachedWorktree(GitCreateDetachedWorktreeResult),
    #[serde(rename = "git.removeWorktree")]
    GitRemoveWorktree,
    #[serde(rename = "git.init")]
    GitInit,
    #[serde(rename = "git.preparePullRequestThread")]
    GitPreparePullRequestThread(GitPreparePullRequestThreadResult),
    #[serde(rename = "git.resolvePullRequestResult")]
    GitResolvePullRequestResult,
    #[serde(rename = "git.handoffThread")]
    GitHandoffThread(GitHandoffThreadResult),

    // 文件系统响应
    #[serde(rename = "filesystem.browse")]
    FilesystemBrowse(FilesystemBrowseResult),

    // 编辑器响应
    #[serde(rename = "editor.open")]
    EditorOpen,

    // 终端响应
    #[serde(rename = "terminal.create")]
    TerminalCreate(CreateTerminalOutput),
    #[serde(rename = "terminal.write")]
    TerminalWrite,
    #[serde(rename = "terminal.resize")]
    TerminalResize,
    #[serde(rename = "terminal.close")]
    TerminalClose,
    #[serde(rename = "terminal.subscribeOutput")]
    TerminalSubscribeOutput,
}

/// RPC 通知类型。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "method", content = "params")]
pub enum RpcNotification {
    /// Git 操作进度通知。
    #[serde(rename = "git.actionProgress")]
    GitActionProgress(GitActionProgressEvent),
    /// 线程已更新。
    #[serde(rename = "thread.updated")]
    ThreadUpdated { thread_id: ThreadId },
    /// 消息已添加。
    #[serde(rename = "thread.messageAdded")]
    ThreadMessageAdded {
        message_id: uuid::Uuid,
        thread_id: ThreadId,
    },
    /// 终端输出。
    #[serde(rename = "terminal.output")]
    TerminalOutput(TerminalOutputEvent),
}
