//! RPC 协议与统一方法注册表
//!
//! 本模块是 Remi Code 前后端通信的"统一接口表"：
//! - [`JsonRpcRequest`] / [`JsonRpcResponse`] / [`JsonRpcNotification`] 描述底层 JSON-RPC 信封。
//! - [`RpcMethod`] 枚举所有可调用的方法（请求）。
//! - [`RpcResponse`] 枚举所有方法的返回类型。
//! - [`RpcNotification`] 枚举服务器主动推送的通知。
//!
//! # 设计原则
//! - **方法名采用点号命名空间**（如 `"thread.sendMessage"`），便于权限/路由分组。
//! - **判别式序列化**：`RpcMethod` / `RpcResponse` / `RpcNotification` 使用
//!   `#[serde(tag = "method", content = "params" / "result")]` 外部判别式，
//!   前端只需反序列化一次即可路由。
//! - **新增方法**：在 [`RpcMethod`] / [`RpcResponse`] 中各添加一个变体，
//!   并在 [`crate`] 对应模块定义入参/出参 DTO，保持一致性。

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

/// JSON-RPC 请求
///
/// 标准 JSON-RPC 2.0 信封；本类型用于 HTTP/WS 通用入口。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct JsonRpcRequest {
    /// JSON-RPC 版本（固定 `"2.0"`）
    pub jsonrpc: String,
    /// 请求 ID（可使用字符串/数字/null）
    pub id: serde_json::Value,
    /// 方法名（如 `"thread.sendMessage"`）
    pub method: String,
    /// 方法参数（任意 JSON）
    pub params: Option<serde_json::Value>,
}

/// JSON-RPC 响应
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct JsonRpcResponse {
    /// JSON-RPC 版本（固定 `"2.0"`）
    pub jsonrpc: String,
    /// 对应请求的 ID
    pub id: serde_json::Value,
    /// 成功时的结果
    pub result: Option<serde_json::Value>,
    /// 失败时的错误
    pub error: Option<JsonRpcError>,
}

/// JSON-RPC 错误
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct JsonRpcError {
    /// 错误码
    pub code: i32,
    /// 错误信息
    pub message: String,
    /// 附加数据
    pub data: Option<serde_json::Value>,
}

/// JSON-RPC 通知（无响应，服务器主动推送）
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct JsonRpcNotification {
    /// JSON-RPC 版本（固定 `"2.0"`）
    pub jsonrpc: String,
    /// 方法名
    pub method: String,
    /// 通知参数
    pub params: Option<serde_json::Value>,
}

/// RPC 方法定义（统一枚举）
///
/// 每个变体对应一个后端可调用的方法，`#[serde(rename = "...")]` 给出线协议方法名。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "method", content = "params")]
pub enum RpcMethod {
    // region: 认证
    /// 启动认证
    #[serde(rename = "auth.bootstrap")]
    AuthBootstrap(AuthBootstrapInput),
    /// 创建配对凭证
    #[serde(rename = "auth.createPairingCredential")]
    AuthCreatePairingCredential(AuthCreatePairingCredentialInput),
    /// 撤销配对链接
    #[serde(rename = "auth.revokePairingLink")]
    AuthRevokePairingLink(AuthRevokePairingLinkInput),
    /// 撤销客户端会话
    #[serde(rename = "auth.revokeClientSession")]
    AuthRevokeClientSession(AuthRevokeClientSessionInput),
    // endregion: 认证

    // region: 线程
    /// 列出线程
    #[serde(rename = "thread.list")]
    ThreadList,
    /// 获取线程
    #[serde(rename = "thread.get")]
    ThreadGet {
        /// 目标线程 ID
        thread_id: ThreadId,
    },
    /// 创建线程
    #[serde(rename = "thread.create")]
    ThreadCreate {
        /// 项目 ID
        project_id: uuid::Uuid,
        /// 可选标题
        title: Option<String>,
    },
    /// 删除线程
    #[serde(rename = "thread.delete")]
    ThreadDelete {
        /// 目标线程 ID
        thread_id: ThreadId,
    },
    /// 列出线程消息
    #[serde(rename = "thread.listMessages")]
    ThreadListMessages {
        /// 目标线程 ID
        thread_id: ThreadId,
    },
    /// 列出线程轮次
    #[serde(rename = "thread.listTurns")]
    ThreadListTurns {
        /// 目标线程 ID
        thread_id: ThreadId,
    },
    /// 向线程发送消息
    #[serde(rename = "thread.sendMessage")]
    ThreadSendMessage(ThreadSendMessageInput),
    // endregion: 线程

    // region: Git
    /// Git 状态
    #[serde(rename = "git.status")]
    GitStatus(GitStatusInput),
    /// Git 切换分支
    #[serde(rename = "git.checkout")]
    GitCheckout(GitCheckoutInput),
    /// Git 创建分支
    #[serde(rename = "git.createBranch")]
    GitCreateBranch(GitCreateBranchInput),
    /// Git 列出分支
    #[serde(rename = "git.listBranches")]
    GitListBranches(GitListBranchesInput),
    /// Git 拉取
    #[serde(rename = "git.pull")]
    GitPull(GitPullInput),
    /// Git 读取工作树差异
    #[serde(rename = "git.readWorkingTreeDiff")]
    GitReadWorkingTreeDiff(GitReadWorkingTreeDiffInput),
    /// Git 差异摘要
    #[serde(rename = "git.summarizeDiff")]
    GitSummarizeDiff(GitSummarizeDiffInput),
    /// Git 移除索引锁
    #[serde(rename = "git.removeIndexLock")]
    GitRemoveIndexLock(GitRemoveIndexLockInput),
    /// Git 暂存信息
    #[serde(rename = "git.stashInfo")]
    GitStashInfo(GitStashInfoInput),
    /// Git 删除暂存
    #[serde(rename = "git.stashDrop")]
    GitStashDrop(GitStashDropInput),
    /// Git 暂存并切换
    #[serde(rename = "git.stashAndCheckout")]
    GitStashAndCheckout(GitStashAndCheckoutInput),
    /// Git 运行堆叠操作
    #[serde(rename = "git.runStackedAction")]
    GitRunStackedAction(GitRunStackedActionInput),
    /// Git 创建工作树
    #[serde(rename = "git.createWorktree")]
    GitCreateWorktree(GitCreateWorktreeInput),
    /// Git 创建分离工作树
    #[serde(rename = "git.createDetachedWorktree")]
    GitCreateDetachedWorktree(GitCreateDetachedWorktreeInput),
    /// Git 移除工作树
    #[serde(rename = "git.removeWorktree")]
    GitRemoveWorktree(GitRemoveWorktreeInput),
    /// Git 初始化
    #[serde(rename = "git.init")]
    GitInit(GitInitInput),
    /// Git 准备拉取请求线程
    #[serde(rename = "git.preparePullRequestThread")]
    GitPreparePullRequestThread(GitPreparePullRequestThreadInput),
    /// Git 解析拉取请求结果
    #[serde(rename = "git.resolvePullRequestResult")]
    GitResolvePullRequestResult(GitResolvePullRequestResult),
    /// Git 移交线程
    #[serde(rename = "git.handoffThread")]
    GitHandoffThread(GitHandoffThreadInput),
    // endregion: Git

    // region: 文件系统
    /// 浏览文件系统
    #[serde(rename = "filesystem.browse")]
    FilesystemBrowse(FilesystemBrowseInput),
    /// 分页浏览文件系统
    #[serde(rename = "filesystem.browseChunked")]
    FilesystemBrowseChunked {
        /// 浏览请求
        input: FilesystemBrowseInput,
        /// 结果集中的偏移量
        offset: usize,
        /// 最大条目数
        limit: Option<usize>,
    },
    /// 读取单个文件
    #[serde(rename = "filesystem.readFile")]
    FilesystemReadFile(ReadFileInput),
    /// 写入单个文件
    #[serde(rename = "filesystem.writeFile")]
    FilesystemWriteFile(WriteFileInput),
    /// 创建目录
    #[serde(rename = "filesystem.createDirectory")]
    FilesystemCreateDirectory(crate::CreateDirectoryInput),
    /// 删除路径
    #[serde(rename = "filesystem.deletePath")]
    FilesystemDeletePath(crate::DeletePathInput),
    /// 搜索工作区
    #[serde(rename = "filesystem.search")]
    FilesystemSearch {
        /// 根目录
        path: String,
        /// 搜索查询
        query: String,
        /// 最大结果数
        #[serde(default)]
        limit: Option<usize>,
    },
    // endregion: 文件系统

    // region: 工作区工作树
    /// 列出管理的工作树
    #[serde(rename = "workspace.worktree.list")]
    WorkspaceWorktreeList,
    /// 创建管理工作树
    #[serde(rename = "workspace.worktree.create")]
    WorkspaceWorktreeCreate {
        /// 新工作树的标签
        label: String,
    },
    /// 触碰管理工作树（更新最近活动时间）
    #[serde(rename = "workspace.worktree.touch")]
    WorkspaceWorktreeTouch {
        /// 工作树 ID
        id: String,
    },
    /// 移除管理工作树
    #[serde(rename = "workspace.worktree.remove")]
    WorkspaceWorktreeRemove {
        /// 工作树 ID
        id: String,
    },
    /// 垃圾回收过时的工作树
    #[serde(rename = "workspace.worktree.gc")]
    WorkspaceWorktreeGc {
        /// GC 前的最大年龄（秒）
        max_age_secs: u64,
    },
    // endregion: 工作区工作树

    // region: 编辑器
    /// 在编辑器中打开
    #[serde(rename = "editor.open")]
    EditorOpen(OpenInEditorInput),
    // endregion: 编辑器

    // region: 终端
    /// 创建终端会话
    #[serde(rename = "terminal.create")]
    TerminalCreate(CreateTerminalInput),
    /// 写入终端会话
    #[serde(rename = "terminal.write")]
    TerminalWrite(WriteTerminalInput),
    /// 调整终端会话大小
    #[serde(rename = "terminal.resize")]
    TerminalResize(ResizeTerminalInput),
    /// 关闭终端会话
    #[serde(rename = "terminal.close")]
    TerminalClose(CloseTerminalInput),
    /// 订阅终端输出
    #[serde(rename = "terminal.subscribeOutput")]
    TerminalSubscribeOutput(SubscribeTerminalOutputInput),
    /// 列出活跃的终端会话
    #[serde(rename = "terminal.list")]
    TerminalList,
    /// 获取终端状态
    #[serde(rename = "terminal.status")]
    TerminalStatus {
        /// 会话 ID
        session_id: uuid::Uuid,
    },
    /// 清屏
    #[serde(rename = "terminal.clear")]
    TerminalClear {
        /// 会话 ID
        session_id: uuid::Uuid,
    },
    /// 重启终端会话
    #[serde(rename = "terminal.restart")]
    TerminalRestart {
        /// 会话 ID
        session_id: uuid::Uuid,
    },
    /// 获取终端标题
    #[serde(rename = "terminal.title")]
    TerminalTitle {
        /// 会话 ID
        session_id: uuid::Uuid,
    },
    /// 重播终端输出缓冲区
    #[serde(rename = "terminal.replay")]
    TerminalReplay {
        /// 会话 ID
        session_id: uuid::Uuid,
    },
    // endregion: 终端

    // region: 项目
    /// 列出所有项目
    #[serde(rename = "projects.list")]
    ProjectsList,
    /// 添加新项目
    #[serde(rename = "projects.add")]
    ProjectsAdd(CreateProjectInput),
    /// 移除项目
    #[serde(rename = "projects.remove")]
    ProjectsRemove {
        /// 项目 ID
        project_id: ProjectId,
    },
    // endregion: 项目

    // region: 提供者
    /// 列出提供者命令
    #[serde(rename = "provider.listCommands")]
    ProviderListCommands(ProviderListCommandsInput),
    // endregion: 提供者
}

/// RPC 响应类型
///
/// 与 [`RpcMethod`] 一一对应；变体名采用"方法名 + Out 形式"约定。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "method", content = "result")]
pub enum RpcResponse {
    // region: 认证响应
    #[serde(rename = "auth.bootstrap")]
    AuthBootstrap(AuthBootstrapOutput),
    #[serde(rename = "auth.createPairingCredential")]
    AuthCreatePairingCredential(AuthCreatePairingCredentialOutput),
    #[serde(rename = "auth.revokePairingLink")]
    AuthRevokePairingLink,
    #[serde(rename = "auth.revokeClientSession")]
    AuthRevokeClientSession,
    // endregion: 认证响应

    // region: 线程响应
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
    // endregion: 线程响应

    // region: Git 响应
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
    // endregion: Git 响应

    // region: 文件系统响应
    #[serde(rename = "filesystem.browse")]
    FilesystemBrowse(FilesystemBrowseResult),
    // endregion: 文件系统响应

    // region: 编辑器响应
    #[serde(rename = "editor.open")]
    EditorOpen,
    // endregion: 编辑器响应

    // region: 终端响应
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
    // endregion: 终端响应
}

/// RPC 通知类型
///
/// 服务器主动推送给前端的事件，无需响应。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "method", content = "params")]
pub enum RpcNotification {
    /// Git 操作进度通知
    #[serde(rename = "git.actionProgress")]
    GitActionProgress(GitActionProgressEvent),
    /// 线程已更新
    #[serde(rename = "thread.updated")]
    ThreadUpdated {
        /// 被更新的线程 ID
        thread_id: ThreadId,
    },
    /// 消息已添加
    #[serde(rename = "thread.messageAdded")]
    ThreadMessageAdded {
        /// 新消息 ID
        message_id: uuid::Uuid,
        /// 所属线程 ID
        thread_id: ThreadId,
    },
    /// 终端输出
    #[serde(rename = "terminal.output")]
    TerminalOutput(TerminalOutputEvent),
}
