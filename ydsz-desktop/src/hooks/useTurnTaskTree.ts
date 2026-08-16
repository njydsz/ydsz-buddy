/**
 * @file 任务树 Hook
 * @description 订阅事件流构建 3 级任务树
 *
 * 数据结构：
 * - 根任务（Turn）
 *   - 子任务（工具调用）
 *     - 子子任务（文件操作等）
 *
 * 事件映射：
 * - thread.turn-started → 根任务
 * - thread.tool-call-started → 子任务
 * - thread.file-read/written → 子子任务
 */

import { useEffect, useState } from "react";
import { readNativeApi } from "~/nativeApi";
import type { OrchestrationEvent, ThreadId } from "~/contracts";

/** 任务节点 */
export interface TaskNode {
  /** 唯一标识 */
  id: string;
  /** 任务类型 */
  type: "turn" | "tool-call" | "file-operation";
  /** 任务标签 */
  label: string;
  /** 状态 */
  status: "running" | "completed" | "failed";
  /** 开始时间 */
  startTime: number;
  /** 结束时间 */
  endTime?: number;
  /** 子任务 */
  children: TaskNode[];
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 从事件中提取任务节点
 */
function extractTaskNode(event: OrchestrationEvent): TaskNode | null {
  const payload = event.payload as Record<string, unknown>;
  const type = event.type;

  switch (type) {
    case "thread.turn-started": {
      const turnId = payload.turnId as string;
      return {
        id: `turn:${turnId}`,
        type: "turn",
        label: `Turn ${turnId.slice(0, 8)}`,
        status: "running",
        startTime: Date.now(),
        children: [],
        metadata: { turnId },
      };
    }
    case "thread.tool-call-started": {
      const toolCallId = payload.toolCallId as string;
      const toolName = payload.toolName as string;
      return {
        id: `tool:${toolCallId}`,
        type: "tool-call",
        label: toolName,
        status: "running",
        startTime: Date.now(),
        children: [],
        metadata: { toolCallId, toolName },
      };
    }
    case "thread.file-read":
    case "thread.file-written": {
      const filePath = payload.path as string;
      const operation = type === "thread.file-read" ? "读取" : "写入";
      return {
        id: `file:${event.sequence}`,
        type: "file-operation",
        label: `${operation} ${filePath.split("/").pop()}`,
        status: "completed",
        startTime: Date.now(),
        endTime: Date.now(),
        children: [],
        metadata: { path: filePath, operation },
      };
    }
    case "thread.tool-call-completed": {
      const toolCallId = payload.toolCallId as string;
      return {
        id: `tool:${toolCallId}`,
        type: "tool-call",
        label: "",
        status: "completed",
        startTime: 0,
        endTime: Date.now(),
        children: [],
      };
    }
    case "thread.turn-completed": {
      const turnId = payload.turnId as string;
      return {
        id: `turn:${turnId}`,
        type: "turn",
        label: "",
        status: "completed",
        startTime: 0,
        endTime: Date.now(),
        children: [],
      };
    }
    case "thread.turn-failed": {
      const turnId = payload.turnId as string;
      return {
        id: `turn:${turnId}`,
        type: "turn",
        label: "",
        status: "failed",
        startTime: 0,
        endTime: Date.now(),
        children: [],
      };
    }
    default:
      return null;
  }
}

/**
 * 任务树 Hook
 * @param threadId - 线程 ID
 * @param enabled - 是否启用
 */
export function useTurnTaskTree(threadId: ThreadId, enabled: boolean = true) {
  const [taskTree, setTaskTree] = useState<TaskNode[]>([]);
  const [currentTurnId, setCurrentTurnId] = useState<string | null>(null);
  const [currentToolCallId, setCurrentToolCallId] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setTaskTree([]);
      return;
    }

    const api = readNativeApi();
    if (!api) return;

    const unsubscribe = api.orchestration.onDomainEvent((event) => {
      if (event.aggregateId !== threadId) return;

      const node = extractTaskNode(event);
      if (!node) return;

      setTaskTree((prev) => {
        const next = [...prev];

        if (node.type === "turn") {
          if (node.status === "running") {
            // 新增根任务
            setCurrentTurnId(node.id);
            next.push(node);
          } else {
            // 更新根任务状态
            const index = next.findIndex((t) => t.id === node.id);
            if (index !== -1) {
              next[index] = { ...next[index], status: node.status, endTime: node.endTime };
            }
            setCurrentTurnId(null);
          }
        } else if (node.type === "tool-call") {
          const turnIndex = next.findIndex((t) => t.id === currentTurnId);
          if (turnIndex !== -1) {
            if (node.status === "running") {
              // 新增子任务
              setCurrentToolCallId(node.id);
              next[turnIndex].children.push(node);
            } else {
              // 更新子任务状态
              const toolIndex = next[turnIndex].children.findIndex((t) => t.id === node.id);
              if (toolIndex !== -1) {
                next[turnIndex].children[toolIndex] = {
                  ...next[turnIndex].children[toolIndex],
                  status: node.status,
                  endTime: node.endTime,
                };
              }
              setCurrentToolCallId(null);
            }
          }
        } else if (node.type === "file-operation") {
          const turnIndex = next.findIndex((t) => t.id === currentTurnId);
          if (turnIndex !== -1) {
            const toolIndex = next[turnIndex].children.findIndex(
              (t) => t.id === currentToolCallId,
            );
            if (toolIndex !== -1) {
              // 添加到子子任务
              next[turnIndex].children[toolIndex].children.push(node);
            } else {
              // 直接添加到根任务
              next[turnIndex].children.push(node);
            }
          }
        }

        return next;
      });
    });

    return unsubscribe;
  }, [threadId, enabled, currentTurnId, currentToolCallId]);

  return taskTree;
}
