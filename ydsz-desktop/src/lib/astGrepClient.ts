/**
 * @file AST-Grep 客户端（双路径：Tauri 命令 + WebSocket）
 *
 * 包装 6 个 AST-Grep RPC（`indexer.astGrep*`），对上层（Composer / 设置 / Diff 工具）
 * 暴露一个统一的 Promise 接口：
 *
 * - **Tauri 模式**（`window.nativeApi` 存在）：直接走
 *   `indexer_ast_grep_search` / `indexer_ast_grep_rewrite` / `indexer_ast_grep_compile`
 *   等 Tauri 命令（无需 WebSocket 往返，单次 IPC 即可）。
 * - **WebSocket 模式**（`window.nativeApi` 不存在）：走
 *   `readNativeApi().indexer.*`，由 `wsNativeApi.ts` 代理为
 *   `indexer.astGrep*` WebSocket RPC。
 *
 * ## 使用场景
 *
 * - `useComposerAstGrepSearch` 在 Composer 中输入 `@ast-grep<pattern>` 时调用
 *   `searchAstGrep`（自动选择 pattern / node-kind / calls-to 模式）
 * - 设置页 / Diff 工具中调用 `compileAstGrepPattern` / `astGrepRewrite`
 *
 * ## 失败语义
 *
 * - 输入为空 / workspaceRoot 为空 → 返回 `[]`（**不**抛错）
 * - Tauri 命令不存在（开发环境某些情形）→ 静默回退到 WS 路径
 * - WS 路径也失败 → 抛出错误，让上层 hook 把它转成 `ast-grep-empty:error` 占位
 */

import { readNativeApi } from "../nativeApi";
import type {
  AstGrepCompilePatternInput,
  AstGrepCompiledPattern,
  AstGrepFindByNameInput,
  AstGrepFindByNodeKindInput,
  AstGrepFindByQueryInput,
  AstGrepListPresetsInput,
  AstGrepMatch,
  AstGrepPresetInfo,
  AstGrepRewriteInput,
  AstGrepRewriteResult,
} from "~/contracts";

// ===========================================================================
// 探测运行时：是否有 Tauri 直接命令桥
// ===========================================================================

/**
 * 探测 Tauri 桥接是否暴露 `indexer_ast_grep_*` 命令。
 *
 * `window.__TAURI_INTERNALS__` 是 Tauri 2.x 的内部 IPC 标记；
 * `isTauri` 在 `~/env` 中提供。
 * 这里只检查"是否有 Tauri 运行时"——具体命令存在与否由 Tauri 端在
 * `lib.rs` 的 `invoke_handler` 中注册。
 */
function hasTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  // Tauri 2.x: `__TAURI_INTERNALS__` 全局对象
  // Tauri 1.x: `__TAURI__` 全局对象
  return Boolean(
    (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ ??
      (window as { __TAURI__?: unknown }).__TAURI__,
  );
}

// ===========================================================================
// Tauri 命令 path（仅在 Tauri 运行时使用）
// ===========================================================================

interface TauriInvokeModule {
  invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
}

let tauriModulePromise: Promise<TauriInvokeModule | null> | null = null;

async function loadTauriInvoke(): Promise<TauriInvokeModule | null> {
  if (tauriModulePromise) return tauriModulePromise;
  tauriModulePromise = (async () => {
    try {
      // 动态 import：浏览器端不会打包 `@tauri-apps/api/core`，
      // 但 TS 编译期需要类型。
      const mod = await import("@tauri-apps/api/core");
      return mod as TauriInvokeModule;
    } catch {
      return null;
    }
  })();
  return tauriModulePromise;
}

/** 旧版 Tauri 命令的 MatchResult（仅含 Composer 关注的字段） */
interface TauriMatchResult {
  file: string;
  line: number;
  column: number;
  start_byte: number;
  end_byte: number;
  text: string;
  node_kind: string;
  /** S-expression 查询的捕获：name → text（直接用键值对） */
  captures: Record<string, string>;
}

interface TauriAstGrepSearchRequest {
  workspaceRoot: string;
  mode: "node_kind" | "pattern" | "calls_to" | "references" | "preset";
  kind?: string;
  pattern?: string;
  name?: string;
}

interface TauriRewriteResult {
  new_content: string;
  replacements: number;
  match_locations: { file: string; line: number; column: number }[];
}

interface TauriCompileResult {
  s_expression: string;
  captures: string[];
}

/** 把 Tauri MatchResult 转换为 contracts AstGrepMatch */
function mapTauriMatch(m: TauriMatchResult): AstGrepMatch {
  const captures = Object.entries(m.captures ?? {}).map(([name, text]) => ({ name, text }));
  return {
    file: m.file,
    line: m.line,
    column: m.column,
    startByte: m.start_byte,
    endByte: m.end_byte,
    text: m.text,
    nodeKind: m.node_kind,
    captures,
  };
}

/** 把 Tauri RewriteResult 转换为 contracts AstGrepRewriteResult */
function mapTauriRewrite(r: TauriRewriteResult): AstGrepRewriteResult {
  return {
    newContent: r.new_content,
    replacements: r.replacements,
    matchLocations: r.match_locations.map((loc) => ({
      file: loc.file,
      line: loc.line,
      column: loc.column,
    })),
  };
}

// ===========================================================================
// 公开 API：find_by_node_kind
// ===========================================================================

/**
 * 按节点类型搜索（如 `try_statement` / `call_expression`）。
 *
 * @param input.workspaceRoot - 工作区根目录
 * @param input.kind - 节点类型字符串
 * @returns 匹配命中列表（无匹配时为空数组）
 */
export async function astGrepFindByNodeKind(
  input: AstGrepFindByNodeKindInput,
): Promise<ReadonlyArray<AstGrepMatch>> {
  if (!input.workspaceRoot || !input.kind) return [];

  if (hasTauriRuntime()) {
    const tauri = await loadTauriInvoke();
    if (tauri) {
      const request: TauriAstGrepSearchRequest = {
        workspaceRoot: input.workspaceRoot,
        mode: "node_kind",
        kind: input.kind,
      };
      const raw = await tauri.invoke<TauriMatchResult[]>("indexer_ast_grep_search", { request });
      return raw.map(mapTauriMatch);
    }
  }

  const api = readNativeApi();
  if (!api?.indexer?.astGrepFindByNodeKind) {
    throw new Error("AST-Grep 节点搜索不可用：未找到 indexer.astGrepFindByNodeKind 实现");
  }
  return api.indexer.astGrepFindByNodeKind(input);
}

// ===========================================================================
// 公开 API：find_by_query（S-expression）
// ===========================================================================

/**
 * 按 tree-sitter S-expression 查询搜索。
 *
 * @param input.workspaceRoot - 工作区根目录
 * @param input.language - 目标语言
 * @param input.query - S-expression 查询字符串
 */
export async function astGrepFindByQuery(
  input: AstGrepFindByQueryInput,
): Promise<ReadonlyArray<AstGrepMatch>> {
  if (!input.workspaceRoot || !input.query) return [];

  if (hasTauriRuntime()) {
    const tauri = await loadTauriInvoke();
    if (tauri) {
      // Tauri 端没有直接的 query 模式入口，但 pattern 模式会先编译再搜索，
      // 行为等价（pattern 模式内部走 ts 语言 + 编译）；
      // 调用方应使用 compilePattern + findByQuery 自行拆分。
      // 此处仅作为兜底，使用 pattern 模式转发。
      const request: TauriAstGrepSearchRequest = {
        workspaceRoot: input.workspaceRoot,
        mode: "pattern",
        pattern: input.query,
      };
      const raw = await tauri.invoke<TauriMatchResult[]>("indexer_ast_grep_search", { request });
      return raw.map(mapTauriMatch);
    }
  }

  const api = readNativeApi();
  if (!api?.indexer?.astGrepFindByQuery) {
    throw new Error("AST-Grep 查询搜索不可用：未找到 indexer.astGrepFindByQuery 实现");
  }
  return api.indexer.astGrepFindByQuery(input);
}

// ===========================================================================
// 公开 API：find_by_name（references / calls_to）
// ===========================================================================

/**
 * 按名称查找引用或调用。
 *
 * - `mode = "calls"` → 找 `name(...)` 形式调用
 * - `mode = "references"` → 找所有 `name` 标识符出现位置
 */
export async function astGrepFindByName(
  input: AstGrepFindByNameInput,
): Promise<ReadonlyArray<AstGrepMatch>> {
  if (!input.workspaceRoot || !input.name) return [];

  const mode = input.mode ?? "calls";
  // 把默认值显式回填到入参，确保上层 API 与 Tauri 端收到的 mode 一致
  const resolvedInput: AstGrepFindByNameInput = { ...input, mode };

  if (hasTauriRuntime()) {
    const tauri = await loadTauriInvoke();
    if (tauri) {
      const request: TauriAstGrepSearchRequest = {
        workspaceRoot: input.workspaceRoot,
        mode: mode === "calls" ? "calls_to" : "references",
        name: input.name,
      };
      const raw = await tauri.invoke<TauriMatchResult[]>("indexer_ast_grep_search", { request });
      return raw.map(mapTauriMatch);
    }
  }

  const api = readNativeApi();
  if (!api?.indexer?.astGrepFindByName) {
    throw new Error("AST-Grep 名称搜索不可用：未找到 indexer.astGrepFindByName 实现");
  }
  return api.indexer.astGrepFindByName(resolvedInput);
}

// ===========================================================================
// 公开 API：list_presets
// ===========================================================================

/**
 * 列出 AST-Grep 预设模式。
 *
 * - `language` 提供时，仅返回支持该语言的 preset
 * - `language` 缺省时，返回所有 preset
 */
export async function astGrepListPresets(
  input?: AstGrepListPresetsInput,
): Promise<ReadonlyArray<AstGrepPresetInfo>> {
  const language = input?.language;

  // Tauri 端没有 list_presets 命令，直接走 WS 路径
  const api = readNativeApi();
  if (!api?.indexer?.astGrepListPresets) {
    throw new Error("AST-Grep 预设列表不可用：未找到 indexer.astGrepListPresets 实现");
  }
  return api.indexer.astGrepListPresets(language ? { language } : {});
}

// ===========================================================================
// 公开 API：compile_pattern
// ===========================================================================

/**
 * 把用户友好的模式（如 `console.log($MSG)`）编译为 tree-sitter S-expression。
 */
export async function compileAstGrepPattern(
  input: AstGrepCompilePatternInput,
): Promise<AstGrepCompiledPattern> {
  if (!input.pattern) {
    return { query: "", captures: [] };
  }

  if (hasTauriRuntime()) {
    const tauri = await loadTauriInvoke();
    if (tauri) {
      const raw = await tauri.invoke<TauriCompileResult>("indexer_ast_grep_compile", {
        pattern: input.pattern,
        language: input.language,
      });
      return { query: raw.s_expression, captures: raw.captures };
    }
  }

  const api = readNativeApi();
  if (!api?.indexer?.astGrepCompilePattern) {
    throw new Error("AST-Grep 模式编译不可用：未找到 indexer.astGrepCompilePattern 实现");
  }
  return api.indexer.astGrepCompilePattern(input);
}

// ===========================================================================
// 公开 API：rewrite（结构化替换）
// ===========================================================================

/**
 * 在指定文件中按模式做结构性替换（批量）。
 *
 * 模板中的 `$NAME` / `$$$BODY` 会从原匹配节点的 capture 中取值。
 */
export async function astGrepRewrite(
  input: AstGrepRewriteInput,
): Promise<AstGrepRewriteResult> {
  if (!input.filePath || !input.pattern || !input.rewrite) {
    return { newContent: "", replacements: 0, matchLocations: [] };
  }

  if (hasTauriRuntime()) {
    const tauri = await loadTauriInvoke();
    if (tauri) {
      // Tauri 命令路径默认不落盘（语义与 dryRun=true 等价），
      // dryRun 参数仅对 WS 路径生效，这里透传以保持契约一致。
      const raw = await tauri.invoke<TauriRewriteResult>("indexer_ast_grep_rewrite", {
        filePath: input.filePath,
        pattern: input.pattern,
        rewrite: input.rewrite,
        language: input.language,
        dryRun: input.dryRun,
      });
      return mapTauriRewrite(raw);
    }
  }

  const api = readNativeApi();
  if (!api?.indexer?.astGrepRewrite) {
    throw new Error("AST-Grep 重写不可用：未找到 indexer.astGrepRewrite 实现");
  }
  return api.indexer.astGrepRewrite(input);
}

// ===========================================================================
// 统一入口：searchAstGrep（合并 4 种模式，Composer 列表用）
// ===========================================================================

/** 搜索模式：`pattern` / `node-kind` / `calls-to` / `references` */
export type AstGrepSearchMode = "pattern" | "node-kind" | "calls-to" | "references";

/** 统一搜索输入 */
export interface AstGrepSearchInput {
  workspaceRoot: string;
  /** 模式 */
  mode: AstGrepSearchMode;
  /** 各模式对应的查询内容：
   *  - `pattern` → 用户友好模式字符串
   *  - `node-kind` → 节点类型
   *  - `calls-to` / `references` → 标识符名（支持 `"obj.name"` 形式） */
  query: string;
}

/**
 * 统一 AST-Grep 搜索入口。
 *
 * 根据 `mode` 自动选择对应的 find 函数。Composer 的 `@ast-grep` 触发器
 * 内部用此函数屏蔽模式差异。
 */
export async function searchAstGrep(
  input: AstGrepSearchInput,
): Promise<ReadonlyArray<AstGrepMatch>> {
  if (!input.workspaceRoot || !input.query) return [];

  switch (input.mode) {
    case "node-kind":
      return astGrepFindByNodeKind({
        workspaceRoot: input.workspaceRoot,
        kind: input.query,
      });
    case "calls-to":
      return astGrepFindByName({
        workspaceRoot: input.workspaceRoot,
        name: input.query,
        mode: "calls",
      });
    case "references":
      return astGrepFindByName({
        workspaceRoot: input.workspaceRoot,
        name: input.query,
        mode: "references",
      });
    case "pattern":
    default:
      // pattern 模式：先编译再 query。
      // 这里走 WS 的 compile + find_by_query 双步路径；Tauri 端会自己编译。
      const compiled = await compileAstGrepPattern({
        language: "typescript", // 默认 TS：覆盖 TS/TSX/JS
        pattern: input.query,
      });
      if (!compiled.query) {
        // 编译失败时回退到 node_kind 兜底
        return astGrepFindByNodeKind({
          workspaceRoot: input.workspaceRoot,
          kind: input.query,
        });
      }
      return astGrepFindByQuery({
        workspaceRoot: input.workspaceRoot,
        language: "typescript",
        query: compiled.query,
      });
  }
}
