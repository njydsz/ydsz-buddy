// skillMarketplace 契约：类型来自 Rust 端 specta 自动生成；运行时 Schema 保留 effect Schema。
//
// 真实源（Single Source of Truth）：ydsz-shared/src/contracts/skill_marketplace.rs
// 重新生成类型：
//   pnpm --filter @ydsz-buddy/desktop contracts:gen
//   → ydsz-desktop/src/contracts/_generated/ydsz_shared/contracts/skill_marketplace.ts
//
// 命名约定：
// - 编译期类型：从 generated re-export
// - 运行时 Schema：本地 effect Schema 加 *Schema 后缀与同名类型隔离。

import { Schema } from "effect";

import { TrimmedNonEmptyString } from "./baseSchemas";

// ===== 编译期类型（来自 Rust 单一来源）=====

export type {
  InstalledSkill,
  MarketplaceCategory,
  MarketplaceEntry,
  SkillBody,
  SkillInstallInput,
  SkillMarketplaceSearchInput,
  SkillMarketplaceTrendingInput,
  SkillTemplate,
} from "./_generated/ydsz_shared/contracts/skill_marketplace";

// ===== 前端本地 stub 类型（等待 Rust 端 specta 生成）=====
//
// 以下类型在前端代码中先定义本地 stub；一旦 Rust 端在
// `ydsz-shared/src/contracts/skill_marketplace.rs` 添加对应 `#[derive(Type)]` struct
// 并 `cargo test -p ydsz-shared --features ts-export --test contracts_gen` 重新生成
// `_generated/ydsz_shared/contracts/skill_marketplace.ts` 后，下面这一行会被
// specta 生成的同名类型覆盖。
//
// 当前 stub 字段与 Rust 端 `SkillMarketplaceSetUrlInput` / `SkillMarketplaceStatus` 保持一致。

/**
 * `skill_marketplace.set_url` 输入
 *
 * - `url` 为 `string`：切换到指定 URL（必须以 http(s):// 开头）
 * - `url` 为 `null` 或缺省：清空，恢复使用默认 / 环境变量 URL
 * - `refresh` 为 `true`：设置后立即触发一次 `refresh()`（默认 false）
 */
export type SkillMarketplaceSetUrlInput = {
  url?: string | null;
  refresh?: boolean | null;
};

/**
 * `skill_marketplace.status` / `refresh` / `set_url` 返回的 marketplace 当前状态
 *
 * - `source`：`remote`（远端）/ `diskCache`（磁盘缓存）/ `builtin`（内置）
 * - `lastRefreshedAt`：RFC3339 字符串；`null` 表示从未刷新（仅 builtin 时为 null）
 * - `count`：当前 skill 数量
 * - `remoteUrl`：当前生效的远端 URL
 */
export type SkillMarketplaceStatus = {
  source: "remote" | "diskCache" | "builtin" | string;
  lastRefreshedAt?: string | null;
  count: number;
  remoteUrl?: string | null;
};

// ===== 运行时 Schema（effect Schema）=====

// ===========================================================================
// Marketplace Entry
// ===========================================================================

export const MarketplaceEntrySchema = Schema.Struct({
  /** 短 slug（marketplace:slug URI 用） */
  slug: TrimmedNonEmptyString,
  /** 人类可读名 */
  name: TrimmedNonEmptyString,
  /** 描述 */
  description: Schema.String,
  /** GitHub owner */
  githubOwner: Schema.String,
  /** GitHub repo */
  githubRepo: Schema.String,
  /** GitHub ref（tag / branch / sha） */
  githubRef: Schema.String,
  /** 标签 */
  tags: Schema.Array(Schema.String),
  /** 运行时（code / work / any） */
  runtime: Schema.String,
  /** 是否官方认证 */
  verified: Schema.Boolean,
});

// ===========================================================================
// Marketplace Category
// ===========================================================================

export const MarketplaceCategorySchema = Schema.Struct({
  /** 分类 id（"all" / "verified" / "runtime:code" / "tag:react"） */
  id: TrimmedNonEmptyString,
  /** 人类可读名 */
  label: TrimmedNonEmptyString,
  /** 该分类下 skill 数量 */
  count: Schema.Number,
});

// ===========================================================================
// Skill Template (自定义 Skill 表单)
// ===========================================================================

export const SkillTemplateSchema = Schema.Struct({
  /** Skill 名称（小写字母/数字/_/-，1-40 字符） */
  name: TrimmedNonEmptyString,
  /** 版本（默认 "0.0.0"） */
  version: Schema.optional(Schema.String),
  /** 描述 */
  description: Schema.optional(Schema.String),
  /** 作者 */
  author: Schema.optional(Schema.String),
  /** 运行时（code / work / any，默认 "any"） */
  runtime: Schema.optional(Schema.String),
  /** 标签 */
  tags: Schema.optional(Schema.Array(Schema.String)),
  /** 依赖 */
  depends: Schema.optional(Schema.Array(Schema.String)),
  /** SKILL.md 正文（prompt 模板） */
  body: Schema.optional(Schema.String),
});

// ===========================================================================
// Installed Skill (与后端 InstalledSkill 对应)
// ===========================================================================

export const InstalledSkillSchema = Schema.Struct({
  /** Skill 名称（作为主键） */
  name: TrimmedNonEmptyString,
  /** 版本 */
  version: Schema.String,
  /** 描述 */
  description: Schema.String,
  /** 作者 */
  author: Schema.String,
  /** 运行时 */
  runtime: Schema.String,
  /** 标签 */
  tags: Schema.Array(Schema.String),
  /** 依赖 */
  depends: Schema.Array(Schema.String),
  /** 安装目录 */
  installDir: Schema.String,
  /** 安装时间（Unix 秒字符串） */
  installedAt: Schema.String,
  /** 安装源（local:... / github:owner/repo@ref / marketplace:slug） */
  installSource: Schema.String,
});

// ===========================================================================
// Skill Body (prompt 注入)
// ===========================================================================

export const SkillBodySchema = Schema.Struct({
  name: TrimmedNonEmptyString,
  body: Schema.String,
  description: Schema.String,
  tags: Schema.Array(Schema.String),
});

// ===========================================================================
// RPC 输入
// ===========================================================================

export const SkillMarketplaceSearchInputSchema = Schema.Struct({
  query: Schema.String,
  category: Schema.optional(Schema.String),
});

export const SkillMarketplaceTrendingInputSchema = Schema.Struct({
  limit: Schema.optional(Schema.Number),
});

export const SkillInstallInputSchema = Schema.Struct({
  source: TrimmedNonEmptyString,
});
