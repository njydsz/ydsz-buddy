/**
 * @file 撤销/重做 Hook
 *
 * 实现消息级撤销/重做：
 * - 支持 Cmd+Z / Cmd+Shift+Z
 * - 仅撤销用户消息（不撤销 AI 回复）
 * - 撤销后清空对应 AI 回复
 * - 重做恢复最后一条用户消息
 *
 * ## 核心功能
 *
 * - **撤销栈**：记录用户操作历史
 * - **快捷键**：Cmd+Z 撤销，Cmd+Shift+Z 重做
 * - **消息级**：仅撤销用户消息
 * - **联动清空**：撤销用户消息时清空对应 AI 回复
 *
 * ## 使用场景
 *
 * - 误发消息
 * - 重新提问
 * - 快速修正
 *
 * ## 注意事项
 *
 * - 仅支持用户消息撤销
 * - AI 回复不进入撤销栈
 * - 撤销后对应 AI 回复被清空
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { readNativeApi } from "~/nativeApi";
import type { ThreadId, MessageId, TurnId } from "~/contracts";

interface UndoEntry {
  /** 消息 ID */
  messageId: MessageId;
  /** 消息内容 */
  content: string;
  /** 时间戳 */
  timestamp: number;
  /** 对应的 AI 回复 ID */
  aiReplyId?: MessageId;
}

interface UseUndoRedoOptions {
  /** 线程 ID */
  threadId: ThreadId | null;
  /** 最大历史记录数 */
  maxHistory?: number;
}

interface UseUndoRedoResult {
  /** 是否可撤销 */
  canUndo: boolean;
  /** 是否可重做 */
  canRedo: boolean;
  /** 执行撤销 */
  undo: () => Promise<void>;
  /** 执行重做 */
  redo: () => Promise<void>;
  /** 记录用户消息 */
  recordUserMessage: (messageId: MessageId, content: string, aiReplyId?: MessageId) => void;
  /** 清空历史 */
  clearHistory: () => void;
}

/**
 * 撤销/重做 Hook
 */
export function useUndoRedo(options: UseUndoRedoOptions): UseUndoRedoResult {
  const { threadId, maxHistory = 50 } = options;

  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [redoStack, setRedoStack] = useState<UndoEntry[]>([]);

  const api = readNativeApi();
  const isUndoRedoingRef = useRef(false);

  // 记录用户消息
  const recordUserMessage = useCallback(
    (messageId: MessageId, content: string, aiReplyId?: MessageId) => {
      setUndoStack((prev) => {
        const next = [
          ...prev,
          {
            messageId,
            content,
            timestamp: Date.now(),
            aiReplyId,
          },
        ];
        // 限制历史记录数量
        return next.slice(-maxHistory);
      });
      // 新操作清空重做栈
      setRedoStack([]);
    },
    [maxHistory],
  );

  // 执行撤销
  const undo = useCallback(async () => {
    if (!api || !threadId || undoStack.length === 0 || isUndoRedoingRef.current) return;

    isUndoRedoingRef.current = true;

    try {
      const lastEntry = undoStack[undoStack.length - 1];

      // 删除用户消息
      await api.threads.deleteMessage(threadId, lastEntry.messageId as unknown as TurnId);

      // 如果有对应的 AI 回复，也删除
      if (lastEntry.aiReplyId) {
        await api.threads.deleteMessage(threadId, lastEntry.aiReplyId as unknown as TurnId);
      }

      // 更新栈
      setUndoStack((prev) => prev.slice(0, -1));
      setRedoStack((prev) => [lastEntry, ...prev]);
    } catch (error) {
      console.error("Failed to undo:", error);
    } finally {
      isUndoRedoingRef.current = false;
    }
  }, [api, threadId, undoStack]);

  // 执行重做
  const redo = useCallback(async () => {
    if (!api || !threadId || redoStack.length === 0 || isUndoRedoingRef.current) return;

    isUndoRedoingRef.current = true;

    try {
      const lastEntry = redoStack[0];

      // 重新发送消息（调用 sendTurn）
      await api.threads.sendTurn({
        threadId,
        content: lastEntry.content,
      });

      // 更新栈
      setRedoStack((prev) => prev.slice(1));
      setUndoStack((prev) => [...prev, lastEntry]);
    } catch (error) {
      console.error("Failed to redo:", error);
    } finally {
      isUndoRedoingRef.current = false;
    }
  }, [api, threadId, redoStack]);

  // 清空历史
  const clearHistory = useCallback(() => {
    setUndoStack([]);
    setRedoStack([]);
  }, []);

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+Z 或 Ctrl+Z
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        void undo();
      }
      // Cmd+Shift+Z 或 Ctrl+Shift+Z
      else if ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        void redo();
      }
      // Cmd+Y 或 Ctrl+Y（Windows 常用重做快捷键）
      else if ((e.metaKey || e.ctrlKey) && e.key === "y") {
        e.preventDefault();
        void redo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  return {
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    undo,
    redo,
    recordUserMessage,
    clearHistory,
  };
}
