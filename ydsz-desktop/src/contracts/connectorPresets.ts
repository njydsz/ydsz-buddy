// Connector 预置实例契约（G16-P1）：与 src-tauri/src/commands/connector_presets.rs 对齐。
//
// 后端单源：ydsz-desktop/src-tauri/src/commands/connector_presets.rs
//          ydsz-desktop/src-tauri/src/connectors/presets/{github,notion,slack}.rs

import { invoke } from "@tauri-apps/api/core";

// ===== 预置连接器信息 =====

/** 预置连接器展示信息 */
export interface ConnectorPresetInfo {
  id: string;
  displayName: string;
  description: string;
  authType: "token" | "api_key" | "oauth" | "basic";
  configSchema: Record<string, unknown>;
  availableActions: string[];
}

// ===== 预置连接器命令 =====

/** 列出所有可用预置连接器 */
export function connectorPresetsList(): Promise<ConnectorPresetInfo[]> {
  return invoke<ConnectorPresetInfo[]>("connector_presets_list");
}

/** 连接到指定预置服务，返回 instanceId */
export function connectorPresetsConnect(
  connectorId: string,
  config: Record<string, unknown>,
): Promise<string> {
  return invoke<string>("connector_presets_connect", {
    connectorId,
    config,
  });
}

/** 调用预置连接器功能 */
export function connectorPresetsCall(
  connectorId: string,
  action: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  return invoke<unknown>("connector_presets_call", {
    connectorId,
    action,
    params,
  });
}

/** 断开预置连接器 */
export function connectorPresetsDisconnect(
  connectorId: string,
): Promise<void> {
  return invoke<void>("connector_presets_disconnect", {
    connectorId,
  });
}

// ===== GitHub 数据类型 =====

/** GitHub 仓库摘要 */
export interface GitHubRepoInfo {
  name: string;
  fullName: string;
  description: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  language: string | null;
  url: string;
}

/** GitHub Issue 摘要 */
export interface GitHubIssueInfo {
  number: number;
  title: string;
  state: string;
  author: string;
  labels: string[];
  url: string;
  createdAt: string;
}

/** GitHub PR 摘要 */
export interface GitHubPrInfo {
  number: number;
  title: string;
  state: string;
  author: string;
  sourceBranch: string;
  targetBranch: string;
  url: string;
  createdAt: string;
}

/** 创建 GitHub Issue 入参 */
export interface GitHubCreateIssueRequest {
  title: string;
  body?: string;
  labels?: string[];
}

// ===== GitHub 便捷调用 =====

/** 获取当前用户 GitHub 仓库列表 */
export function githubFetchRepos(): Promise<GitHubRepoInfo[]> {
  return connectorPresetsCall("github", "fetch_repos", {}) as Promise<GitHubRepoInfo[]>;
}

/** 获取仓库 Issue 列表 */
export function githubFetchIssues(repo: string): Promise<GitHubIssueInfo[]> {
  return connectorPresetsCall("github", "fetch_issues", { repo }) as Promise<GitHubIssueInfo[]>;
}

/** 获取仓库 PR 列表 */
export function githubFetchPrs(repo: string): Promise<GitHubPrInfo[]> {
  return connectorPresetsCall("github", "fetch_prs", { repo }) as Promise<GitHubPrInfo[]>;
}

/** 在仓库创建 Issue */
export function githubCreateIssue(
  repo: string,
  request: GitHubCreateIssueRequest,
): Promise<GitHubIssueInfo> {
  return connectorPresetsCall("github", "create_issue", {
    repo,
    ...request,
  }) as Promise<GitHubIssueInfo>;
}

// ===== Notion 数据类型 =====

/** Notion 页面摘要 */
export interface NotionPageInfo {
  id: string;
  title: string;
  url: string;
  lastEditedTime: string;
}

/** Notion 页面内容 */
export interface NotionPageContent {
  id: string;
  title: string;
  contentBlocks: unknown;
  url: string;
  lastEditedTime: string;
}

/** 创建 Notion 页面入参 */
export interface NotionCreatePageRequest {
  parentId: string;
  parentType?: "page_id" | "database_id";
  title: string;
  content?: string;
}

// ===== Notion 便捷调用 =====

/** 搜索 Notion 页面 */
export function notionSearchPages(query: string): Promise<NotionPageInfo[]> {
  return connectorPresetsCall("notion", "search_pages", { query }) as Promise<NotionPageInfo[]>;
}

/** 读取 Notion 页面内容 */
export function notionReadPage(pageId: string): Promise<NotionPageContent> {
  return connectorPresetsCall("notion", "read_page", { pageId }) as Promise<NotionPageContent>;
}

/** 创建 Notion 页面 */
export function notionCreatePage(
  request: NotionCreatePageRequest,
): Promise<NotionPageInfo> {
  return connectorPresetsCall("notion", "create_page", request) as Promise<NotionPageInfo>;
}

// ===== Slack 数据类型 =====

/** Slack 频道信息 */
export interface SlackChannelInfo {
  id: string;
  name: string;
  isPrivate: boolean;
  isMember: boolean;
  topic: string | null;
  purpose: string | null;
  memberCount: number | null;
}

/** Slack 消息信息 */
export interface SlackMessageInfo {
  ts: string;
  user: string | null;
  text: string;
  channel: string;
  threadTs: string | null;
}

/** 发送 Slack 消息入参 */
export interface SlackSendMessageRequest {
  channel: string;
  text: string;
  asUser?: boolean;
}

// ===== Slack 便捷调用 =====

/** 列出 Slack 频道 */
export function slackListChannels(): Promise<SlackChannelInfo[]> {
  return connectorPresetsCall("slack", "list_channels", {}) as Promise<SlackChannelInfo[]>;
}

/** 发送 Slack 消息 */
export function slackSendMessage(
  request: SlackSendMessageRequest,
): Promise<SlackMessageInfo> {
  return connectorPresetsCall("slack", "send_message", request) as Promise<SlackMessageInfo>;
}

/** 读取 Slack 频道消息历史 */
export function slackReadHistory(
  channel: string,
  limit?: number,
): Promise<SlackMessageInfo[]> {
  return connectorPresetsCall("slack", "read_history", {
    channel,
    limit: limit ?? 20,
  }) as Promise<SlackMessageInfo[]>;
}
