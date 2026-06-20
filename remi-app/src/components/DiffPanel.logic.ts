/**
 * @file DiffPanel.logic.ts
 * @description 差异面板的线程上下文解析逻辑，在服务端线程和本地草稿线程之间
 *              统一推导差异面板应使用的线程上下文。
 */

import { DEFAULT_MODEL_BY_PROVIDER, type ModelSelection, type ThreadId } from "~/contracts";

import type { DraftThreadState } from "../composerDraftStore";
import type { Thread } from "../types";
import { buildLocalDraftThread } from "./ChatView.logic";

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
