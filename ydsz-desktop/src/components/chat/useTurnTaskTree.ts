/**
 * @file 任务树数据订阅 Hook
 *
 * 本 Hook 订阅当前 Turn 的任务执行状态，构建三级任务树：
 *
 * - **一级任务**：父任务（用户发起的主要任务）
 * - **二级任务**：子任务（AI 分解的子步骤）
 * - **三级任务**：孙任务（子任务的细化步骤）
 *
 * ## 核心导出
 *
 * - `useTurnTaskTree`：任务树数据订阅 hook
 * - `TaskTreeNode`：任务树节点类型
 *
 * ## 使用场景
 *
 * - TaskSidebar 组件
 * - 任务执行可视化
 *
 * ## 注意事项
 *
 * - 订阅 `onDomainEvent` 监听任务状态变更
 * - 自动过滤已完成任务（可选）
 * - 支持点击跳转到对应消息
 */

import { useState, useEffect, useMemo } from "react";
import { readNativeApi } from "~/nativeApi";

/**
 * 任务树节点类型
 */
export interface TaskTreeNode {
  /** 任务 ID */
  id: string;
  /** 任务标题 */
  title: string;
  /** 任务状态 */
  status: "pending" | "inProgress" | "completed" | "failed";
  /** 子任务列表 */
  children?: TaskTreeNode[];
  /** 关联的消息 ID（用于点击跳转） */
  messageId?: string;
  /** 任务开始时间 */
  startedAt?: string;
  /** 任务完成时间 */
  completedAt?: string;
}

/**
 * 任务树数据订阅 Hook
 *
 * 订阅当前 Turn 的任务执行状态，构建三级任务树。
 *
 * @param threadId - 当前线程 ID
 * @returns 任务树节点数组
 */
export function useTurnTaskTree(threadId: string | undefined): TaskTreeNode[] {
  const [taskTree, setTaskTree] = useState<TaskTreeNode[]>([]);

  useEffect(() => {
    if (!threadId) return;

    const api = readNativeApi();
    if (!api) return;

    const unsubscribe = api.orchestration.onDomainEvent((event) => {
      const eventType = event.type as string;
      const payload = event.payload as Record<string, unknown> | undefined;

      // 监听任务创建事件
      if (eventType === "thread.task-created" && payload) {
        const taskId = payload.taskId as string | undefined;
        const title = payload.title as string | undefined;
        const parentTaskId = payload.parentTaskId as string | undefined;
        const messageId = payload.messageId as string | undefined;

        if (!taskId || !title) return;

        setTaskTree((prev) => {
          const newTask: TaskTreeNode = {
            id: taskId,
            title,
            status: "pending",
            messageId,
            startedAt: new Date().toISOString(),
          };

          // 如果有父任务，添加到父任务的 children
          if (parentTaskId) {
            return prev.map((task) => {
              if (task.id === parentTaskId) {
                return {
                  ...task,
                  children: [...(task.children || []), newTask],
                };
              }
              // 递归查找二级任务的子任务
              if (task.children) {
                return {
                  ...task,
                  children: task.children.map((child) => {
                    if (child.id === parentTaskId) {
                      return {
                        ...child,
                        children: [...(child.children || []), newTask],
                      };
                    }
                    return child;
                  }),
                };
              }
              return task;
            });
          }

          // 否则添加到根级别
          return [...prev, newTask];
        });
      }

      // 监听任务状态变更事件
      if (eventType === "thread.task-status-changed" && payload) {
        const taskId = payload.taskId as string | undefined;
        const status = payload.status as
          | "pending"
          | "inProgress"
          | "completed"
          | "failed"
          | undefined;

        if (!taskId || !status) return;

        setTaskTree((prev) => {
          const updateTaskStatus = (tasks: TaskTreeNode[]): TaskTreeNode[] => {
            return tasks.map((task) => {
              if (task.id === taskId) {
                return {
                  ...task,
                  status,
                  completedAt:
                    status === "completed" || status === "failed"
                      ? new Date().toISOString()
                      : undefined,
                };
              }
              if (task.children) {
                return {
                  ...task,
                  children: updateTaskStatus(task.children),
                };
              }
              return task;
            });
          };
          return updateTaskStatus(prev);
        });
      }

      // 监听任务删除事件
      if (eventType === "thread.task-deleted" && payload) {
        const taskId = payload.taskId as string | undefined;
        if (!taskId) return;

        setTaskTree((prev) => {
          const removeTask = (tasks: TaskTreeNode[]): TaskTreeNode[] => {
            return tasks
              .filter((task) => task.id !== taskId)
              .map((task) => ({
                ...task,
                children: task.children ? removeTask(task.children) : undefined,
              }));
          };
          return removeTask(prev);
        });
      }
    });

    return unsubscribe;
  }, [threadId]);

  // 自动清理已完成的任务（可选）
  const filteredTaskTree = useMemo(() => {
    // 保留所有任务，包括已完成的（用于审计追踪）
    return taskTree;
  }, [taskTree]);

  return filteredTaskTree;
}
