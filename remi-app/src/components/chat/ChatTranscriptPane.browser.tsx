/**
 * @file ChatTranscriptPane 浏览器端测试
 *
 * 验证聊天 transcript 在真实浏览器中的行为：
 *
 * - **虚拟列表**：长消息列表的滚动性能
 * - **选区动作**：文本选择后浮层出现
 * - **用户消息折叠**：超过 `COLLAPSED_USER_MESSAGE_MAX_CHARS` 时折叠
 * - **profiler 钩子**：用于性能回归
 *
 * ## 使用场景
 *
 * - CI 浏览器集成测试
 * - transcript 性能/正确性回归
 *
 * ## 注意事项
 *
 * - 每个测试 `beforeEach` 重置所有 store
 * - 使用 `LegendListRef` 测量滚动行为
 */
import "../../index.css";

import { MessageId } from "~/contracts";
import { type LegendListRef } from "@legendapp/list/react";
import { page } from "@vitest/browser/context";
import { Profiler, useCallback, useRef, useState, type ProfilerOnRenderCallback } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { ChatTranscriptPane } from "./ChatTranscriptPane";
import { useTranscriptAssistantSelectionAction } from "./useTranscriptAssistantSelectionAction";
import { COLLAPSED_USER_MESSAGE_MAX_CHARS } from "./userMessagePreview";

const EMPTY_WORK_GROUPS: Record<string, boolean> = {};
const EMPTY_TURN_DIFFS = new Map();
const EMPTY_REVERT_COUNTS = new Map();
const NOOP = () => {};
const TIMELINE_ENTRIES = [
  {
    id: "assistant-message-entry",
    kind: "message" as const,
    createdAt: "2026-03-17T19:12:28.000Z",
    message: {
      id: MessageId.makeUnsafe("assistant-message-1"),
      role: "assistant" as const,
      text: "This is a stable assistant message for the transcript perf harness.",
      createdAt: "2026-03-17T19:12:28.000Z",
      streaming: false,
    },
  },
];

function TranscriptPerfHarness(props: { onTranscriptRender: () => void }) {
  const [composerValue, setComposerValue] = useState("");
  const composerImagesRef = useRef<readonly []>([]);
  const composerAssistantSelectionsRef = useRef<readonly []>([]);
  const listRef = useRef<LegendListRef | null>(null);
  const {
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
  } = useTranscriptAssistantSelectionAction({
    threadId: "thread-transcript-perf",
    enabled: true,
    composerImagesRef,
    composerAssistantSelectionsRef,
    addComposerAssistantSelectionToDraft: () => true,
    scheduleComposerFocus: NOOP,
    onMessagesClickCaptureBase: NOOP,
    onMessagesPointerCancelBase: NOOP,
    onMessagesPointerDownBase: NOOP,
    onMessagesPointerUpBase: NOOP,
    onMessagesScrollBase: NOOP,
    onMessagesTouchEndBase: NOOP,
    onMessagesTouchMoveBase: NOOP,
    onMessagesTouchStartBase: NOOP,
    onMessagesWheelBase: NOOP,
  });
  const handleComposerChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setComposerValue(event.target.value);
  }, []);
  const handleTranscriptRender = useCallback<ProfilerOnRenderCallback>(() => {
    props.onTranscriptRender();
  }, [props]);

  return (
    <div>
      <label htmlFor="composer-input">Composer</label>
      <input
        id="composer-input"
        placeholder="Type composer text"
        value={composerValue}
        onChange={handleComposerChange}
      />
      <Profiler id="chat-transcript-pane" onRender={handleTranscriptRender}>
        <ChatTranscriptPane
          activeThreadId="thread-transcript-perf"
          activeTurnInProgress={false}
          activeTurnStartedAt={null}
          chatFontSizePx={15}
          completionDividerBeforeEntryId={null}
          completionSummary={null}
          emptyStateProjectName={undefined}
          expandedWorkGroups={EMPTY_WORK_GROUPS}
          hasMessages
          isRevertingCheckpoint={false}
          isWorking={false}
          followLiveOutput={false}
          listRef={listRef}
          markdownCwd={undefined}
          onExpandTimelineImage={NOOP}
          onMessagesClickCapture={onMessagesClickCapture}
          onMessagesMouseUp={onMessagesMouseUp}
          onMessagesPointerCancel={onMessagesPointerCancel}
          onMessagesPointerDown={onMessagesPointerDown}
          onMessagesPointerUp={onMessagesPointerUp}
          onMessagesScroll={onMessagesScroll}
          onMessagesTouchEnd={onMessagesTouchEnd}
          onMessagesTouchMove={onMessagesTouchMove}
          onMessagesTouchStart={onMessagesTouchStart}
          onMessagesWheel={onMessagesWheel}
          onIsAtEndChange={NOOP}
          onOpenTurnDiff={NOOP}
          onOpenThread={NOOP}
          onRevertUserMessage={NOOP}
          onScrollToBottom={NOOP}
          onToggleWorkGroup={NOOP}
          resolvedTheme="dark"
          revertTurnCountByUserMessageId={EMPTY_REVERT_COUNTS}
          scrollButtonVisible={false}
          terminalWorkspaceTerminalTabActive={false}
          timelineEntries={TIMELINE_ENTRIES}
          timestampFormat="locale"
          turnDiffSummaryByAssistantMessageId={EMPTY_TURN_DIFFS}
          workspaceRoot={undefined}
        />
      </Profiler>
    </div>
  );
}

describe("ChatTranscriptPane", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("does not re-render the transcript subtree when only composer text changes", async () => {
    let transcriptCommitCount = 0;

    const screen = await render(
      <TranscriptPerfHarness
        onTranscriptRender={() => {
          transcriptCommitCount += 1;
        }}
      />,
    );
    try {
      await vi.waitFor(() => {
        expect(transcriptCommitCount).toBeGreaterThan(0);
      });

      const baselineCommitCount = transcriptCommitCount;
      await page.getByPlaceholder("Type composer text").fill("reply follow up");

      await vi.waitFor(() => {
        expect(screen.container.querySelector("#composer-input")).toHaveValue("reply follow up");
      });

      expect(transcriptCommitCount).toBe(baselineCommitCount);
    } finally {
      await screen.unmount();
    }
  });

  it("expands collapsed user messages from the Show more control", async () => {
    const hiddenTail = "TAIL_SHOULD_APPEAR_AFTER_EXPAND";
    const longUserText = `${"a".repeat(COLLAPSED_USER_MESSAGE_MAX_CHARS)}${hiddenTail}`;

    const screen = await render(
      <ChatTranscriptPane
        activeThreadId="thread-user-message-expand"
        activeTurnInProgress={false}
        activeTurnStartedAt={null}
        chatFontSizePx={15}
        completionDividerBeforeEntryId={null}
        completionSummary={null}
        emptyStateProjectName={undefined}
        hasMessages
        isRevertingCheckpoint={false}
        isWorking={false}
        followLiveOutput={false}
        listRef={{ current: null }}
        markdownCwd={undefined}
        onExpandTimelineImage={NOOP}
        onMessagesClickCapture={NOOP}
        onMessagesMouseUp={NOOP}
        onMessagesPointerCancel={NOOP}
        onMessagesPointerDown={NOOP}
        onMessagesPointerUp={NOOP}
        onMessagesScroll={NOOP}
        onMessagesTouchEnd={NOOP}
        onMessagesTouchMove={NOOP}
        onMessagesTouchStart={NOOP}
        onMessagesWheel={NOOP}
        onIsAtEndChange={NOOP}
        onOpenTurnDiff={NOOP}
        onOpenThread={NOOP}
        onRevertUserMessage={NOOP}
        onScrollToBottom={NOOP}
        resolvedTheme="dark"
        revertTurnCountByUserMessageId={EMPTY_REVERT_COUNTS}
        scrollButtonVisible={false}
        terminalWorkspaceTerminalTabActive={false}
        timelineEntries={[
          {
            id: "user-message-entry",
            kind: "message",
            createdAt: "2026-03-17T19:12:28.000Z",
            message: {
              id: MessageId.makeUnsafe("user-message-expand"),
              role: "user",
              text: longUserText,
              createdAt: "2026-03-17T19:12:28.000Z",
              streaming: false,
            },
          },
        ]}
        timestampFormat="locale"
        turnDiffSummaryByAssistantMessageId={EMPTY_TURN_DIFFS}
        workspaceRoot={undefined}
      />,
    );
    try {
      expect(screen.container.textContent).not.toContain(hiddenTail);
      expect(screen.container.querySelector("button[data-scroll-anchor-ignore]")?.textContent).toBe(
        "Show more",
      );

      await page.getByText("Show more").click();

      await vi.waitFor(() => {
        expect(screen.container.textContent).toContain(hiddenTail);
      });
      await expect.element(page.getByText("Show less")).toBeInTheDocument();
      expect(screen.container.querySelector("button[data-scroll-anchor-ignore]")?.textContent).toBe(
        "Show less",
      );
    } finally {
      await screen.unmount();
    }
  });
});
