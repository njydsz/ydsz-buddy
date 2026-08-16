// ssh 契约：类型来自 Rust 端 specta 自动生成。
//
// 真实源（Single Source of Truth）：ydsz-shared/src/contracts/ssh.rs
// 重新生成类型：
//   pnpm --filter @ydsz-buddy/desktop contracts:gen
//   → ydsz-desktop/src/contracts/_generated/ydsz_shared/contracts/ssh.ts
//
// 命名约定：
// - 编译期类型：从 generated re-export（如 `type SshConnectionState`）
// - 运行时校验：本地 effect Schema 仅保留给后续业务做 IPC payload 校验/编解码使用，
//   与同名类型隔离（命名为 *Schema）。

import { Schema } from "effect";

// ===== 编译期类型（来自 Rust 单一来源）=====

export type {
  SshConnectionState,
  SshAuthParams,
  SshConnectParams,
  SshConnectionStatusView,
  SshWriteFileParams,
  SshCreateDirectoryParams,
  SshDeleteDirectoryParams,
} from "./_generated/ydsz_shared/contracts/ssh";

// ===== 运行时 Schema（effect Schema，用于 IPC payload 校验）=====

export const SshConnectionStateSchema = Schema.Literal(
  "Disconnected",
  "Connecting",
  "Connected",
  "Reconnecting",
);

export const SshAuthPasswordSchema = Schema.Struct({
  type: Schema.Literal("password"),
  password: Schema.String,
});

export const SshAuthKeySchema = Schema.Struct({
  type: Schema.Literal("key"),
  keyPath: Schema.String,
  passphrase: Schema.NullOr(Schema.String),
});

export const SshAuthParamsSchema = Schema.Union(
  SshAuthPasswordSchema,
  SshAuthKeySchema,
);

export const SshConnectParamsSchema = Schema.Struct({
  host: Schema.String,
  port: Schema.optionalWith(Schema.Number, { default: () => 22 }),
  username: Schema.String,
  auth: SshAuthParamsSchema,
  autoReconnect: Schema.optionalWith(Schema.Boolean, {
    default: () => true,
  }),
});

export const SshConnectionStatusViewSchema = Schema.Struct({
  state: SshConnectionStateSchema,
  connectionId: Schema.NullOr(Schema.String),
  host: Schema.String,
  port: Schema.Number,
  username: Schema.String,
});

export const SshWriteFileParamsSchema = Schema.Struct({
  connectionId: Schema.String,
  path: Schema.String,
  content: Schema.String,
  createDirectories: Schema.optionalWith(Schema.Boolean, {
    default: () => true,
  }),
});

export const SshCreateDirectoryParamsSchema = Schema.Struct({
  connectionId: Schema.String,
  path: Schema.String,
  recursive: Schema.optionalWith(Schema.Boolean, {
    default: () => true,
  }),
});

export const SshDeleteDirectoryParamsSchema = Schema.Struct({
  connectionId: Schema.String,
  path: Schema.String,
  recursive: Schema.optionalWith(Schema.Boolean, {
    default: () => true,
  }),
});
