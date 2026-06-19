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
  /** 认证策略 */
  policy: ServerAuthPolicy;
  /** 支持的引导方式列表 */
  bootstrapMethods: Array<ServerAuthBootstrapMethod>;
  /** 支持的会话维持方式列表 */
  sessionMethods: Array<ServerAuthSessionMethod>;
  /** 会话 Cookie 名称 */
  sessionCookieName: TrimmedNonEmptyString;
}

/** 认证引导输入，携带凭证信息 */
export interface AuthBootstrapInput {
  /** 认证凭证（如一次性令牌或桌面引导码） */
  credential: TrimmedNonEmptyString;
}

/** 认证引导成功结果，包含角色、会话方式和过期时间 */
export interface AuthBootstrapResult {
  /** 是否认证成功（固定为 true） */
  authenticated: true;
  /** 会话角色 */
  role: AuthSessionRole;
  /** 会话维持方式 */
  sessionMethod: ServerAuthSessionMethod;
  /** 会话过期时间 */
  expiresAt: string;
}

/** Bearer 令牌引导结果，额外返回会话令牌 */
export interface AuthBearerBootstrapResult {
  /** 是否认证成功（固定为 true） */
  authenticated: true;
  /** 会话角色 */
  role: AuthSessionRole;
  /** 会话维持方式（固定为 bearer-session-token） */
  sessionMethod: "bearer-session-token";
  /** 会话过期时间 */
  expiresAt: string;
  /** Bearer 会话令牌 */
  sessionToken: TrimmedNonEmptyString;
}

/** WebSocket 连接认证令牌结果 */
export interface AuthWebSocketTokenResult {
  /** WebSocket 连接令牌 */
  token: TrimmedNonEmptyString;
  /** 令牌过期时间 */
  expiresAt: string;
}

/** 配对凭证创建结果，返回配对所需的 ID 和凭证 */
export interface AuthPairingCredentialResult {
  /** 配对凭证 ID */
  id: TrimmedNonEmptyString;
  /** 配对凭证 */
  credential: TrimmedNonEmptyString;
  /** 凭证标签（可选） */
  label?: TrimmedNonEmptyString;
  /** 凭证过期时间 */
  expiresAt: string;
}

/** 配对链接详情，包含完整的配对元数据 */
export interface AuthPairingLink {
  /** 配对链接 ID */
  id: TrimmedNonEmptyString;
  /** 配对凭证 */
  credential: TrimmedNonEmptyString;
  /** 会话角色 */
  role: AuthSessionRole;
  /** 配对主体（如设备名称） */
  subject: TrimmedNonEmptyString;
  /** 配对链接标签 */
  label?: TrimmedNonEmptyString;
  /** 创建时间 */
  createdAt: string;
  /** 过期时间 */
  expiresAt: string;
}

/** 客户端元数据，记录设备、浏览器、IP 等信息 */
export interface AuthClientMetadata {
  /** 客户端标签（显示名称） */
  label?: TrimmedNonEmptyString;
  /** 客户端 IP 地址 */
  ipAddress?: TrimmedNonEmptyString;
  /** 用户代理字符串 */
  userAgent?: TrimmedNonEmptyString;
  /** 设备类型 */
  deviceType: AuthClientMetadataDeviceType;
  /** 操作系统 */
  os?: TrimmedNonEmptyString;
  /** 浏览器名称 */
  browser?: TrimmedNonEmptyString;
}

/** 客户端会话信息，包含会话状态、角色、连接状态等 */
export interface AuthClientSession {
  /** 会话 ID */
  sessionId: AuthSessionId;
  /** 会话主体（如用户 ID） */
  subject: TrimmedNonEmptyString;
  /** 会话角色 */
  role: AuthSessionRole;
  /** 会话维持方式 */
  method: ServerAuthSessionMethod;
  /** 客户端元数据 */
  client: AuthClientMetadata;
  /** 会话颁发时间 */
  issuedAt: string;
  /** 会话过期时间 */
  expiresAt: string;
  /** 最后连接时间 */
  lastConnectedAt: string | null;
  /** 当前是否已连接 */
  connected: boolean;
  /** 是否为当前会话 */
  current: boolean;
}

/** 访问权限快照，包含所有配对链接和客户端会话 */
export interface AuthAccessSnapshot {
  /** 所有配对链接列表 */
  pairingLinks: Array<AuthPairingLink>;
  /** 所有客户端会话列表 */
  clientSessions: Array<AuthClientSession>;
}

/** 撤销配对链接的输入参数 */
export interface AuthRevokePairingLinkInput {
  /** 要撤销的配对链接 ID */
  id: TrimmedNonEmptyString;
}

/** 撤销客户端会话的输入参数 */
export interface AuthRevokeClientSessionInput {
  /** 要撤销的会话 ID */
  sessionId: AuthSessionId;
}

/** 创建配对凭证的输入参数 */
export interface AuthCreatePairingCredentialInput {
  /** 凭证标签（可选） */
  label?: TrimmedNonEmptyString;
}

/** 当前认证会话状态，包含是否已认证及会话详情 */
export interface AuthSessionState {
  /** 是否已认证 */
  authenticated: boolean;
  /** 认证描述符 */
  auth: ServerAuthDescriptor;
  /** 会话角色（未认证时为空） */
  role?: AuthSessionRole;
  /** 会话维持方式（未认证时为空） */
  sessionMethod?: ServerAuthSessionMethod;
  /** 会话过期时间（未认证时为空） */
  expiresAt?: string;
}
