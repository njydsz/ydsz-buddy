/**
 * @file EventRouter 辅助函数
 *
 * 从 __root.tsx 中提取的纯函数,供 EventRouter 组件使用。
 * 这些函数不依赖 React hooks,可以独立测试。
 */

import {
  type OrchestrationEvent,
  ThreadId,
} from "@ydsz-buddy/contracts";
import { getThreadFromState } from "../threadDerivation";
import { useStore } from "../store";

/**
 * 合并连续的 thread.message-sent 事件,减少不必要的 UI 重渲染。
 *
 * 当同一消息的多个 streaming chunk 在同一 flush 周期内到达时,
 * 将它们合并为一个事件,避免逐字渲染导致的性能问题。
 */
export function coalesceOrchestrationUiEvents(
  events: ReadonlyArray<OrchestrationEvent>,
): OrchestrationEvent[] {
  if (events.length < 2) {
    return [...events];
  }

  const coalesced: OrchestrationEvent[] = [];
  for (const event of events) {
    const previous = coalesced.at(-1);
    if (
      previous?.type === "thread.message-sent" &&
      event.type === "thread.message-sent" &&
      previous.payload.threadId === event.payload.threadId &&
      previous.payload.messageId === event.payload.messageId
    ) {
      coalesced[coalesced.length - 1] = {
        ...event,
        payload: {
          ...event.payload,
          attachments: event.payload.attachments ?? previous.payload.attachments,
          createdAt: previous.payload.createdAt,
          text:
            !event.payload.streaming && event.payload.text.length > 0
              ? event.payload.text
              : previous.payload.text + event.payload.text,
        },
      };
      continue;
    }

    coalesced.push(event);
  }

  return coalesced;
}

/**
 * 判断是否需要立即 flush 某个 domain event（跳过节流）。
 *
 * assistant 消息的第一个 streaming chunk 需要立即 flush,
 * 以便 UI 尽快显示消息气泡,后续 chunk 走正常节流路径。
 */
export function shouldFlushDomainEventImmediately(
  event: OrchestrationEvent,
  immediatelyFlushedAssistantMessageIds: Set<string>,
): boolean {
  if (event.type !== "thread.message-sent" || event.payload.role !== "assistant") {
    return false;
  }

  if (!event.payload.streaming) {
    immediatelyFlushedAssistantMessageIds.delete(event.payload.messageId);
    return false;
  }

  if (immediatelyFlushedAssistantMessageIds.has(event.payload.messageId)) {
    return false;
  }

  immediatelyFlushedAssistantMessageIds.add(event.payload.messageId);
  return true;
}

/**
 * 判断事件是否属于指定线程的详情事件。
 *
 * 只有这些事件类型会影响线程详情视图的状态,
 * 其他事件（如 shell 级别的事件）不需要触发详情更新。
 */
export function isThreadDetailEventForThread(
  event: OrchestrationEvent,
  threadId: ThreadId,
): boolean {
  if (event.aggregateKind !== "thread" || event.aggregateId !== threadId) {
    return false;
  }
  return (
    event.type === "thread.message-sent" ||
    event.type === "thread.proposed-plan-upserted" ||
    event.type === "thread.activity-appended" ||
    event.type === "thread.turn-diff-completed" ||
    event.type === "thread.reverted" ||
    event.type === "thread.conversation.rolled-back" ||
    event.type === "thread.session-set" ||
    event.type === "thread.meta-updated" ||
    event.type === "thread.archived" ||
    event.type === "thread.unarchived"
  );
}

/**
 * 判断是否需要轮询线程详情 catch-up。
 *
 * 当线程的 session 或 latestTurn 处于 running 状态时,
 * 需要定期轮询以获取最新状态,防止 WebSocket 事件丢失。
 */
export function shouldPollThreadDetailCatchup(threadId: ThreadId): boolean {
  const thread = getThreadFromState(useStore.getState(), threadId);
  return (
    thread?.session?.orchestrationStatus === "running" || thread?.latestTurn?.state === "running"
  );
}
