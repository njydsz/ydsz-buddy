/**
 * @file 消息撤回 Hook
 *
 * 实现用户消息撤回功能：
 * - 发送后 10s 内可撤回
 * - 撤回时同步取消已发出的 Turn（如果还没开始执行）
 * - 撤回后清空输入框，保留原文供重新编辑
 *
 * ## 核心功能
 *
 * - **倒计时**：10s 内显示撤回按钮
 * - **撤回操作**：取消 Turn + 删除消息
 * - **内容保留**：撤回后保留原文
 * - **状态同步**：通知后端取消任务
 *
 * ## 使用场景
 *
 * - 用户发送错误消息
 * - 快速修正输入
 * - 取消正在排队的任务
 *
 * ## 注意事项
 *
 * - 仅 10s 内可撤回
 * - 已开始执行的 Turn 无法完全撤回
 * - 撤回后保留原文供重新编辑
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { readNativeApi } from "~/nativeApi";
import type { ThreadId, TurnId } from "~/contracts";

interface UseMessageRetractOptions {
  /** 线程 ID */
  threadId: ThreadId | null;
  /** 撤回时限（毫秒） */
  retractWindowMs?: number;
}

interface UseMessageRetractResult {
  /** 是否可撤回 */
  canRetract: boolean;
  /** 剩余时间（秒） */
  remainingSeconds: number;
  /** 撤回的消息内容 */
  retractedContent: string | null;
  /** 执行撤回 */
  retract: () => Promise<void>;
  /** 取消撤回（倒计时结束） */
  cancelRetract: () => void;
  /** 记录发送的消息 */
  recordSentMessage: (turnId: TurnId, content: string) => void;
}

/**
 * 消息撤回 Hook
 */
export function useMessageRetract(
  options: UseMessageRetractOptions,
): UseMessageRetractResult {
  const { threadId, retractWindowMs = 10000 } = options;

  const [canRetract, setCanRetract] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [retractedContent, setRetractedContent] = useState<string | null>(null);
  // 使用 state 跟踪当前 turnId 以触发 useEffect 重新订阅,
  // 避免 ref 变化不触发 effect 的陷阱。
  const [activeTurnId, setActiveTurnId] = useState<TurnId | null>(null);

  const currentTurnRef = useRef<{ turnId: TurnId; content: string; sentAt: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const api = readNativeApi();

  // 记录发送的消息
  const recordSentMessage = useCallback((turnId: TurnId, content: string) => {
    currentTurnRef.current = {
      turnId,
      content,
      sentAt: Date.now(),
    };
    setActiveTurnId(turnId);
    setCanRetract(true);
    setRemainingSeconds(Math.ceil(retractWindowMs / 1000));

    // 启动倒计时
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - (currentTurnRef.current?.sentAt ?? 0);
      const remaining = Math.max(0, retractWindowMs - elapsed);
      const remainingSecs = Math.ceil(remaining / 1000);

      setRemainingSeconds(remainingSecs);

      if (remaining <= 0) {
        setCanRetract(false);
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      }
    }, 100);
  }, [retractWindowMs]);

  // 执行撤回
  const retract = useCallback(async () => {
    if (!currentTurnRef.current || !threadId) return;

    const { turnId, content } = currentTurnRef.current;

    try {
      // 通知后端取消 Turn
      await invoke("turn_cancel", { threadId, turnId });

      // 删除本地消息
      if (api?.threads?.deleteMessage) {
        await api.threads.deleteMessage(threadId, turnId);
      }

      // 保留内容供重新编辑
      setRetractedContent(content);
      setCanRetract(false);
      setActiveTurnId(null);

      // 清理计时器
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      currentTurnRef.current = null;
    } catch (error) {
      console.error("Failed to retract message:", error);
      throw error;
    }
  }, [threadId, api]);

  // 取消撤回（倒计时结束）
  const cancelRetract = useCallback(() => {
    setCanRetract(false);
    setRetractedContent(null);
    setActiveTurnId(null);

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    currentTurnRef.current = null;
  }, []);

  // 监听 Turn 开始执行（一旦开始执行，不可撤回）
  useEffect(() => {
    if (!api || !threadId || !activeTurnId) return;

    const unsubscribe = api.orchestration.onDomainEvent((event) => {
      if (event.aggregateId !== threadId) return;

      // 如果 Turn 开始执行，取消撤回能力
      if (
        event.type === "thread.tool-call-started" ||
        event.type === "thread.turn-started"
      ) {
        const payload = event.payload as { turnId: TurnId };
        if (payload.turnId === activeTurnId) {
          setCanRetract(false);
          setActiveTurnId(null);
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
        }
      }
    });

    return unsubscribe;
  }, [api, threadId, activeTurnId]);

  // 清理
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  return {
    canRetract,
    remainingSeconds,
    retractedContent,
    retract,
    cancelRetract,
    recordSentMessage,
  };
}
