// FILE: DiffPanel.logic.ts
// Purpose: Resolve the thread context the diff panel should use across server-backed and local draft chats.
// Exports: resolveDiffPanelThread
// Depends on: ChatView.logic draft-thread normalization.

import { DEFAULT_MODEL_BY_PROVIDER, type ModelSelection, type ThreadId } from "~/contracts";

import type { DraftThreadState } from "../composerDraftStore";
import type { Thread } from "../types";
import { buildLocalDraftThread } from "./ChatView.logic";

/**
 * @file Diff 面板逻辑工具
 *
 * 解析 Diff 面板应该使用的 thread 上下文：
 *
 * - **服务端线程**：优先使用持久化 thread
 * - **草稿线程**：未持久化时回落到 draft
 *
 * ## 核心导出
 *
 * - `resolveDiffPanelThread`：根据 serverThread/draftThread 派生 `Thread` 视图模型
 *
 * ## 使用场景
 *
 * - DiffPanel 主组件
 *
 * ## 注意事项
 *
 * - 复用 `buildLocalDraftThread` 保证 ChatView 与 Diff 面板数据一致
 * - 没有 threadId / draftThread 时返回 undefined
 */
// Reuse the chat-view draft fallback so diff surfaces keep working before the first server turn exists.
export function resolveDiffPanelThread(input: {
  threadId: ThreadId | null | undefined;
  serverThread: Thread | undefined;
  draftThread: DraftThreadState | null | undefined;
  fallbackModelSelection: ModelSelection | null | undefined;
}): Thread | undefined {
  if (input.serverThread) {
    return input.serverThread;
  }
  if (!input.threadId || !input.draftThread) {
    return undefined;
  }

  return buildLocalDraftThread(
    input.threadId,
    input.draftThread,
    input.fallbackModelSelection ?? {
      provider: "codex",
      model: DEFAULT_MODEL_BY_PROVIDER.codex,
    },
    null,
  );
}
