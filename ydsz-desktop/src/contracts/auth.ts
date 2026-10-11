// auth 契约：类型来自 Rust 端 specta 自动生成；运行时 Schema 保留 effect Schema。
//
// 真实源（Single Source of Truth）：
//   - ydsz-shared/src/contracts/auth.rs (server auth)
//   - ydzs-desktop/src-tauri/src/auth/mod.rs (local RBAC)
//
// 本地多用户 RBAC (G3-P0) 新增类型在此手动定义（等待 specta 生成对齐）。

import { Schema } from "effect";
import { TrimmedNonEmptyString } from "./baseSchemas";

// ===== G3-P0: 本地多用户 RBAC 类型 =====

/** 用户角色 */
export const UserRoleSchema = Schema.Literal("admin", "developer", "viewer");

export type UserRole = Schema.Schema.Type<typeof UserRoleSchema>;

/** 用户公开信息（IPC 安全 DTO，不含密码哈希） */
export const UserInfoSchema = Schema.Struct({
  id: TrimmedNonEmptyString,
  username: TrimmedNonEmptyString,
  role: Schema.Literal("admin", "developer", "viewer"),
  createdAtMs: Schema.Number,
  lastLoginMs: Schema.optional(Schema.Number),
});

export type UserInfo = Schema.Schema.Type<typeof UserInfoSchema>;

/** 登录请求 */
export const LoginRequestSchema = Schema.Struct({
  username: TrimmedNonEmptyString,
  password: TrimmedNonEmptyString,
});

export type LoginRequest = Schema.Schema.Type<typeof LoginRequestSchema>;

/** 认证结果（登录返回） */
export const AuthResultSchema = Schema.Struct({
  token: TrimmedNonEmptyString,
  user: UserInfoSchema,
  expiresAtMs: Schema.Number,
});

export type AuthResult = Schema.Schema.Type<typeof AuthResultSchema>;

/** 注册请求 */
export const RegisterRequestSchema = Schema.Struct({
  username: TrimmedNonEmptyString,
  password: TrimmedNonEmptyString,
  role: Schema.Literal("admin", "developer", "viewer"),
  adminToken: Schema.optional(TrimmedNonEmptyString),
});

export type RegisterRequest = Schema.Schema.Type<typeof RegisterRequestSchema>;

/** 当前用户响应 */
export const CurrentUserResponseSchema = Schema.Struct({
  user: Schema.optional(UserInfoSchema),
  requiresLogin: Schema.Boolean,
});

export type CurrentUserResponse = Schema.Schema.Type<typeof CurrentUserResponseSchema>;

/** 首次运行检查响应 */
export const FirstRunResponseSchema = Schema.Struct({
  isFirstRun: Schema.Boolean,
  userCount: Schema.Number,
});

export type FirstRunResponse = Schema.Schema.Type<typeof FirstRunResponseSchema>;

// ===== 编译期类型（来自 Rust 单一来源 — server auth）=====

export type {
  ServerAuthPolicy,
  ServerAuthBootstrapMethod,
  ServerAuthSessionMethod,
  AuthSessionRole,
  AuthClientMetadataDeviceType,
  ServerAuthDescriptor,
  AuthBootstrapInput,
  AuthBootstrapResult,
  AuthBearerBootstrapResult,
  AuthWebSocketTokenResult,
  AuthPairingCredentialResult,
  AuthPairingLink,
  AuthClientMetadata,
  AuthClientSession,
  AuthAccessSnapshot,
  AuthRevokePairingLinkInput,
  AuthRevokeClientSessionInput,
  AuthCreatePairingCredentialInput,
  AuthSessionState,
} from "./_generated/ydsz_shared/contracts/auth";

// ===== 运行时 Schema（effect Schema，保留用于 IPC payload 校验 / 业务编码）=====

export const ServerAuthPolicySchema = Schema.Literal(
  "desktop-managed-local",
  "loopback-browser",
  "remote-reachable",
  "unsafe-no-auth",
);

export const ServerAuthBootstrapMethodSchema = Schema.Literal(
  "desktop-bootstrap",
  "one-time-token",
);

export const ServerAuthSessionMethodSchema = Schema.Literal(
  "browser-session-cookie",
  "bearer-session-token",
);

export const AuthSessionRoleSchema = Schema.Literal("owner", "client");

export const ServerAuthDescriptorSchema = Schema.Struct({
  policy: ServerAuthPolicySchema,
  bootstrapMethods: Schema.Array(ServerAuthBootstrapMethodSchema),
  sessionMethods: Schema.Array(ServerAuthSessionMethodSchema),
  sessionCookieName: TrimmedNonEmptyString,
});
