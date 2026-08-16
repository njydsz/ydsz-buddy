// FILE: ChatTranscriptPane.tsx
// Purpose: Isolate the transcript shell so composer state changes do not re-render it unnecessarily.
// Layer: Chat transcript shell
// Depends on: MessagesTimeline and ChatView's list-owned scroll contract.
/**
 * @file Chat Transcript Pane
 *
 * 聊天消息列表的外壳：
 *
 * - **独立 memo**：与 Composer 状态变化隔离，避免重渲染
 * - **虚拟列表承载**：内部 `MessagesTimeline`
 * - **滚动契约**：维护 list 引用、滚动事件、键盘事件
 *
 * ## 核心导出
 *
 * - `ChatTranscriptPane`：外壳组件
 *
 * ## 使用场景
 *
 * - ChatView 中 transcript 区域
 *
 * ## 注意事项
 *
 * - 不持有业务状态，所有数据通过 props 传入
 * - 事件 handler 类型与 `MessagesTimeline` 对齐
 */
import { type MessageId, type ThreadId, type TurnId } from "~/contracts";
import { type LegendListRef } from "@legendapp/list/react";
import {
  memo,
  type ComponentProps,
  type MouseEventHandler,
  type MutableRefObject,
  type PointerEventHandler,
  type RefObject,
  type TouchEventHandler,
  type WheelEventHandler,
} from "react";
import { type TimestampFormat } from "../../appSettings";
import { type TurnDiffSummary } from "../../types";
import { ArrowDownIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";
import { type VirtualizedListRef } from "../VirtualizedList";
import { type ExpandedImagePreview } from "./ExpandedImagePreview";
import { ChatEmptyStateHero } from "./ChatEmptyStateHero";
import { MessagesTimeline } from "./MessagesTimeline";

interface ChatTranscriptPaneProps {
  activeThreadId: string;
  activeTurnId?: TurnId | null;
  activeTurnInProgress: boolean;
  activeTurnStartedAt: string | null;
  bottomContentInsetPx?: ComponentProps<typeof MessagesTimeline>["bottomContentInsetPx"];
  chatFontSizePx: number;
  completionDividerBeforeEntryId: string | null;
  completionSummary: string | null;
  emptyStateProjectName: string | undefined;
  expandedWorkGroups?: Record<string, boolean>;
  hasMessages: boolean;
  isRevertingCheckpoint: boolean;
  isWorking: boolean;
  followLiveOutput: boolean;
  listRef: RefObject<LegendListRef | null>;
  markdownCwd: string | undefined;
  onExpandTimelineImage: (preview: ExpandedImagePreview) => void;
  onMessagesClickCapture: MouseEventHandler<HTMLDivElement>;
  onMessagesMouseUp: MouseEventHandler<HTMLDivElement>;
  onMessagesPointerCancel: PointerEventHandler<HTMLDivElement>;
  onMessagesPointerDown: PointerEventHandler<HTMLDivElement>;
  onMessagesPointerUp: PointerEventHandler<HTMLDivElement>;
  onMessagesScroll: ComponentProps<typeof MessagesTimeline>["onMessagesScroll"];
  onMessagesTouchEnd: TouchEventHandler<HTMLDivElement>;
  onMessagesTouchMove: TouchEventHandler<HTMLDivElement>;
  onMessagesTouchStart: TouchEventHandler<HTMLDivElement>;
  onMessagesWheel: WheelEventHandler<HTMLDivElement>;
  onIsAtEndChange: (isAtEnd: boolean) => void;
  onOpenTurnDiff: (turnId: TurnId, filePath?: string) => void;
  onOpenThread: (threadId: ThreadId) => void;
  onRevertUserMessage: (messageId: MessageId) => void;
  onEditUserMessage?: (messageId: MessageId, text: string) => boolean | Promise<boolean>;
  onScrollToBottom: () => void;
  onToggleWorkGroup?: (groupId: string) => void;
  resolvedTheme: "light" | "dark";
  revertTurnCountByUserMessageId: Map<MessageId, number>;
  scrollButtonVisible: boolean;
  terminalWorkspaceTerminalTabActive: boolean;
  timelineEntries: ComponentProps<typeof MessagesTimeline>["timelineEntries"];
  timestampFormat: TimestampFormat;
  turnDiffSummaryByAssistantMessageId: Map<MessageId, TurnDiffSummary>;
  workspaceRoot: string | undefined;
  /** Review 模式标记：传递给 MessagesTimeline 以启用 path:line 引用渲染 */
  isReviewMode?: boolean;
  onApproveProposedPlan?: () => void;
  onRejectProposedPlan?: () => void;
  onReviseProposedPlan?: () => void;
}

export const ChatTranscriptPane = memo(function ChatTranscriptPane({
  activeThreadId,
  activeTurnId,
  activeTurnInProgress,
  activeTurnStartedAt,
  bottomContentInsetPx,
  chatFontSizePx,
  completionDividerBeforeEntryId,
  completionSummary,
  emptyStateProjectName,
  expandedWorkGroups,
  hasMessages,
  isRevertingCheckpoint,
  isWorking,
  followLiveOutput,
  listRef,
  markdownCwd,
  onExpandTimelineImage,
  onMessagesClickCapture,
  onMessagesMouseUp,
  onMessagesPointerCancel,
  onMessagesPointerDown,
  onMessagesPointerUp,
  onMessagesScroll,
  onMessagesTouchEnd,
  onMessagesTouchMove,
  onMessagesTouchStart,
  onMessagesWheel,
  onIsAtEndChange,
  onOpenTurnDiff,
  onOpenThread,
  onRevertUserMessage,
  onEditUserMessage,
  onScrollToBottom,
  onToggleWorkGroup,
  resolvedTheme,
  revertTurnCountByUserMessageId,
  scrollButtonVisible,
  terminalWorkspaceTerminalTabActive,
  timelineEntries,
  timestampFormat,
  turnDiffSummaryByAssistantMessageId,
  workspaceRoot,
  isReviewMode = false,
  onApproveProposedPlan,
  onRejectProposedPlan,
  onReviseProposedPlan,
}: ChatTranscriptPaneProps) {
  return (
    <section
      data-chat-transcript-pane="true"
      data-testid="chat-message-list"
      aria-hidden={terminalWorkspaceTerminalTabActive}
      aria-label="Chat messages"
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
        terminalWorkspaceTerminalTabActive ? "pointer-events-none invisible" : "",
      )}
    >
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <MessagesTimeline
          key={activeThreadId}
          hasMessages={hasMessages}
          isWorking={isWorking}
          activeTurnId={activeTurnId ?? null}
          activeTurnInProgress={activeTurnInProgress}
          activeTurnStartedAt={activeTurnStartedAt}
          listRef={listRef as unknown as MutableRefObject<VirtualizedListRef | null>}
          timelineEntries={timelineEntries}
          completionDividerBeforeEntryId={completionDividerBeforeEntryId}
          completionSummary={completionSummary}
          turnDiffSummaryByAssistantMessageId={turnDiffSummaryByAssistantMessageId}
          onOpenTurnDiff={onOpenTurnDiff}
          onOpenThread={onOpenThread}
          revertTurnCountByUserMessageId={revertTurnCountByUserMessageId}
          onRevertUserMessage={onRevertUserMessage}
          {...(onEditUserMessage ? { onEditUserMessage } : {})}
          isRevertingCheckpoint={isRevertingCheckpoint}
          onImageExpand={onExpandTimelineImage}
          followLiveOutput={followLiveOutput}
          onIsAtEndChange={onIsAtEndChange}
          onMessagesScroll={onMessagesScroll}
          onMessagesClickCapture={onMessagesClickCapture}
          onMessagesMouseUp={onMessagesMouseUp}
          onMessagesWheel={onMessagesWheel}
          onMessagesPointerDown={onMessagesPointerDown}
          onMessagesPointerUp={onMessagesPointerUp}
          onMessagesPointerCancel={onMessagesPointerCancel}
          onMessagesTouchStart={onMessagesTouchStart}
          onMessagesTouchMove={onMessagesTouchMove}
          onMessagesTouchEnd={onMessagesTouchEnd}
          markdownCwd={markdownCwd}
          resolvedTheme={resolvedTheme}
          chatFontSizePx={chatFontSizePx}
          timestampFormat={timestampFormat}
          workspaceRoot={workspaceRoot}
          bottomContentInsetPx={bottomContentInsetPx}
          emptyStateContent={<ChatEmptyStateHero projectName={emptyStateProjectName} />}
          {...(expandedWorkGroups ? { expandedWorkGroups } : {})}
          {...(onToggleWorkGroup ? { onToggleWorkGroup } : {})}
          isReviewMode={isReviewMode}
          {...(onApproveProposedPlan ? { onApproveProposedPlan } : {})}
          {...(onRejectProposedPlan ? { onRejectProposedPlan } : {})}
          {...(onReviseProposedPlan ? { onReviseProposedPlan } : {})}
        />

        {scrollButtonVisible ? (
          <div className="pointer-events-none absolute bottom-1 left-1/2 z-30 flex -translate-x-1/2 justify-center py-1">
            <button
              type="button"
              onClick={onScrollToBottom}
              data-scroll-anchor-ignore
              aria-label="Scroll to bottom"
              className="pointer-events-auto flex size-9 items-center justify-center rounded-full border border-(--color-border) bg-(--color-background-elevated-primary-opaque) text-(--color-text-foreground-secondary) shadow-sm backdrop-blur-sm transition-colors hover:cursor-pointer hover:bg-(--color-background-elevated-secondary) hover:text-(--color-text-foreground)"
            >
              <ArrowDownIcon className="size-4" />
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
});
