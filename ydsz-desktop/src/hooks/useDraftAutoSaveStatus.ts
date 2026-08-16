/**
 * @file useDraftAutoSaveStatus
 *
 * 监听当前 Composer 草稿状态，输出"自动保存"语义化状态。
 *
 * ## 设计
 *
 * - **节流**：草稿写入 1s 内不重复触发状态变化
 * - **3 态**：`idle` (无内容) / `saved` (X 秒前保存) / `saving` (正在节流窗口)
 * - **去抖**：用 useRef 保存上次更新时间，避免 useEffect 重入
 * - **多线程安全**：依赖 threadId + prompt 重新订阅
 *
 * ## 使用
 *
 * ```ts
 * const { status, lastSavedAt, ageMs } = useDraftAutoSaveStatus({
 *   threadId,
 *   prompt,
 *   debounceMs: 1_000,
 * });
 *
 * // status === "idle" → 隐藏
 * // status === "saving" → 显示 spinner
 * // status === "saved"  → 显示 "草稿已保存 · 5s 前"
 * ```
 *
 * ## 注意事项
 *
 * - 该 hook 只做"展示用"状态，不参与真实写入（写入由 composerDraftStore 负责）
 * - SSR 友好：window 不可用时返回 idle
 */

import { useEffect, useRef, useState } from "react";
import type { ThreadId } from "~/contracts";

export type DraftAutoSaveStatus = "idle" | "saving" | "saved";

export interface UseDraftAutoSaveStatusInput {
  /** 当前线程 ID（用于隔离状态） */
  threadId: ThreadId | null | undefined;
  /** 当前草稿内容（任意非空字符串都视为有内容） */
  prompt: string | null | undefined;
  /** 节流窗口，1s 内多次 prompt 变化只触发一次 "saving" */
  debounceMs?: number;
  /** 重新空闲后多久回落到 idle（默认 30s） */
  idleAfterMs?: number;
}

export interface UseDraftAutoSaveStatusResult {
  status: DraftAutoSaveStatus;
  lastSavedAt: number | null;
  ageMs: number;
}

const DEFAULT_DEBOUNCE_MS = 1_000;
const DEFAULT_IDLE_AFTER_MS = 30_000;

export function useDraftAutoSaveStatus(
  input: UseDraftAutoSaveStatusInput,
): UseDraftAutoSaveStatusResult {
  const {
    threadId,
    prompt,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    idleAfterMs = DEFAULT_IDLE_AFTER_MS,
  } = input;

  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [pending, setPending] = useState<boolean>(false);
  const [now, setNow] = useState<number>(() => Date.now());
  const timerRef = useRef<number | null>(null);
  const prevThreadIdRef = useRef<ThreadId | null | undefined>(threadId);

  // 草稿变化 → 标记 pending，节流结束后标 saved
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!threadId) return;
    const hasContent = typeof prompt === "string" && prompt.length > 0;

    // 线程切换：清空旧时间戳
    if (prevThreadIdRef.current !== threadId) {
      prevThreadIdRef.current = threadId;
      setLastSavedAt(null);
      setPending(false);
      return;
    }

    if (!hasContent) {
      setLastSavedAt(null);
      setPending(false);
      return;
    }

    // 标记 saving（节流窗口内）
    setPending(true);
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      setLastSavedAt(Date.now());
      setPending(false);
      timerRef.current = null;
    }, debounceMs);

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [threadId, prompt, debounceMs]);

  // 1s tick：刷新 ageMs
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (lastSavedAt === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, [lastSavedAt]);

  // 长时间未变 → 回落 idle
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (lastSavedAt === null) return;
    if (now - lastSavedAt < idleAfterMs) return;
    // 超出 idle 窗口不清空 lastSavedAt，只把 status 降为 idle
    // 这样重新有变化时仍能立即显示 saving
  }, [idleAfterMs, lastSavedAt, now]);

  const ageMs = lastSavedAt === null ? 0 : Math.max(0, now - lastSavedAt);
  let status: DraftAutoSaveStatus = "idle";
  if (pending) {
    status = "saving";
  } else if (lastSavedAt !== null) {
    if (ageMs < idleAfterMs) {
      status = "saved";
    } else {
      status = "idle";
    }
  }

  return { status, lastSavedAt, ageMs };
}
