/**
 * @file ChatTranscriptPane.tsx
 * @description 聊天对话面板外壳，隔离对话列表的渲染以避免编辑器状态变更导致不必要的重渲染。
 * 包含消息时间线、滚动到底部按钮和空状态展示。
 */

import { type MessageId, type ThreadId, type TurnId } from "~/contracts";
import { type LegendListRef } from "@legendapp/list/react";
import {
  memo,
  type ComponentProps,
  type MouseEventHandler,
  type PointerEventHandler,
  type RefObject,
  type TouchEventHandler,
  type WheelEventHandler,
} from "react";
import { type TimestampFormat } from "../../appSettings";
import { type TurnDiffSummary } from "../../types";
import { ArrowDownIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";
import { type ExpandedImagePreview } from "./ExpandedImagePreview";
import { ChatEmptyStateHero } from "./ChatEmptyStateHero";
import { MessagesTimeline } from "./MessagesTimeline";

/**
 * ChatTranscriptPane 组件的属性接口
 */
interface ChatTranscriptPaneProps {
  /** 当前活跃的线程 ID */
  activeThreadId: string;
  /** 当前活跃的轮次 ID */
  activeTurnId?: TurnId | null;
  /** 当前轮次是否正在进行中 */
  activeTurnInProgress: boolean;
  /** 当前轮次开始时间 */
  activeTurnStartedAt: string | null;
  /** 底部内容内边距（像素） */
  bottomContentInsetPx?: ComponentProps<typeof MessagesTimeline>["bottomContentInsetPx"];
  /** 聊天字体大小（像素） */
  chatFontSizePx: number;
  /** 完成分割线前方的条目 ID */
  completionDividerBeforeEntryId: string | null;
  /** 完成摘要文本 */
  completionSummary: string | null;
  /** 空状态显示的项目名称 */
  emptyStateProjectName: string | undefined;
  /** 已展开的工作组映射 */
  expandedWorkGroups?: Record<string, boolean>;
  /** 是否有消息 */
  hasMessages: boolean;
  /** 是否正在还原检查点 */
  isRevertingCheckpoint: boolean;
  /** 是否正在工作中（AI 正在生成） */
  isWorking: boolean;
  /** 是否跟随实时输出（自动滚动到底部） */
  followLiveOutput: boolean;
  /** 虚拟列表引用 */
  listRef: RefObject<LegendListRef | null>;
  /** Markdown 渲染的工作目录 */
  markdownCwd: string | undefined;
  /** 展开时间线图片的回调 */
  onExpandTimelineImage: (preview: ExpandedImagePreview) => void;
  /** 消息区域点击捕获事件 */
  onMessagesClickCapture: MouseEventHandler<HTMLDivElement>;
  /** 消息区域鼠标释放事件 */
  onMessagesMouseUp: MouseEventHandler<HTMLDivElement>;
  /** 消息区域指针取消事件 */
  onMessagesPointerCancel: PointerEventHandler<HTMLDivElement>;
  /** 消息区域指针按下事件 */
  onMessagesPointerDown: PointerEventHandler<HTMLDivElement>;
  /** 消息区域指针释放事件 */
  onMessagesPointerUp: PointerEventHandler<HTMLDivElement>;
  /** 消息区域滚动事件 */
  onMessagesScroll: ComponentProps<typeof MessagesTimeline>["onMessagesScroll"];
  /** 消息区域触摸结束事件 */
  onMessagesTouchEnd: TouchEventHandler<HTMLDivElement>;
  /** 消息区域触摸移动事件 */
  onMessagesTouchMove: TouchEventHandler<HTMLDivElement>;
  /** 消息区域触摸开始事件 */
  onMessagesTouchStart: TouchEventHandler<HTMLDivElement>;
  /** 消息区域滚轮事件 */
  onMessagesWheel: WheelEventHandler<HTMLDivElement>;
  /** 是否滚动到底部的状态变更回调 */
  onIsAtEndChange: (isAtEnd: boolean) => void;
  /** 打开轮次差异对比的回调 */
  onOpenTurnDiff: (turnId: TurnId, filePath?: string) => void;
  /** 打开线程的回调 */
  onOpenThread: (threadId: ThreadId) => void;
  /** 还原用户消息的回调 */
  onRevertUserMessage: (messageId: MessageId) => void;
  /** 编辑用户消息的回调 */
  onEditUserMessage?: (messageId: MessageId, text: string) => boolean | Promise<boolean>;
  /** 滚动到底部的回调 */
  onScrollToBottom: () => void;
  /** 切换工作组展开/折叠的回调 */
  onToggleWorkGroup?: (groupId: string) => void;
  /** 当前主题（亮色/暗色） */
  resolvedTheme: "light" | "dark";
  /** 按用户消息 ID 索引的还原轮次计数 */
  revertTurnCountByUserMessageId: Map<MessageId, number>;
  /** 滚动到底部按钮是否可见 */
  scrollButtonVisible: boolean;
  /** 终端工作区的终端标签页是否激活 */
  terminalWorkspaceTerminalTabActive: boolean;
  /** 时间线条目列表 */
  timelineEntries: ComponentProps<typeof MessagesTimeline>["timelineEntries"];
  /** 时间戳格式 */
  timestampFormat: TimestampFormat;
  /** 按助手消息 ID 索引的轮次差异摘要 */
  turnDiffSummaryByAssistantMessageId: Map<MessageId, TurnDiffSummary>;
  /** 工作区根路径 */
  workspaceRoot: string | undefined;
}

/**
 * ChatTranscriptPane 组件
 * @description 聊天对话面板外壳，隔离消息时间线的渲染，避免编辑器状态变更导致不必要的重渲染。
 * 包含消息时间线、滚动到底部按钮和空状态展示。
 */

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
}: ChatTranscriptPaneProps) {
  return (
    <div
      data-chat-transcript-pane="true"
      aria-hidden={terminalWorkspaceTerminalTabActive}
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
          listRef={listRef}
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
        />

        {scrollButtonVisible ? (
          <div className="pointer-events-none absolute bottom-1 left-1/2 z-30 flex -translate-x-1/2 justify-center py-1">
            <button
              type="button"
              onClick={onScrollToBottom}
              data-scroll-anchor-ignore
              aria-label="Scroll to bottom"
              className="pointer-events-auto flex size-9 items-center justify-center rounded-full border border-[color:var(--color-border)] bg-[var(--color-background-elevated-primary-opaque)] text-[var(--color-text-foreground-secondary)] shadow-sm backdrop-blur-sm transition-colors hover:cursor-pointer hover:bg-[var(--color-background-elevated-secondary)] hover:text-[var(--color-text-foreground)]"
            >
              <ArrowDownIcon className="size-4" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
});
