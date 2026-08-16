/**
 * @file AST-Grep 契约模块
 *
 * 定义 AST-Grep 结构搜索相关的数据契约，与后端
 * `YdszRpcRoutercontracts::ast_grep` 保持字段一致。
 *
 * ## 核心契约
 *
 * - `AstGrepPreset`：预设模式 ID（snake_case 字符串联合）
 * - `AstGrepPresetInfo`：预设模式详情（id / displayName / supportedLanguages）
 * - `AstGrepLanguage`：目标语言（typescript / javascript / rust / python）
 * - `AstGrepCapture`：S-expression 查询的捕获项（name / text）
 * - `AstGrepMatch`：单条匹配命中（file / line / column / text / nodeKind / captures）
 * - `AstGrepCompiledPattern`：模式编译结果（s-expression + captures）
 *
 * ## RPC 输入
 *
 * - `AstGrepFindByNodeKindInput`：`indexer.astGrepFindByNodeKind`
 * - `AstGrepFindByQueryInput`：`indexer.astGrepFindByQuery`
 * - `AstGrepFindByNameInput`：`indexer.astGrepFindByName`（mode: calls | references）
 * - `AstGrepListPresetsInput`：`indexer.astGrepListPresets`
 * - `AstGrepCompilePatternInput`：`indexer.astGrepCompilePattern`
 * - `AstGrepRewriteInput`：`indexer.astGrepRewrite`
 *
 * ## RPC 输出
 *
 * - `AstGrepRewriteResult`：替换结果（newContent / replacements / matchLocations）
 *
 * ## 双路径调用
 *
 * 同一组契约在两条路径上都可用：
 * - Tauri 命令路径（`useComposerAstGrepSearch` 直接 `invoke`）
 * - WebSocket 路径（`useComposerAstGrepSearch` 走 `readNativeApi().indexer.*`）
 *
 * 字段顺序、命名均与 Rust 端 specta::Type 导出一致；TS 端通过
 * `import type` 复用本文件生成的类型。
 */

import { Schema } from "effect";
import { TrimmedNonEmptyString } from "./baseSchemas";

// ===========================================================================
// 预设枚举（snake_case 字符串联合）
// ===========================================================================

/** AST-Grep 预设模式（与 Rust 端 `AstGrepPreset` 一一对应） */
export const AstGrepPreset = Schema.Literal(
  /** 所有 `console.log(...)` 调用 */
  "console_log",
  /** 所有 `console.error(...)` 调用 */
  "console_error",
  /** 所有 `await fetch(...)` 调用 */
  "await_fetch",
  /** 所有 `try { ... } catch { ... }` 语句 */
  "try_catch",
  /** 所有 `TODO(...)` / `FIXME(...)` 注释 */
  "todo_comment",
  /** Rust: 所有 `unwrap()` 调用 */
  "rust_unwrap",
  /** Rust: 所有 `expect("...")` 调用 */
  "rust_expect",
  /** Python: 所有 `print(...)` 调用 */
  "py_print",
  /** Python: 所有 `except:` 异常处理 */
  "py_except",
);
export type AstGrepPreset = typeof AstGrepPreset.Type;

/** AST-Grep 预设模式详情 */
export const AstGrepPresetInfo = Schema.Struct({
  /** preset id（snake_case） */
  id: AstGrepPreset,
  /** 人类可读名 */
  displayName: Schema.String,
  /** 支持的语言列表（"typescript" / "javascript" / "rust" / "python"） */
  supportedLanguages: Schema.Array(Schema.String),
});
export type AstGrepPresetInfo = typeof AstGrepPreset.Type;

/** AST-Grep 目标语言 */
export const AstGrepLanguage = Schema.Literal(
  "typescript",
  "javascript",
  "rust",
  "python",
);
export type AstGrepLanguage = typeof AstGrepLanguage.Type;

// ===========================================================================
// 匹配命中
// ===========================================================================

/** 捕获项：S-expression 查询中 `@name` 节点对应的文本 */
export const AstGrepCapture = Schema.Struct({
  /** 捕获名 */
  name: TrimmedNonEmptyString,
  /** 捕获文本 */
  text: Schema.String,
});
export type AstGrepCapture = typeof AstGrepCapture.Type;

/** 单条匹配命中 */
export const AstGrepMatch = Schema.Struct({
  /** 命中的源文件（绝对路径或相对工作区根） */
  file: TrimmedNonEmptyString,
  /** 起始行（1-based） */
  line: Schema.Number,
  /** 起始列（1-based） */
  column: Schema.Number,
  /** 起始字节偏移 */
  startByte: Schema.Number,
  /** 结束字节偏移 */
  endByte: Schema.Number,
  /** 命中的原始文本 */
  text: Schema.String,
  /** 命中的节点类型 */
  nodeKind: TrimmedNonEmptyString,
  /** 捕获名 → 文本（仅 S-expression 查询使用） */
  captures: Schema.Array(AstGrepCapture),
});
export type AstGrepMatch = typeof AstGrepMatch.Type;

// ===========================================================================
// 模式编译
// ===========================================================================

/** 模式编译结果 */
export const AstGrepCompiledPattern = Schema.Struct({
  /** tree-sitter S-expression */
  query: TrimmedNonEmptyString,
  /** 顶层 capture 名（按出现顺序） */
  captures: Schema.Array(TrimmedNonEmptyString),
});
export type AstGrepCompiledPattern = typeof AstGrepCompiledPattern.Type;

// ===========================================================================
// 检索模式
// ===========================================================================

/** `astGrepFindByName` 检索模式 */
export const AstGrepFindMode = Schema.Literal("calls", "references");
export type AstGrepFindMode = typeof AstGrepFindMode.Type;

// ===========================================================================
// RPC 输入
// ===========================================================================

/** `indexer.astGrepFindByNodeKind` 输入 */
export const AstGrepFindByNodeKindInput = Schema.Struct({
  /** 工作区根目录 */
  workspaceRoot: TrimmedNonEmptyString,
  /** 节点类型，如 `try_statement` / `call_expression` / `await_expression` */
  kind: TrimmedNonEmptyString,
});
export type AstGrepFindByNodeKindInput = typeof AstGrepFindByNodeKindInput.Type;

/** `indexer.astGrepFindByQuery` 输入 */
export const AstGrepFindByQueryInput = Schema.Struct({
  /** 工作区根目录 */
  workspaceRoot: TrimmedNonEmptyString,
  /** 目标语言 */
  language: AstGrepLanguage,
  /** S-expression 查询字符串 */
  query: TrimmedNonEmptyString,
});
export type AstGrepFindByQueryInput = typeof AstGrepFindByQueryInput.Type;

/** `indexer.astGrepFindByName` 输入（统一 find_references + find_calls_to 入口） */
export const AstGrepFindByNameInput = Schema.Struct({
  /** 工作区根目录 */
  workspaceRoot: TrimmedNonEmptyString,
  /** 名称（支持 `"foo"` / `"obj.foo"` 两种形式） */
  name: TrimmedNonEmptyString,
  /** `references`：找所有标识符出现位置；`calls`：仅找 `name(...)` 形式调用（默认 `calls`） */
  mode: Schema.optional(AstGrepFindMode),
});
export type AstGrepFindByNameInput = typeof AstGrepFindByNameInput.Type;

/** `indexer.astGrepListPresets` 输入 */
export const AstGrepListPresetsInput = Schema.Struct({
  /** 仅返回支持目标语言的 preset（None 表示全部） */
  language: Schema.optional(AstGrepLanguage),
});
export type AstGrepListPresetsInput = typeof AstGrepListPresetsInput.Type;

/** `indexer.astGrepCompilePattern` 输入 */
export const AstGrepCompilePatternInput = Schema.Struct({
  /** 目标语言 */
  language: AstGrepLanguage,
  /** 用户友好的模式（如 `"console.log($MSG)"` / `"call_expression"`） */
  pattern: TrimmedNonEmptyString,
});
export type AstGrepCompilePatternInput = typeof AstGrepCompilePatternInput.Type;

// ===========================================================================
// 结构化重写
// ===========================================================================

/** `indexer.astGrepRewrite` 输入 */
export const AstGrepRewriteInput = Schema.Struct({
  /** 目标文件路径（绝对路径或相对工作区根） */
  filePath: TrimmedNonEmptyString,
  /** 目标语言 */
  language: AstGrepLanguage,
  /** 匹配模式 */
  pattern: TrimmedNonEmptyString,
  /** 替换模板（支持 `$NAME` / `$$$BODY` 透传） */
  rewrite: TrimmedNonEmptyString,
  /** 是否仅预览不落盘（默认 false）
   *
   * - `true`：仅返回 `newContent`，不写盘，由调用方决定是否落盘
   * - `false` / `undefined`：替换后直接写回文件（旧行为）
   */
  dryRun: Schema.optional(Schema.Boolean),
});
export type AstGrepRewriteInput = typeof AstGrepRewriteInput.Type;

/** 单次替换位置 */
export const AstGrepRewriteLocation = Schema.Struct({
  file: TrimmedNonEmptyString,
  line: Schema.Number,
  column: Schema.Number,
});
export type AstGrepRewriteLocation = typeof AstGrepRewriteLocation.Type;

/** 替换结果 */
export const AstGrepRewriteResult = Schema.Struct({
  /** 替换后的完整内容 */
  newContent: Schema.String,
  /** 实际替换的次数 */
  replacements: Schema.Number,
  /** 命中的位置（file:line:column）— 用于 UI 展示 */
  matchLocations: Schema.Array(AstGrepRewriteLocation),
});
export type AstGrepRewriteResult = typeof AstGrepRewriteResult.Type;
