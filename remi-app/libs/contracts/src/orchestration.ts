import {
  ClaudeModelOptions,
  CodexModelOptions,
  CursorModelOptions,
  GeminiModelOptions,
  GrokModelOptions,
  OpenCodeModelOptions,
  PiModelOptions,
} from "./model";
import { ProviderMentionReference, ProviderSkillReference } from "./providerDiscovery";
import { ProjectKind } from "./project";
import {
  ApprovalRequestId,
  CheckpointRef,
  CommandId,
  EventId,
  IsoDateTime,
  MessageId,
  NonNegativeInt,
  PositiveInt,
  ProjectId,
  ProviderItemId,
  ThreadId,
  TrimmedNonEmptyString,
  TurnId,
} from "./baseSchemas";

export const ORCHESTRATION_WS_METHODS = {
  getSnapshot: "orchestration.getSnapshot",
  getShellSnapshot: "orchestration.getShellSnapshot",
  dispatchCommand: "orchestration.dispatchCommand",
  importThread: "orchestration.importThread",
  repairState: "orchestration.repairState",
  getTurnDiff: "orchestration.getTurnDiff",
  getFullThreadDiff: "orchestration.getFullThreadDiff",
  replayEvents: "orchestration.replayEvents",
  subscribeShell: "orchestration.subscribeShell",
  unsubscribeShell: "orchestration.unsubscribeShell",
  subscribeThread: "orchestration.subscribeThread",
  unsubscribeThread: "orchestration.unsubscribeThread",
} as const;

export const ORCHESTRATION_WS_CHANNELS = {
  domainEvent: "orchestration.domainEvent",
  shellEvent: "orchestration.shellEvent",
  threadEvent: "orchestration.threadEvent",
} as const;

export type ProviderKind =
  | "codex"
  | "claudeAgent"
  | "cursor"
  | "gemini"
  | "grok"
  | "kilo"
  | "opencode"
  | "pi";
export const DEFAULT_PROVIDER_KIND: ProviderKind = "codex";

export type ProviderApprovalPolicy = "untrusted" | "on-failure" | "on-request" | "never";
export type ProviderSandboxMode = "read-only" | "workspace-write" | "danger-full-access";

export interface CodexModelSelection {
  provider: "codex";
  model: TrimmedNonEmptyString;
  options?: CodexModelOptions;
}

export interface ClaudeModelSelection {
  provider: "claudeAgent";
  model: TrimmedNonEmptyString;
  options?: ClaudeModelOptions;
}

export interface CursorModelSelection {
  provider: "cursor";
  model: TrimmedNonEmptyString;
  options?: CursorModelOptions;
}

export interface GeminiModelSelection {
  provider: "gemini";
  model: TrimmedNonEmptyString;
  options?: GeminiModelOptions;
}

export interface GrokModelSelection {
  provider: "grok";
  model: TrimmedNonEmptyString;
  options?: GrokModelOptions;
}

export interface OpenCodeModelSelection {
  provider: "opencode";
  model: TrimmedNonEmptyString;
  options?: OpenCodeModelOptions;
}

export interface KiloModelSelection {
  provider: "kilo";
  model: TrimmedNonEmptyString;
  options?: OpenCodeModelOptions;
}

export interface PiModelSelection {
  provider: "pi";
  model: TrimmedNonEmptyString;
  options?: PiModelOptions;
}

export type ModelSelection =
  | CodexModelSelection
  | ClaudeModelSelection
  | CursorModelSelection
  | GeminiModelSelection
  | GrokModelSelection
  | KiloModelSelection
  | OpenCodeModelSelection
  | PiModelSelection;

export interface CodexProviderStartOptions {
  binaryPath?: TrimmedNonEmptyString;
  homePath?: TrimmedNonEmptyString;
}

export interface ClaudeProviderStartOptions {
  binaryPath?: TrimmedNonEmptyString;
  permissionMode?: TrimmedNonEmptyString;
  maxThinkingTokens?: NonNegativeInt;
}

export interface GeminiProviderStartOptions {
  binaryPath?: TrimmedNonEmptyString;
}

export interface CursorProviderStartOptions {
  binaryPath?: TrimmedNonEmptyString;
  apiEndpoint?: TrimmedNonEmptyString;
}

export interface GrokProviderStartOptions {
  binaryPath?: TrimmedNonEmptyString;
}

export interface OpenCodeProviderStartOptions {
  binaryPath?: TrimmedNonEmptyString;
  serverUrl?: TrimmedNonEmptyString;
  serverPassword?: TrimmedNonEmptyString;
}

export interface KiloProviderStartOptions {
  binaryPath?: TrimmedNonEmptyString;
  serverUrl?: TrimmedNonEmptyString;
  serverPassword?: TrimmedNonEmptyString;
}

export interface PiProviderStartOptions {
  binaryPath?: TrimmedNonEmptyString;
  agentDir?: TrimmedNonEmptyString;
}

export interface ProviderStartOptions {
  codex?: CodexProviderStartOptions;
  claudeAgent?: ClaudeProviderStartOptions;
  cursor?: CursorProviderStartOptions;
  gemini?: GeminiProviderStartOptions;
  grok?: GrokProviderStartOptions;
  kilo?: KiloProviderStartOptions;
  opencode?: OpenCodeProviderStartOptions;
  pi?: PiProviderStartOptions;
}

export type RuntimeMode = "approval-required" | "full-access";
export const DEFAULT_RUNTIME_MODE: RuntimeMode = "full-access";
export type ProviderInteractionMode = "default" | "plan";
export const DEFAULT_PROVIDER_INTERACTION_MODE: ProviderInteractionMode = "default";

export type ProviderRequestKind = "command" | "file-read" | "file-change";
export type AssistantDeliveryMode = "buffered" | "streaming";
export type TurnDispatchMode = "queue" | "steer";
export const DEFAULT_TURN_DISPATCH_MODE: TurnDispatchMode = "queue";

export type ProviderReviewTarget =
  | { type: "uncommittedChanges" }
  | { type: "baseBranch"; branch: TrimmedNonEmptyString };

export type ProviderApprovalDecision = "accept" | "acceptForSession" | "decline" | "cancel";
export type ProviderUserInputAnswer = string | Array<string> | null;
export type ProviderUserInputAnswers = Record<string, ProviderUserInputAnswer>;
export type ThreadHandoffBootstrapStatus = "pending" | "completed";
export type ThreadEnvironmentMode = "local" | "worktree";

export type OrchestrationMessageSource = "native" | "handoff-import" | "fork-import";

export const PROVIDER_SEND_TURN_MAX_INPUT_CHARS = 120_000;
export const PROVIDER_SEND_TURN_MAX_ATTACHMENTS = 8;
export const PROVIDER_SEND_TURN_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const PROVIDER_SEND_TURN_MAX_IMAGE_DATA_URL_CHARS = 14_000_000;
const CHAT_ATTACHMENT_ID_MAX_CHARS = 128;
export const CHAT_ASSISTANT_SELECTION_TEXT_MAX_CHARS = 4_000;
export type CorrelationId = CommandId;

type ChatAttachmentId = TrimmedNonEmptyString;

export interface ChatImageAttachment {
  type: "image";
  id: ChatAttachmentId;
  name: TrimmedNonEmptyString;
  mimeType: TrimmedNonEmptyString;
  sizeBytes: NonNegativeInt;
}

export interface ChatAssistantSelectionAttachment {
  type: "assistant-selection";
  id: ChatAttachmentId;
  assistantMessageId: MessageId;
  text: TrimmedNonEmptyString;
}

export interface UploadChatImageAttachment {
  type: "image";
  name: TrimmedNonEmptyString;
  mimeType: TrimmedNonEmptyString;
  sizeBytes: NonNegativeInt;
  dataUrl: TrimmedNonEmptyString;
}

export interface UploadChatAssistantSelectionAttachment {
  type: "assistant-selection";
  assistantMessageId: MessageId;
  text: TrimmedNonEmptyString;
}

export type ChatAttachment = ChatImageAttachment | ChatAssistantSelectionAttachment;
type UploadChatAttachment = UploadChatImageAttachment | UploadChatAssistantSelectionAttachment;

export type ProjectScriptIcon = "play" | "test" | "lint" | "configure" | "build" | "debug";

export interface ProjectScript {
  id: TrimmedNonEmptyString;
  name: TrimmedNonEmptyString;
  command: TrimmedNonEmptyString;
  icon: ProjectScriptIcon;
  runOnWorktreeCreate: boolean;
}

export interface OrchestrationProject {
  id: ProjectId;
  kind?: ProjectKind;
  title: TrimmedNonEmptyString;
  workspaceRoot: TrimmedNonEmptyString;
  defaultModelSelection: ModelSelection | null;
  scripts: Array<ProjectScript>;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  deletedAt: IsoDateTime | null;
}

export interface OrchestrationProjectShell {
  id: ProjectId;
  kind?: ProjectKind;
  title: TrimmedNonEmptyString;
  workspaceRoot: TrimmedNonEmptyString;
  defaultModelSelection: ModelSelection | null;
  scripts: Array<ProjectScript>;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export type OrchestrationMessageRole = "user" | "assistant" | "system";

export interface OrchestrationMessage {
  id: MessageId;
  role: OrchestrationMessageRole;
  text: string;
  attachments?: Array<ChatAttachment>;
  skills?: Array<ProviderSkillReference>;
  mentions?: Array<ProviderMentionReference>;
  dispatchMode?: TurnDispatchMode;
  turnId: TurnId | null;
  streaming: boolean;
  source: OrchestrationMessageSource;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface ThreadHandoff {
  sourceThreadId: ThreadId;
  sourceProvider: ProviderKind;
  importedAt: IsoDateTime;
  bootstrapStatus: ThreadHandoffBootstrapStatus;
}

export type OrchestrationProposedPlanId = TrimmedNonEmptyString;

export interface OrchestrationProposedPlan {
  id: OrchestrationProposedPlanId;
  turnId: TurnId | null;
  planMarkdown: TrimmedNonEmptyString;
  implementedAt: IsoDateTime | null;
  implementationThreadId: ThreadId | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

interface SourceProposedPlanReference {
  threadId: ThreadId;
  planId: OrchestrationProposedPlanId;
}

export type OrchestrationSessionStatus =
  | "idle"
  | "starting"
  | "running"
  | "ready"
  | "interrupted"
  | "stopped"
  | "error";

export interface OrchestrationSession {
  threadId: ThreadId;
  status: OrchestrationSessionStatus;
  providerName: TrimmedNonEmptyString | null;
  runtimeMode: RuntimeMode;
  activeTurnId: TurnId | null;
  lastError: TrimmedNonEmptyString | null;
  updatedAt: IsoDateTime;
}

export interface OrchestrationCheckpointFile {
  path: TrimmedNonEmptyString;
  kind: TrimmedNonEmptyString;
  additions: NonNegativeInt;
  deletions: NonNegativeInt;
}

export type OrchestrationCheckpointStatus = "ready" | "missing" | "error";

export interface OrchestrationCheckpointSummary {
  turnId: TurnId;
  checkpointTurnCount: NonNegativeInt;
  checkpointRef: CheckpointRef;
  status: OrchestrationCheckpointStatus;
  files: Array<OrchestrationCheckpointFile>;
  assistantMessageId: MessageId | null;
  completedAt: IsoDateTime;
}

export type OrchestrationThreadActivityTone = "info" | "tool" | "approval" | "error";

export interface OrchestrationThreadActivity {
  id: EventId;
  tone: OrchestrationThreadActivityTone;
  kind: TrimmedNonEmptyString;
  summary: TrimmedNonEmptyString;
  payload: unknown;
  turnId: TurnId | null;
  sequence?: NonNegativeInt;
  createdAt: IsoDateTime;
}

type OrchestrationLatestTurnState = "running" | "interrupted" | "completed" | "error";

export interface OrchestrationLatestTurn {
  turnId: TurnId;
  state: OrchestrationLatestTurnState;
  requestedAt: IsoDateTime;
  startedAt: IsoDateTime | null;
  completedAt: IsoDateTime | null;
  assistantMessageId: MessageId | null;
  sourceProposedPlan?: SourceProposedPlanReference;
}

export interface OrchestrationThreadPullRequest {
  number: PositiveInt;
  title: TrimmedNonEmptyString;
  url: string;
  baseBranch: TrimmedNonEmptyString;
  headBranch: TrimmedNonEmptyString;
  state: "open" | "closed" | "merged";
}

export interface OrchestrationThread {
  id: ThreadId;
  projectId: ProjectId;
  title: TrimmedNonEmptyString;
  modelSelection: ModelSelection;
  runtimeMode: RuntimeMode;
  interactionMode: ProviderInteractionMode;
  envMode?: ThreadEnvironmentMode;
  branch: TrimmedNonEmptyString | null;
  worktreePath: TrimmedNonEmptyString | null;
  associatedWorktreePath?: TrimmedNonEmptyString | null;
  associatedWorktreeBranch?: TrimmedNonEmptyString | null;
  associatedWorktreeRef?: TrimmedNonEmptyString | null;
  createBranchFlowCompleted?: boolean;
  isPinned?: boolean;
  parentThreadId?: ThreadId | null;
  subagentAgentId?: TrimmedNonEmptyString | null;
  subagentNickname?: TrimmedNonEmptyString | null;
  subagentRole?: TrimmedNonEmptyString | null;
  forkSourceThreadId?: ThreadId | null;
  sidechatSourceThreadId?: ThreadId | null;
  lastKnownPr?: OrchestrationThreadPullRequest | null;
  latestTurn: OrchestrationLatestTurn | null;
  latestUserMessageAt?: IsoDateTime | null;
  hasPendingApprovals?: boolean;
  hasPendingUserInput?: boolean;
  hasActionableProposedPlan?: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  archivedAt?: IsoDateTime | null;
  deletedAt: IsoDateTime | null;
  handoff: ThreadHandoff | null;
  messages: Array<OrchestrationMessage>;
  proposedPlans: Array<OrchestrationProposedPlan>;
  activities: Array<OrchestrationThreadActivity>;
  checkpoints: Array<OrchestrationCheckpointSummary>;
  session: OrchestrationSession | null;
}

export interface OrchestrationThreadShell {
  id: ThreadId;
  projectId: ProjectId;
  title: TrimmedNonEmptyString;
  modelSelection: ModelSelection;
  runtimeMode: RuntimeMode;
  interactionMode: ProviderInteractionMode;
  envMode?: ThreadEnvironmentMode;
  branch: TrimmedNonEmptyString | null;
  worktreePath: TrimmedNonEmptyString | null;
  associatedWorktreePath?: TrimmedNonEmptyString | null;
  associatedWorktreeBranch?: TrimmedNonEmptyString | null;
  associatedWorktreeRef?: TrimmedNonEmptyString | null;
  createBranchFlowCompleted?: boolean;
  isPinned?: boolean;
  parentThreadId?: ThreadId | null;
  subagentAgentId?: TrimmedNonEmptyString | null;
  subagentNickname?: TrimmedNonEmptyString | null;
  subagentRole?: TrimmedNonEmptyString | null;
  forkSourceThreadId?: ThreadId | null;
  sidechatSourceThreadId?: ThreadId | null;
  lastKnownPR?: OrchestrationThreadPullRequest | null;
  latestTurn: OrchestrationLatestTurn | null;
  latestUserMessageAt?: IsoDateTime | null;
  hasPendingApprovals?: boolean;
  hasPendingUserInput?: boolean;
  hasActionableProposedPlan?: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  archivedAt?: IsoDateTime | null;
  handoff: ThreadHandoff | null;
  session: OrchestrationSession | null;
}

export interface OrchestrationReadModel {
  snapshotSequence: NonNegativeInt;
  projects: Array<OrchestrationProject>;
  threads: Array<OrchestrationThread>;
  updatedAt: IsoDateTime;
}

export interface OrchestrationShellSnapshot {
  snapshotSequence: NonNegativeInt;
  projects: Array<OrchestrationProjectShell>;
  threads: Array<OrchestrationThreadShell>;
  updatedAt: IsoDateTime;
}

export type OrchestrationShellStreamEvent =
  | {
      kind: "project-upserted";
      sequence: NonNegativeInt;
      project: OrchestrationProjectShell;
    }
  | {
      kind: "project-removed";
      sequence: NonNegativeInt;
      projectId: ProjectId;
    }
  | {
      kind: "thread-upserted";
      sequence: NonNegativeInt;
      thread: OrchestrationThreadShell;
    }
  | {
      kind: "thread-removed";
      sequence: NonNegativeInt;
      threadId: ThreadId;
    };

export type OrchestrationShellStreamItem =
  | {
      kind: "snapshot";
      snapshot: OrchestrationShellSnapshot;
    }
  | OrchestrationShellStreamEvent;

export interface ProjectCreateCommand {
  type: "project.create";
  commandId: CommandId;
  projectId: ProjectId;
  kind?: ProjectKind;
  title: TrimmedNonEmptyString;
  workspaceRoot: TrimmedNonEmptyString;
  createWorkspaceRootIfMissing?: boolean;
  defaultModelSelection?: ModelSelection | null;
  createdAt: IsoDateTime;
}

interface ProjectMetaUpdateCommand {
  type: "project.meta.update";
  commandId: CommandId;
  projectId: ProjectId;
  kind?: ProjectKind;
  title?: TrimmedNonEmptyString;
  workspaceRoot?: TrimmedNonEmptyString;
  defaultModelSelection?: ModelSelection | null;
  scripts?: Array<ProjectScript>;
}

interface ProjectDeleteCommand {
  type: "project.delete";
  commandId: CommandId;
  projectId: ProjectId;
}

interface ThreadCreateCommand {
  type: "thread.create";
  commandId: CommandId;
  threadId: ThreadId;
  projectId: ProjectId;
  title: TrimmedNonEmptyString;
  modelSelection: ModelSelection;
  runtimeMode: RuntimeMode;
  interactionMode: ProviderInteractionMode;
  envMode?: ThreadEnvironmentMode;
  branch: TrimmedNonEmptyString | null;
  worktreePath: TrimmedNonEmptyString | null;
  associatedWorktreePath?: TrimmedNonEmptyString | null;
  associatedWorktreeBranch?: TrimmedNonEmptyString | null;
  associatedWorktreeRef?: TrimmedNonEmptyString | null;
  createBranchFlowCompleted?: boolean;
  isPinned?: boolean;
  parentThreadId?: ThreadId | null;
  subagentAgentId?: TrimmedNonEmptyString | null;
  subagentNickname?: TrimmedNonEmptyString | null;
  subagentRole?: TrimmedNonEmptyString | null;
  lastKnownPr?: OrchestrationThreadPullRequest | null;
  createdAt: IsoDateTime;
}

export interface ThreadHandoffImportedMessage {
  messageId: MessageId;
  role: "user" | "assistant";
  text: string;
  attachments?: Array<ChatAttachment>;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

interface ThreadHandoffCreateCommand {
  type: "thread.handoff.create";
  commandId: CommandId;
  threadId: ThreadId;
  sourceThreadId: ThreadId;
  projectId: ProjectId;
  title: TrimmedNonEmptyString;
  modelSelection: ModelSelection;
  runtimeMode: RuntimeMode;
  interactionMode: ProviderInteractionMode;
  envMode?: ThreadEnvironmentMode;
  branch: TrimmedNonEmptyString | null;
  worktreePath: TrimmedNonEmptyString | null;
  associatedWorktreePath?: TrimmedNonEmptyString | null;
  associatedWorktreeBranch?: TrimmedNonEmptyString | null;
  associatedWorktreeRef?: TrimmedNonEmptyString | null;
  createBranchFlowCompleted?: boolean;
  importedMessages: Array<ThreadHandoffImportedMessage>;
  createdAt: IsoDateTime;
}

interface ThreadForkCreateCommand {
  type: "thread.fork.create";
  commandId: CommandId;
  threadId: ThreadId;
  sourceThreadId: ThreadId;
  projectId: ProjectId;
  title: TrimmedNonEmptyString;
  modelSelection: ModelSelection;
  runtimeMode: RuntimeMode;
  interactionMode: ProviderInteractionMode;
  envMode?: ThreadEnvironmentMode;
  branch: TrimmedNonEmptyString | null;
  worktreePath: TrimmedNonEmptyString | null;
  associatedWorktreePath?: TrimmedNonEmptyString | null;
  associatedWorktreeBranch?: TrimmedNonEmptyString | null;
  associatedWorktreeRef?: TrimmedNonEmptyString | null;
  createBranchFlowCompleted?: boolean;
  sidechatSourceThreadId?: ThreadId | null;
  importedMessages: Array<ThreadHandoffImportedMessage>;
  createdAt: IsoDateTime;
}

interface ThreadDeleteCommand {
  type: "thread.delete";
  commandId: CommandId;
  threadId: ThreadId;
}

interface ThreadArchiveCommand {
  type: "thread.archive";
  commandId: CommandId;
  threadId: ThreadId;
}

interface ThreadUnarchiveCommand {
  type: "thread.unarchive";
  commandId: CommandId;
  threadId: ThreadId;
}

interface ThreadMetaUpdateCommand {
  type: "thread.meta.update";
  commandId: CommandId;
  threadId: ThreadId;
  title?: TrimmedNonEmptyString;
  modelSelection?: ModelSelection;
  envMode?: ThreadEnvironmentMode;
  branch?: TrimmedNonEmptyString | null;
  worktreePath?: TrimmedNonEmptyString | null;
  associatedWorktreePath?: TrimmedNonEmptyString | null;
  associatedWorktreeBranch?: TrimmedNonEmptyString | null;
  associatedWorktreeRef?: TrimmedNonEmptyString | null;
  createBranchFlowCompleted?: boolean;
  isPinned?: boolean;
  parentThreadId?: ThreadId | null;
  subagentAgentId?: TrimmedNonEmptyString | null;
  subagentNickname?: TrimmedNonEmptyString | null;
  subagentRole?: TrimmedNonEmptyString | null;
  handoff?: ThreadHandoff | null;
  lastKnownPr?: OrchestrationThreadPullRequest | null;
}

interface ThreadRuntimeModeSetCommand {
  type: "thread.runtime-mode.set";
  commandId: CommandId;
  threadId: ThreadId;
  runtimeMode: RuntimeMode;
  createdAt: IsoDateTime;
}

interface ThreadInteractionModeSetCommand {
  type: "thread.interaction-mode.set";
  commandId: CommandId;
  threadId: ThreadId;
  interactionMode: ProviderInteractionMode;
  createdAt: IsoDateTime;
}

export interface ThreadTurnStartCommand {
  type: "thread.turn.start";
  commandId: CommandId;
  threadId: ThreadId;
  message: {
    messageId: MessageId;
    role: "user";
    text: string;
    attachments: Array<ChatAttachment>;
    skills?: Array<ProviderSkillReference>;
    mentions?: Array<ProviderMentionReference>;
  };
  modelSelection?: ModelSelection;
  providerOptions?: ProviderStartOptions;
  reviewTarget?: ProviderReviewTarget;
  assistantDeliveryMode?: AssistantDeliveryMode;
  dispatchMode?: TurnDispatchMode;
  runtimeMode: RuntimeMode;
  interactionMode: ProviderInteractionMode;
  sourceProposedPlan?: SourceProposedPlanReference;
  createdAt: IsoDateTime;
}

interface ClientThreadTurnStartCommand {
  type: "thread.turn.start";
  commandId: CommandId;
  threadId: ThreadId;
  message: {
    messageId: MessageId;
    role: "user";
    text: string;
    attachments: Array<UploadChatAttachment>;
    skills?: Array<ProviderSkillReference>;
    mentions?: Array<ProviderMentionReference>;
  };
  modelSelection?: ModelSelection;
  providerOptions?: ProviderStartOptions;
  reviewTarget?: ProviderReviewTarget;
  assistantDeliveryMode?: AssistantDeliveryMode;
  dispatchMode?: TurnDispatchMode;
  runtimeMode: RuntimeMode;
  interactionMode: ProviderInteractionMode;
  sourceProposedPlan?: SourceProposedPlanReference;
  createdAt: IsoDateTime;
}

interface ThreadTurnInterruptCommand {
  type: "thread.turn.interrupt";
  commandId: CommandId;
  threadId: ThreadId;
  turnId?: TurnId;
  createdAt: IsoDateTime;
}

interface ThreadDispatchQueuedTurnCommand {
  type: "thread.turn.dispatch-queued";
  commandId: CommandId;
  threadId: ThreadId;
  messageId: MessageId;
  modelSelection?: ModelSelection;
  providerOptions?: ProviderStartOptions;
  reviewTarget?: ProviderReviewTarget;
  assistantDeliveryMode?: AssistantDeliveryMode;
  dispatchMode?: TurnDispatchMode;
  runtimeMode: RuntimeMode;
  interactionMode: ProviderInteractionMode;
  sourceProposedPlan?: SourceProposedPlanReference;
  createdAt: IsoDateTime;
}

interface ThreadApprovalRespondCommand {
  type: "thread.approval.respond";
  commandId: CommandId;
  threadId: ThreadId;
  requestId: ApprovalRequestId;
  decision: ProviderApprovalDecision;
  createdAt: IsoDateTime;
}

interface ThreadUserInputRespondCommand {
  type: "thread.user-input.respond";
  commandId: CommandId;
  threadId: ThreadId;
  requestId: ApprovalRequestId;
  answers: ProviderUserInputAnswers;
  createdAt: IsoDateTime;
}

interface ThreadCheckpointRevertCommand {
  type: "thread.checkpoint.revert";
  commandId: CommandId;
  threadId: ThreadId;
  turnCount: NonNegativeInt;
  createdAt: IsoDateTime;
}

interface ThreadConversationRollbackCommand {
  type: "thread.conversation.rollback";
  commandId: CommandId;
  threadId: ThreadId;
  messageId: MessageId;
  numTurns: NonNegativeInt;
  createdAt: IsoDateTime;
}

interface ThreadMessageEditAndResendCommand {
  type: "thread.message.edit-and-resend";
  commandId: CommandId;
  threadId: ThreadId;
  messageId: MessageId;
  text: TrimmedNonEmptyString;
  modelSelection?: ModelSelection;
  providerOptions?: ProviderStartOptions;
  assistantDeliveryMode?: AssistantDeliveryMode;
  runtimeMode: RuntimeMode;
  interactionMode: ProviderInteractionMode;
  createdAt: IsoDateTime;
}

interface ThreadSessionStopCommand {
  type: "thread.session.stop";
  commandId: CommandId;
  threadId: ThreadId;
  createdAt: IsoDateTime;
}

interface ThreadActivityAppendCommand {
  type: "thread.activity.append";
  commandId: CommandId;
  threadId: ThreadId;
  activity: OrchestrationThreadActivity;
  createdAt: IsoDateTime;
}

export type DispatchableClientOrchestrationCommand =
  | ProjectCreateCommand
  | ProjectMetaUpdateCommand
  | ProjectDeleteCommand
  | ThreadCreateCommand
  | ThreadHandoffCreateCommand
  | ThreadForkCreateCommand
  | ThreadDeleteCommand
  | ThreadArchiveCommand
  | ThreadUnarchiveCommand
  | ThreadMetaUpdateCommand
  | ThreadRuntimeModeSetCommand
  | ThreadInteractionModeSetCommand
  | ThreadTurnStartCommand
  | ThreadTurnInterruptCommand
  | ThreadApprovalRespondCommand
  | ThreadUserInputRespondCommand
  | ThreadCheckpointRevertCommand
  | ThreadMessageEditAndResendCommand
  | ThreadActivityAppendCommand
  | ThreadSessionStopCommand;

export type ClientOrchestrationCommand =
  | ProjectCreateCommand
  | ProjectMetaUpdateCommand
  | ProjectDeleteCommand
  | ThreadCreateCommand
  | ThreadHandoffCreateCommand
  | ThreadForkCreateCommand
  | ThreadDeleteCommand
  | ThreadArchiveCommand
  | ThreadUnarchiveCommand
  | ThreadMetaUpdateCommand
  | ThreadRuntimeModeSetCommand
  | ThreadInteractionModeSetCommand
  | ClientThreadTurnStartCommand
  | ThreadTurnInterruptCommand
  | ThreadApprovalRespondCommand
  | ThreadUserInputRespondCommand
  | ThreadCheckpointRevertCommand
  | ThreadMessageEditAndResendCommand
  | ThreadActivityAppendCommand
  | ThreadSessionStopCommand;

interface ThreadSessionSetCommand {
  type: "thread.session.set";
  commandId: CommandId;
  threadId: ThreadId;
  session: OrchestrationSession;
  createdAt: IsoDateTime;
}

interface ThreadMessagesImportCommand {
  type: "thread.messages.import";
  commandId: CommandId;
  threadId: ThreadId;
  messages: Array<ThreadHandoffImportedMessage>;
  createdAt: IsoDateTime;
}

interface ThreadMessageAssistantDeltaCommand {
  type: "thread.message.assistant.delta";
  commandId: CommandId;
  threadId: ThreadId;
  messageId: MessageId;
  delta: string;
  turnId?: TurnId;
  createdAt: IsoDateTime;
}

interface ThreadMessageAssistantCompleteCommand {
  type: "thread.message.assistant.complete";
  commandId: CommandId;
  threadId: ThreadId;
  messageId: MessageId;
  turnId?: TurnId;
  createdAt: IsoDateTime;
}

interface ThreadProposedPlanUpsertCommand {
  type: "thread.proposed-plan.upsert";
  commandId: CommandId;
  threadId: ThreadId;
  proposedPlan: OrchestrationProposedPlan;
  createdAt: IsoDateTime;
}

interface ThreadTurnDiffCompleteCommand {
  type: "thread.turn.diff.complete";
  commandId: CommandId;
  threadId: ThreadId;
  turnId: TurnId;
  completedAt: IsoDateTime;
  checkpointRef: CheckpointRef;
  status: OrchestrationCheckpointStatus;
  files: Array<OrchestrationCheckpointFile>;
  assistantMessageId?: MessageId;
  checkpointTurnCount: NonNegativeInt;
  createdAt: IsoDateTime;
}

interface ThreadRevertCompleteCommand {
  type: "thread.revert.complete";
  commandId: CommandId;
  threadId: ThreadId;
  turnCount: NonNegativeInt;
  createdAt: IsoDateTime;
}

interface ThreadConversationRollbackCompleteCommand {
  type: "thread.conversation.rollback.complete";
  commandId: CommandId;
  threadId: ThreadId;
  messageId: MessageId;
  numTurns: NonNegativeInt;
  removedTurnIds?: Array<TurnId>;
  skipAttachmentPrune?: boolean;
  createdAt: IsoDateTime;
}

export type InternalOrchestrationCommand =
  | ThreadSessionSetCommand
  | ThreadMessagesImportCommand
  | ThreadMessageAssistantDeltaCommand
  | ThreadMessageAssistantCompleteCommand
  | ThreadProposedPlanUpsertCommand
  | ThreadTurnDiffCompleteCommand
  | ThreadActivityAppendCommand
  | ThreadRevertCompleteCommand
  | ThreadConversationRollbackCommand
  | ThreadConversationRollbackCompleteCommand
  | ThreadDispatchQueuedTurnCommand;

export type OrchestrationCommand = DispatchableClientOrchestrationCommand | InternalOrchestrationCommand;

export type OrchestrationEventType =
  | "project.created"
  | "project.meta-updated"
  | "project.deleted"
  | "thread.created"
  | "thread.deleted"
  | "thread.archived"
  | "thread.unarchived"
  | "thread.meta-updated"
  | "thread.runtime-mode-set"
  | "thread.interaction-mode-set"
  | "thread.message-sent"
  | "thread.turn-queued"
  | "thread.turn-start-requested"
  | "thread.turn-interrupt-requested"
  | "thread.approval-response-requested"
  | "thread.user-input-response-requested"
  | "thread.checkpoint-revert-requested"
  | "thread.reverted"
  | "thread.conversation-rollback-requested"
  | "thread.conversation-rolled-back"
  | "thread.message-edit-resend-requested"
  | "thread.session-stop-requested"
  | "thread.session-set"
  | "thread.proposed-plan-upserted"
  | "thread.turn-diff-completed"
  | "thread.activity-appended";

export type OrchestrationAggregateKind = "project" | "thread";
export type OrchestrationActorKind = "client" | "server" | "provider";

export interface ProjectCreatedPayload {
  projectId: ProjectId;
  kind?: ProjectKind;
  title: TrimmedNonEmptyString;
  workspaceRoot: TrimmedNonEmptyString;
  defaultModelSelection: ModelSelection | null;
  scripts: Array<ProjectScript>;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface ProjectMetaUpdatedPayload {
  projectId: ProjectId;
  kind?: ProjectKind;
  title?: TrimmedNonEmptyString;
  workspaceRoot?: TrimmedNonEmptyString;
  defaultModelSelection?: ModelSelection | null;
  scripts?: Array<ProjectScript>;
  updatedAt: IsoDateTime;
}

export interface ProjectDeletedPayload {
  projectId: ProjectId;
  deletedAt: IsoDateTime;
}

export interface ThreadCreatedPayload {
  threadId: ThreadId;
  projectId: ProjectId;
  title: TrimmedNonEmptyString;
  modelSelection: ModelSelection;
  runtimeMode: RuntimeMode;
  interactionMode: ProviderInteractionMode;
  envMode?: ThreadEnvironmentMode;
  branch: TrimmedNonEmptyString | null;
  worktreePath: TrimmedNonEmptyString | null;
  associatedWorktreePath?: TrimmedNonEmptyString | null;
  associatedWorktreeBranch?: TrimmedNonEmptyString | null;
  associatedWorktreeRef?: TrimmedNonEmptyString | null;
  createBranchFlowCompleted?: boolean;
  isPinned?: boolean;
  parentThreadId?: ThreadId | null;
  subagentAgentId?: TrimmedNonEmptyString | null;
  subagentNickname?: TrimmedNonEmptyString | null;
  subagentRole?: TrimmedNonEmptyString | null;
  forkSourceThreadId?: ThreadId | null;
  sidechatSourceThreadId?: ThreadId | null;
  lastKnownPr?: OrchestrationThreadPullRequest | null;
  handoff: ThreadHandoff | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface ThreadDeletedPayload {
  threadId: ThreadId;
  deletedAt: IsoDateTime;
}

export interface ThreadArchivedPayload {
  threadId: ThreadId;
  archivedAt?: IsoDateTime;
  updatedAt?: IsoDateTime;
}

export interface ThreadUnarchivedPayload {
  threadId: ThreadId;
  unarchivedAt?: IsoDateTime;
  updatedAt?: IsoDateTime;
}

export interface ThreadMetaUpdatedPayload {
  threadId: ThreadId;
  title?: TrimmedNonEmptyString;
  modelSelection?: ModelSelection;
  envMode?: ThreadEnvironmentMode;
  branch?: TrimmedNonEmptyString | null;
  worktreePath?: TrimmedNonEmptyString | null;
  associatedWorktreePath?: TrimmedNonEmptyString | null;
  associatedWorktreeBranch?: TrimmedNonEmptyString | null;
  associatedWorktreeRef?: TrimmedNonEmptyString | null;
  createBranchFlowCompleted?: boolean;
  isPinned?: boolean;
  parentThreadId?: ThreadId | null;
  subagentAgentId?: TrimmedNonEmptyString | null;
  subagentNickname?: TrimmedNonEmptyString | null;
  subagentRole?: TrimmedNonEmptyString | null;
  handoff?: ThreadHandoff | null;
  lastKnownPr?: OrchestrationThreadPullRequest | null;
  updatedAt: IsoDateTime;
}

export interface ThreadRuntimeModeSetPayload {
  threadId: ThreadId;
  runtimeMode: RuntimeMode;
  updatedAt: IsoDateTime;
}

export interface ThreadInteractionModeSetPayload {
  threadId: ThreadId;
  interactionMode: ProviderInteractionMode;
  updatedAt: IsoDateTime;
}

export interface ThreadMessageSentPayload {
  threadId: ThreadId;
  messageId: MessageId;
  role: OrchestrationMessageRole;
  text: string;
  attachments?: Array<ChatAttachment>;
  skills?: Array<ProviderSkillReference>;
  mentions?: Array<ProviderMentionReference>;
  dispatchMode?: TurnDispatchMode;
  turnId: TurnId | null;
  streaming: boolean;
  source: OrchestrationMessageSource;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface ThreadTurnStartRequestedPayload {
  threadId: ThreadId;
  messageId: MessageId;
  modelSelection?: ModelSelection;
  providerOptions?: ProviderStartOptions;
  reviewTarget?: ProviderReviewTarget;
  assistantDeliveryMode?: AssistantDeliveryMode;
  dispatchMode: TurnDispatchMode;
  runtimeMode: RuntimeMode;
  interactionMode: ProviderInteractionMode;
  sourceProposedPlan?: SourceProposedPlanReference;
  createdAt: IsoDateTime;
}

export type ThreadTurnQueuedPayload = ThreadTurnStartRequestedPayload;

export interface ThreadTurnInterruptRequestedPayload {
  threadId: ThreadId;
  turnId?: TurnId;
  createdAt: IsoDateTime;
}

export interface ThreadApprovalResponseRequestedPayload {
  threadId: ThreadId;
  requestId: ApprovalRequestId;
  decision: ProviderApprovalDecision;
  createdAt: IsoDateTime;
}

interface ThreadUserInputResponseRequestedPayload {
  threadId: ThreadId;
  requestId: ApprovalRequestId;
  answers: ProviderUserInputAnswers;
  createdAt: IsoDateTime;
}

export interface ThreadCheckpointRevertRequestedPayload {
  threadId: ThreadId;
  turnCount: NonNegativeInt;
  createdAt: IsoDateTime;
}

export interface ThreadRevertedPayload {
  threadId: ThreadId;
  turnCount: NonNegativeInt;
}

export interface ThreadConversationRollbackRequestedPayload {
  threadId: ThreadId;
  messageId: MessageId;
  numTurns: NonNegativeInt;
  createdAt: IsoDateTime;
}

export interface ThreadConversationRolledBackPayload {
  threadId: ThreadId;
  messageId: MessageId;
  numTurns: NonNegativeInt;
  removedTurnIds?: Array<TurnId>;
  skipAttachmentPrune?: boolean;
}

export interface ThreadMessageEditResendRequestedPayload {
  threadId: ThreadId;
  messageId: MessageId;
  text: TrimmedNonEmptyString;
  rollbackTurnCount?: NonNegativeInt;
  removedTurnIds?: Array<TurnId>;
  modelSelection?: ModelSelection;
  providerOptions?: ProviderStartOptions;
  assistantDeliveryMode?: AssistantDeliveryMode;
  runtimeMode: RuntimeMode;
  interactionMode: ProviderInteractionMode;
  createdAt: IsoDateTime;
}

export interface ThreadSessionStopRequestedPayload {
  threadId: ThreadId;
  createdAt: IsoDateTime;
}

export interface ThreadSessionSetPayload {
  threadId: ThreadId;
  session: OrchestrationSession;
}

export interface ThreadProposedPlanUpsertedPayload {
  threadId: ThreadId;
  proposedPlan: OrchestrationProposedPlan;
}

export interface ThreadTurnDiffCompletedPayload {
  threadId: ThreadId;
  turnId: TurnId;
  checkpointTurnCount: NonNegativeInt;
  checkpointRef: CheckpointRef;
  status: OrchestrationCheckpointStatus;
  files: Array<OrchestrationCheckpointFile>;
  assistantMessageId: MessageId | null;
  completedAt: IsoDateTime;
}

export interface ThreadActivityAppendedPayload {
  threadId: ThreadId;
  activity: OrchestrationThreadActivity;
}

export interface OrchestrationEventMetadata {
  providerTurnId?: TrimmedNonEmptyString;
  providerItemId?: ProviderItemId;
  adapterKey?: TrimmedNonEmptyString;
  requestId?: ApprovalRequestId;
  ingestedAt?: IsoDateTime;
}

interface EventBaseFields {
  sequence: NonNegativeInt;
  eventId: EventId;
  aggregateKind: OrchestrationAggregateKind;
  aggregateId: ProjectId | ThreadId;
  occurredAt: IsoDateTime;
  commandId: CommandId | null;
  causationEventId: EventId | null;
  correlationId: CommandId | null;
  metadata: OrchestrationEventMetadata;
}

export type OrchestrationEvent =
  | (EventBaseFields & { type: "project.created"; payload: ProjectCreatedPayload })
  | (EventBaseFields & { type: "project.meta-updated"; payload: ProjectMetaUpdatedPayload })
  | (EventBaseFields & { type: "project.deleted"; payload: ProjectDeletedPayload })
  | (EventBaseFields & { type: "thread.created"; payload: ThreadCreatedPayload })
  | (EventBaseFields & { type: "thread.deleted"; payload: ThreadDeletedPayload })
  | (EventBaseFields & { type: "thread.archived"; payload: ThreadArchivedPayload })
  | (EventBaseFields & { type: "thread.unarchived"; payload: ThreadUnarchivedPayload })
  | (EventBaseFields & { type: "thread.meta-updated"; payload: ThreadMetaUpdatedPayload })
  | (EventBaseFields & { type: "thread.runtime-mode-set"; payload: ThreadRuntimeModeSetPayload })
  | (EventBaseFields & {
    type: "thread.interaction-mode-set";
    payload: ThreadInteractionModeSetPayload;
  })
  | (EventBaseFields & { type: "thread.message-sent"; payload: ThreadMessageSentPayload })
  | (EventBaseFields & { type: "thread.turn-queued"; payload: ThreadTurnQueuedPayload })
  | (EventBaseFields & {
    type: "thread.turn-start-requested";
    payload: ThreadTurnStartRequestedPayload;
  })
  | (EventBaseFields & {
    type: "thread.turn-interrupt-requested";
    payload: ThreadTurnInterruptRequestedPayload;
  })
  | (EventBaseFields & {
    type: "thread.approval-response-requested";
    payload: ThreadApprovalResponseRequestedPayload;
  })
  | (EventBaseFields & {
    type: "thread.user-input-response-requested";
    payload: ThreadUserInputResponseRequestedPayload;
  })
  | (EventBaseFields & {
    type: "thread.checkpoint-revert-requested";
    payload: ThreadCheckpointRevertRequestedPayload;
  })
  | (EventBaseFields & { type: "thread.reverted"; payload: ThreadRevertedPayload })
  | (EventBaseFields & {
    type: "thread.conversation-rollback-requested";
    payload: ThreadConversationRollbackRequestedPayload;
  })
  | (EventBaseFields & {
    type: "thread.conversation-rolled-back";
    payload: ThreadConversationRolledBackPayload;
  })
  | (EventBaseFields & {
    type: "thread.message-edit-resend-requested";
    payload: ThreadMessageEditResendRequestedPayload;
  })
  | (EventBaseFields & {
    type: "thread.session-stop-requested";
    payload: ThreadSessionStopRequestedPayload;
  })
  | (EventBaseFields & { type: "thread.session-set"; payload: ThreadSessionSetPayload })
  | (EventBaseFields & {
    type: "thread.proposed-plan-upserted";
    payload: ThreadProposedPlanUpsertedPayload;
  })
  | (EventBaseFields & {
    type: "thread.turn-diff-completed";
    payload: ThreadTurnDiffCompletedPayload;
  })
  | (EventBaseFields & {
    type: "thread.activity-appended";
    payload: ThreadActivityAppendedPayload;
  });

export interface OrchestrationThreadDetailSnapshot {
  snapshotSequence: NonNegativeInt;
  thread: OrchestrationThread;
}

export type OrchestrationThreadStreamItem =
  | {
      kind: "snapshot";
      snapshot: OrchestrationThreadDetailSnapshot;
    }
  | {
      kind: "event";
      event: OrchestrationEvent;
    };

export type OrchestrationCommandReceiptStatus = "accepted" | "rejected";

export interface TurnCountRange {
  fromTurnCount: NonNegativeInt;
  toTurnCount: NonNegativeInt;
}

export interface ThreadTurnDiff extends TurnCountRange {
  threadId: ThreadId;
  diff: string;
}

export type ProviderSessionRuntimeStatus = "starting" | "running" | "stopped" | "error";

export type ProjectionThreadTurnStatus = "running" | "completed" | "interrupted" | "error";

export interface ProjectionCheckpointRow {
  threadId: ThreadId;
  turnId: TurnId;
  checkpointTurnCount: NonNegativeInt;
  checkpointRef: CheckpointRef;
  status: OrchestrationCheckpointStatus;
  files: Array<OrchestrationCheckpointFile>;
  assistantMessageId: MessageId | null;
  completedAt: IsoDateTime;
}

export type ProjectionPendingApprovalStatus = "pending" | "resolved";
export type ProjectionPendingApprovalDecision = ProviderApprovalDecision | null;

export interface DispatchResult {
  sequence: NonNegativeInt;
}

export interface OrchestrationGetSnapshotInput {}
export type OrchestrationGetSnapshotResult = OrchestrationReadModel;

export interface OrchestrationGetShellSnapshotInput {}
export type OrchestrationGetShellSnapshotResult = OrchestrationShellSnapshot;

export interface OrchestrationRepairStateInput {}
export type OrchestrationRepairStateResult = OrchestrationReadModel;

export interface OrchestrationGetTurnDiffInput extends TurnCountRange {
  threadId: ThreadId;
  ignoreWhitespace?: boolean;
}
export type OrchestrationGetTurnDiffResult = ThreadTurnDiff;

export interface OrchestrationGetFullThreadDiffInput {
  threadId: ThreadId;
  toTurnCount: NonNegativeInt;
  ignoreWhitespace?: boolean;
}
export type OrchestrationGetFullThreadDiffResult = ThreadTurnDiff;

export interface OrchestrationReplayEventsInput {
  fromSequenceExclusive: NonNegativeInt;
}
export type OrchestrationReplayEventsResult = Array<OrchestrationEvent>;

export interface OrchestrationSubscribeShellInput {}

export interface OrchestrationUnsubscribeShellInput {}

export interface OrchestrationSubscribeThreadInput {
  threadId: ThreadId;
}

export interface OrchestrationImportThreadInput {
  threadId: ThreadId;
  externalId: TrimmedNonEmptyString;
}

export interface OrchestrationImportThreadResult {
  threadId: ThreadId;
}

export interface OrchestrationUnsubscribeThreadInput {
  threadId: ThreadId;
}

export const OrchestrationRpcSchemas = {
  getSnapshot: {
    input: {} as OrchestrationGetSnapshotInput,
    output: {} as OrchestrationGetSnapshotResult,
  },
  getShellSnapshot: {
    input: {} as OrchestrationGetShellSnapshotInput,
    output: {} as OrchestrationGetShellSnapshotResult,
  },
  repairState: {
    input: {} as OrchestrationRepairStateInput,
    output: {} as OrchestrationRepairStateResult,
  },
  dispatchCommand: {
    input: {} as ClientOrchestrationCommand,
    output: {} as DispatchResult,
  },
  importThread: {
    input: {} as OrchestrationImportThreadInput,
    output: {} as OrchestrationImportThreadResult,
  },
  getTurnDiff: {
    input: {} as OrchestrationGetTurnDiffInput,
    output: {} as OrchestrationGetTurnDiffResult,
  },
  getFullThreadDiff: {
    input: {} as OrchestrationGetFullThreadDiffInput,
    output: {} as OrchestrationGetFullThreadDiffResult,
  },
  replayEvents: {
    input: {} as OrchestrationReplayEventsInput,
    output: {} as OrchestrationReplayEventsResult,
  },
  subscribeShell: {
    input: {} as OrchestrationSubscribeShellInput,
    output: undefined as void,
  },
  unsubscribeShell: {
    input: {} as OrchestrationUnsubscribeShellInput,
    output: undefined as void,
  },
  subscribeThread: {
    input: {} as OrchestrationSubscribeThreadInput,
    output: undefined as void,
  },
  unsubscribeThread: {
    input: {} as OrchestrationUnsubscribeThreadInput,
    output: undefined as void,
  },
} as const;
