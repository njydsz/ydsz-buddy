// auth 契约：类型来自 Rust 端 specta 自动生成；运行时 Schema 保留 effect Schema。
//
// 真实源（Single Source of Truth）：ydsz-shared/src/contracts/auth.rs
// 重新生成类型：
//   pnpm --filter @ydsz-buddy/desktop contracts:gen
//   → ydsz-desktop/src/contracts/_generated/ydsz_shared/contracts/auth.ts
//
// 命名约定：
// - 编译期类型：从 generated re-export（如 `type ServerAuthDescriptor`）
// - 运行时校验：本地 effect Schema 仅保留给后续业务做 IPC payload 校验/编解码使用，
//   与同名类型隔离（命名为 *Schema）。
// - 业务消费 `import type { ServerAuthPolicy }` 走类型；`import { ServerAuthPolicySchema }` 走运行时。

import { Schema } from "effect";

import { AuthSessionId, TrimmedNonEmptyString } from "./baseSchemas";

// ===== 编译期类型（来自 Rust 单一来源）=====

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
// 加 Schema 后缀以避免与上方 re-exported 类型同名冲突（TS 编译期 namespace 隔离但
// 配合 isolatedModules 时存在不必要歧义）。

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

export const AuthBootstrapInputSchema = Schema.Struct({
  credential: TrimmedNonEmptyString,
});

export const AuthBootstrapResultSchema = Schema.Struct({
  authenticated: Schema.Literal(true),
  role: AuthSessionRoleSchema,
  sessionMethod: ServerAuthSessionMethodSchema,
  expiresAt: Schema.DateTimeUtc,
});

export const AuthBearerBootstrapResultSchema = Schema.Struct({
  authenticated: Schema.Literal(true),
  role: AuthSessionRoleSchema,
  sessionMethod: Schema.Literal("bearer-session-token"),
  expiresAt: Schema.DateTimeUtc,
  sessionToken: TrimmedNonEmptyString,
});

export const AuthWebSocketTokenResultSchema = Schema.Struct({
  token: TrimmedNonEmptyString,
  expiresAt: Schema.DateTimeUtc,
});

export const AuthPairingCredentialResultSchema = Schema.Struct({
  id: TrimmedNonEmptyString,
  credential: TrimmedNonEmptyString,
  label: Schema.optional(TrimmedNonEmptyString),
  expiresAt: Schema.DateTimeUtc,
});

export const AuthPairingLinkSchema = Schema.Struct({
  id: TrimmedNonEmptyString,
  credential: TrimmedNonEmptyString,
  role: AuthSessionRoleSchema,
  subject: TrimmedNonEmptyString,
  label: Schema.optional(TrimmedNonEmptyString),
  createdAt: Schema.DateTimeUtc,
  expiresAt: Schema.DateTimeUtc,
});

export const AuthClientMetadataDeviceTypeSchema = Schema.Literal(
  "desktop",
  "mobile",
  "tablet",
  "bot",
  "unknown",
);

export const AuthClientMetadataSchema = Schema.Struct({
  label: Schema.optional(TrimmedNonEmptyString),
  ipAddress: Schema.optional(TrimmedNonEmptyString),
  userAgent: Schema.optional(TrimmedNonEmptyString),
  deviceType: AuthClientMetadataDeviceTypeSchema,
  os: Schema.optional(TrimmedNonEmptyString),
  browser: Schema.optional(TrimmedNonEmptyString),
});

export const AuthClientSessionSchema = Schema.Struct({
  sessionId: AuthSessionId,
  subject: TrimmedNonEmptyString,
  role: AuthSessionRoleSchema,
  method: ServerAuthSessionMethodSchema,
  client: AuthClientMetadataSchema,
  issuedAt: Schema.DateTimeUtc,
  expiresAt: Schema.DateTimeUtc,
  lastConnectedAt: Schema.optional(Schema.DateTimeUtc),
  connected: Schema.Boolean,
  current: Schema.Boolean,
});

export const AuthAccessSnapshotSchema = Schema.Struct({
  pairingLinks: Schema.Array(AuthPairingLinkSchema),
  clientSessions: Schema.Array(AuthClientSessionSchema),
});

export const AuthRevokePairingLinkInputSchema = Schema.Struct({
  id: TrimmedNonEmptyString,
});

export const AuthRevokeClientSessionInputSchema = Schema.Struct({
  sessionId: TrimmedNonEmptyString,
});

export const AuthCreatePairingCredentialInputSchema = Schema.Struct({
  label: Schema.optional(TrimmedNonEmptyString),
});

export const AuthSessionStateSchema = Schema.Struct({
  authenticated: Schema.Boolean,
  auth: ServerAuthDescriptorSchema,
  role: Schema.optional(AuthSessionRoleSchema),
  sessionMethod: Schema.optional(ServerAuthSessionMethodSchema),
  expiresAt: Schema.optional(Schema.DateTimeUtc),
});
