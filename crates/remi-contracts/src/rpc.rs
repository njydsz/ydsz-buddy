//! RPC protocol definitions.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{
    AuthBootstrapInput, AuthBootstrapOutput, AuthCreatePairingCredentialInput,
    AuthCreatePairingCredentialOutput, AuthRevokeClientSessionInput, AuthRevokePairingLinkInput,
    FilesystemBrowseInput, FilesystemBrowseResult, GitActionProgressEvent, GitCheckoutInput,
    GitCreateBranchInput, GitCreateBranchResult, GitCreateDetachedWorktreeInput,
    GitCreateDetachedWorktreeResult, GitCreateWorktreeInput, GitCreateWorktreeResult,
    GitHandoffThreadInput, GitHandoffThreadResult, GitInitInput, GitListBranchesInput,
    GitListBranchesResult, GitPreparePullRequestThreadInput, GitPreparePullRequestThreadResult,
    GitPullInput, GitPullResult, GitReadWorkingTreeDiffInput, GitReadWorkingTreeDiffResult,
    GitRemoveIndexLockInput, GitRemoveWorktreeInput, GitResolvePullRequestResult,
    GitRunStackedActionInput, GitStashAndCheckoutInput, GitStashDropInput, GitStashInfoInput,
    GitStashInfoResult, GitStatusInput, GitStatusResult, GitSummarizeDiffInput,
    GitSummarizeDiffResult, OpenInEditorInput, Thread, ThreadId, ThreadMessage, ThreadSendMessageInput, ThreadSendMessageOutput, ThreadTurn,
};

/// JSON-RPC request.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct JsonRpcRequest {
    /// JSON-RPC version.
    pub jsonrpc: String,
    /// Request ID.
    pub id: serde_json::Value,
    /// Method name.
    pub method: String,
    /// Method parameters.
    pub params: Option<serde_json::Value>,
}

/// JSON-RPC response.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct JsonRpcResponse {
    /// JSON-RPC version.
    pub jsonrpc: String,
    /// Request ID.
    pub id: serde_json::Value,
    /// Result (on success).
    pub result: Option<serde_json::Value>,
    /// Error (on failure).
    pub error: Option<JsonRpcError>,
}

/// JSON-RPC error.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct JsonRpcError {
    /// Error code.
    pub code: i32,
    /// Error message.
    pub message: String,
    /// Additional data.
    pub data: Option<serde_json::Value>,
}

/// JSON-RPC notification.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct JsonRpcNotification {
    /// JSON-RPC version.
    pub jsonrpc: String,
    /// Method name.
    pub method: String,
    /// Notification parameters.
    pub params: Option<serde_json::Value>,
}

/// RPC method definitions.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "method", content = "params")]
pub enum RpcMethod {
    // Authentication methods
    /// Bootstrap authentication.
    #[serde(rename = "auth.bootstrap")]
    AuthBootstrap(AuthBootstrapInput),
    /// Create pairing credential.
    #[serde(rename = "auth.createPairingCredential")]
    AuthCreatePairingCredential(AuthCreatePairingCredentialInput),
    /// Revoke pairing link.
    #[serde(rename = "auth.revokePairingLink")]
    AuthRevokePairingLink(AuthRevokePairingLinkInput),
    /// Revoke client session.
    #[serde(rename = "auth.revokeClientSession")]
    AuthRevokeClientSession(AuthRevokeClientSessionInput),

    // Thread methods
    /// List threads.
    #[serde(rename = "thread.list")]
    ThreadList,
    /// Get thread.
    #[serde(rename = "thread.get")]
    ThreadGet { thread_id: ThreadId },
    /// Create thread.
    #[serde(rename = "thread.create")]
    ThreadCreate {
        project_id: uuid::Uuid,
        title: Option<String>,
    },
    /// Delete thread.
    #[serde(rename = "thread.delete")]
    ThreadDelete { thread_id: ThreadId },
    /// List thread messages.
    #[serde(rename = "thread.listMessages")]
    ThreadListMessages { thread_id: ThreadId },
    /// List thread turns.
    #[serde(rename = "thread.listTurns")]
    ThreadListTurns { thread_id: ThreadId },
    /// Send a message to a thread.
    #[serde(rename = "thread.sendMessage")]
    ThreadSendMessage(ThreadSendMessageInput),

    // Git methods
    /// Git status.
    #[serde(rename = "git.status")]
    GitStatus(GitStatusInput),
    /// Git checkout.
    #[serde(rename = "git.checkout")]
    GitCheckout(GitCheckoutInput),
    /// Git create branch.
    #[serde(rename = "git.createBranch")]
    GitCreateBranch(GitCreateBranchInput),
    /// Git list branches.
    #[serde(rename = "git.listBranches")]
    GitListBranches(GitListBranchesInput),
    /// Git pull.
    #[serde(rename = "git.pull")]
    GitPull(GitPullInput),
    /// Git read working tree diff.
    #[serde(rename = "git.readWorkingTreeDiff")]
    GitReadWorkingTreeDiff(GitReadWorkingTreeDiffInput),
    /// Git summarize diff.
    #[serde(rename = "git.summarizeDiff")]
    GitSummarizeDiff(GitSummarizeDiffInput),
    /// Git remove index lock.
    #[serde(rename = "git.removeIndexLock")]
    GitRemoveIndexLock(GitRemoveIndexLockInput),
    /// Git stash info.
    #[serde(rename = "git.stashInfo")]
    GitStashInfo(GitStashInfoInput),
    /// Git stash drop.
    #[serde(rename = "git.stashDrop")]
    GitStashDrop(GitStashDropInput),
    /// Git stash and checkout.
    #[serde(rename = "git.stashAndCheckout")]
    GitStashAndCheckout(GitStashAndCheckoutInput),
    /// Git run stacked action.
    #[serde(rename = "git.runStackedAction")]
    GitRunStackedAction(GitRunStackedActionInput),
    /// Git create worktree.
    #[serde(rename = "git.createWorktree")]
    GitCreateWorktree(GitCreateWorktreeInput),
    /// Git create detached worktree.
    #[serde(rename = "git.createDetachedWorktree")]
    GitCreateDetachedWorktree(GitCreateDetachedWorktreeInput),
    /// Git remove worktree.
    #[serde(rename = "git.removeWorktree")]
    GitRemoveWorktree(GitRemoveWorktreeInput),
    /// Git init.
    #[serde(rename = "git.init")]
    GitInit(GitInitInput),
    /// Git prepare pull request thread.
    #[serde(rename = "git.preparePullRequestThread")]
    GitPreparePullRequestThread(GitPreparePullRequestThreadInput),
    /// Git resolve pull request result.
    #[serde(rename = "git.resolvePullRequestResult")]
    GitResolvePullRequestResult(GitResolvePullRequestResult),
    /// Git handoff thread.
    #[serde(rename = "git.handoffThread")]
    GitHandoffThread(GitHandoffThreadInput),

    // Filesystem methods
    /// Browse filesystem.
    #[serde(rename = "filesystem.browse")]
    FilesystemBrowse(FilesystemBrowseInput),

    // Editor methods
    /// Open in editor.
    #[serde(rename = "editor.open")]
    EditorOpen(OpenInEditorInput),
}

/// RPC response types.
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

    // Thread responses
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

    // Git responses
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

    // Filesystem responses
    #[serde(rename = "filesystem.browse")]
    FilesystemBrowse(FilesystemBrowseResult),

    // Editor responses
    #[serde(rename = "editor.open")]
    EditorOpen,
}

/// RPC notification types.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "method", content = "params")]
pub enum RpcNotification {
    /// Git action progress.
    #[serde(rename = "git.actionProgress")]
    GitActionProgress(GitActionProgressEvent),
    /// Thread updated.
    #[serde(rename = "thread.updated")]
    ThreadUpdated { thread_id: ThreadId },
    /// Message added.
    #[serde(rename = "thread.messageAdded")]
    ThreadMessageAdded {
        message_id: uuid::Uuid,
        thread_id: ThreadId,
    },
}
