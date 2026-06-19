/**
 * @file 认证协议类型定义
 * @description 定义服务端认证策略、会话引导、令牌颁发、配对链接、客户端会话管理
 * 等完整的认证流程相关类型。涵盖从引导认证到会话维持的全生命周期数据结构。
 */

import type { AuthSessionId, TrimmedNonEmptyString } from "./baseSchemas";

/** 服务端认证策略：桌面托管本地认证、回环浏览器认证、远程可达认证、无认证（不安全） */
export type ServerAuthPolicy =
  | "desktop-managed-local"
  | "loopback-browser"
  | "remote-reachable"
  | "unsafe-no-auth";

/** 认证引导方式：桌面引导、一次性令牌 */
export type ServerAuthBootstrapMethod = "desktop-bootstrap" | "one-time-token";

/** 会话维持方式：浏览器会话 Cookie、Bearer 令牌 */
export type ServerAuthSessionMethod = "browser-session-cookie" | "bearer-session-token";

/** 认证会话角色：所有者（owner）、客户端（client） */
export type AuthSessionRole = "owner" | "client";

/** 服务端认证描述符，声明策略、引导方式、会话方式及 Cookie 名称 */
export interface ServerAuthDescriptor {
  policy: ServerAuthPolicy;
  bootstrapMethods: Array<ServerAuthBootstrapMethod>;
  sessionMethods: Array<ServerAuthSessionMethod>;
  sessionCookieName: TrimmedNonEmptyString;
}

/** 认证引导输入，携带凭证信息 */
export interface AuthBootstrapInput {
  credential: TrimmedNonEmptyString;
}

/** 认证引导成功结果，包含角色、会话方式和过期时间 */
export interface AuthBootstrapResult {
  authenticated: true;
  role: AuthSessionRole;
  sessionMethod: ServerAuthSessionMethod;
  expiresAt: string;
}

/** Bearer 令牌引导结果，额外返回会话令牌 */
export interface AuthBearerBootstrapResult {
  authenticated: true;
  role: AuthSessionRole;
  sessionMethod: "bearer-session-token";
  expiresAt: string;
  sessionToken: TrimmedNonEmptyString;
}

/** WebSocket 连接认证令牌结果 */
export interface AuthWebSocketTokenResult {
  token: TrimmedNonEmptyString;
  expiresAt: string;
}

/** 配对凭证创建结果，返回配对所需的 ID 和凭证 */
export interface AuthPairingCredentialResult {
  id: TrimmedNonEmptyString;
  credential: TrimmedNonEmptyString;
  label?: TrimmedNonEmptyString;
  expiresAt: string;
}

/** 配对链接详情，包含完整的配对元数据 */
export interface AuthPairingLink {
  id: TrimmedNonEmptyString;
  credential: TrimmedNonEmptyString;
  role: AuthSessionRole;
  subject: TrimmedNonEmptyString;
  label?: TrimmedNonEmptyString;
  createdAt: string;
  expiresAt: string;
}

/** 客户端设备类型 */
export type AuthClientMetadataDeviceType = "desktop" | "mobile" | "tablet" | "bot" | "unknown";

/** 客户端元数据，记录设备、浏览器、IP 等信息 */
export interface AuthClientMetadata {
  label?: TrimmedNonEmptyString;
  ipAddress?: TrimmedNonEmptyString;
  userAgent?: TrimmedNonEmptyString;
  deviceType: AuthClientMetadataDeviceType;
  os?: TrimmedNonEmptyString;
  browser?: TrimmedNonEmptyString;
}

/** 客户端会话信息，包含会话状态、角色、连接状态等 */
export interface AuthClientSession {
  sessionId: AuthSessionId;
  subject: TrimmedNonEmptyString;
  role: AuthSessionRole;
  method: ServerAuthSessionMethod;
  client: AuthClientMetadata;
  issuedAt: string;
  expiresAt: string;
  lastConnectedAt: string | null;
  connected: boolean;
  current: boolean;
}

/** 访问权限快照，包含所有配对链接和客户端会话 */
export interface AuthAccessSnapshot {
  pairingLinks: Array<AuthPairingLink>;
  clientSessions: Array<AuthClientSession>;
}

/** 撤销配对链接的输入参数 */
export interface AuthRevokePairingLinkInput {
  id: TrimmedNonEmptyString;
}

/** 撤销客户端会话的输入参数 */
export interface AuthRevokeClientSessionInput {
  sessionId: AuthSessionId;
}

/** 创建配对凭证的输入参数 */
export interface AuthCreatePairingCredentialInput {
  label?: TrimmedNonEmptyString;
}

/** 当前认证会话状态，包含是否已认证及会话详情 */
export interface AuthSessionState {
  authenticated: boolean;
  auth: ServerAuthDescriptor;
  role?: AuthSessionRole;
  sessionMethod?: ServerAuthSessionMethod;
  expiresAt?: string;
}
