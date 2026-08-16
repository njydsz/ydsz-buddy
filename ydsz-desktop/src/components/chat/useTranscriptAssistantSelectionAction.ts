/**
 * @module useTranscriptAssistantSelectionAction
 * @description 管理聊天记录中助手消息的高亮选中 → 浮动操作 → 插入编辑器的完整交互流程。
 * 当用户在转录面板中选中助手消息文本时，显示浮动操作按钮，点击后将选中文本作为引用附件插入到编辑器中。
 */

import { PROVIDER_SEND_TURN_MAX_ATTACHMENTS } from "~/contracts";
import {
  useCallback,
  useEffect,
  useState,
  type MutableRefObject,
  type MouseEventHandler,
  type PointerEventHandler,
  type TouchEventHandler,
  type WheelEventHandler,
} from "react";
import { toastManager } from "../ui/toast";
import { type ComposerAssistantSelectionAttachment } from "../../composerDraftStore";
import {
  createAssistantSelectionAttachment,
  getAssistantSelectionValidationError,
} from "../../lib/assistantSelections";
import {
  readTranscriptAssistantSelection,
  resolveTranscriptSelectionActionLayout,
  type TranscriptAssistantSelection,
} from "./chatSelectionActions";

/** 待确认的转录选区操作状态，包含选区信息及浮动按钮的定位 */
export interface PendingTranscriptSelectionAction {
  /** 助手消息的选区内容 */
  selection: TranscriptAssistantSelection;
  /** 浮动按钮的左侧偏移量（px） */
  left: number;
  /** 浮动按钮的顶部偏移量（px） */
  top: number;
  /** 浮动按钮的放置方向 */
  placement: "top" | "bottom";
}

/** useTranscriptAssistantSelectionAction hook 的配置选项 */
interface UseTranscriptAssistantSelectionActionOptions {
  /** 当前会话线程 ID */
  threadId: string;
  /** 是否启用选区操作功能 */
  enabled: boolean;
  /** 编辑器中图片附件的引用 */
  composerImagesRef: MutableRefObject<ReadonlyArray<unknown>>;
  /** 编辑器中助手选区附件的引用 */
  composerAssistantSelectionsRef: MutableRefObject<
    ReadonlyArray<ComposerAssistantSelectionAttachment>
  >;
  /** 将助手选区附件添加到编辑器草稿的回调 */
  addComposerAssistantSelectionToDraft: (
    selection: ComposerAssistantSelectionAttachment,
  ) => boolean;
  /** 调度编辑器聚焦的回调 */
  scheduleComposerFocus: () => void;
  /** 消息区域的 click capture 基础事件处理器 */
  onMessagesClickCaptureBase: MouseEventHandler<HTMLDivElement>;
  /** 消息区域的 pointerdown 基础事件处理器 */
  onMessagesPointerDownBase: PointerEventHandler<HTMLDivElement>;
  /** 消息区域的 pointerup 基础事件处理器 */
  onMessagesPointerUpBase: PointerEventHandler<HTMLDivElement>;
  /** 消息区域的 pointercancel 基础事件处理器 */
  onMessagesPointerCancelBase: PointerEventHandler<HTMLDivElement>;
  /** 消息区域的 scroll 基础事件处理器 */
  onMessagesScrollBase: () => void;
  /** 消息区域的 wheel 基础事件处理器 */
  onMessagesWheelBase: WheelEventHandler<HTMLDivElement>;
  /** 消息区域的 touchstart 基础事件处理器 */
  onMessagesTouchStartBase: TouchEventHandler<HTMLDivElement>;
  /** 消息区域的 touchmove 基础事件处理器 */
  onMessagesTouchMoveBase: TouchEventHandler<HTMLDivElement>;
  /** 消息区域的 touchend 基础事件处理器 */
  onMessagesTouchEndBase: TouchEventHandler<HTMLDivElement>;
}

/**
 * 管理转录面板中助手消息选区的交互 hook。
 * 监听鼠标/触摸事件，在用户选中助手文本后显示浮动操作按钮，
 * 点击按钮将选中文本作为引用附件插入到编辑器草稿中。
 *
 * @param options - hook 配置选项
 * @returns 选区操作状态及事件处理器
 */
export function useTranscriptAssistantSelectionAction(
  options: UseTranscriptAssistantSelectionActionOptions,
) {
  const {
    threadId,
    enabled,
    composerImagesRef,
    composerAssistantSelectionsRef,
    addComposerAssistantSelectionToDraft,
    scheduleComposerFocus,
    onMessagesClickCaptureBase,
    onMessagesPointerDownBase,
    onMessagesPointerUpBase,
    onMessagesPointerCancelBase,
    onMessagesScrollBase,
    onMessagesWheelBase,
    onMessagesTouchStartBase,
    onMessagesTouchMoveBase,
    onMessagesTouchEndBase,
  } = options;
  const [pendingTranscriptSelectionAction, setPendingTranscriptSelectionAction] =
    useState<PendingTranscriptSelectionAction | null>(null);

  const dismissTranscriptSelectionAction = useCallback(() => {
    setPendingTranscriptSelectionAction(null);
  }, []);

  const onMessagesClickCapture = useCallback<MouseEventHandler<HTMLDivElement>>(
    (event) => {
      dismissTranscriptSelectionAction();
      onMessagesClickCaptureBase(event);
    },
    [dismissTranscriptSelectionAction, onMessagesClickCaptureBase],
  );

  const onMessagesPointerDown = useCallback<PointerEventHandler<HTMLDivElement>>(
    (event) => {
      dismissTranscriptSelectionAction();
      onMessagesPointerDownBase(event);
    },
    [dismissTranscriptSelectionAction, onMessagesPointerDownBase],
  );

  const onMessagesPointerUp = useCallback<PointerEventHandler<HTMLDivElement>>(
    (event) => {
      onMessagesPointerUpBase(event);
    },
    [onMessagesPointerUpBase],
  );

  const onMessagesPointerCancel = useCallback<PointerEventHandler<HTMLDivElement>>(
    (event) => {
      dismissTranscriptSelectionAction();
      onMessagesPointerCancelBase(event);
    },
    [dismissTranscriptSelectionAction, onMessagesPointerCancelBase],
  );

  const onMessagesScroll = useCallback(() => {
    dismissTranscriptSelectionAction();
    onMessagesScrollBase();
  }, [dismissTranscriptSelectionAction, onMessagesScrollBase]);

  const onMessagesWheel = useCallback<WheelEventHandler<HTMLDivElement>>(
    (event) => {
      dismissTranscriptSelectionAction();
      onMessagesWheelBase(event);
    },
    [dismissTranscriptSelectionAction, onMessagesWheelBase],
  );

  const onMessagesTouchStart = useCallback<TouchEventHandler<HTMLDivElement>>(
    (event) => {
      dismissTranscriptSelectionAction();
      onMessagesTouchStartBase(event);
    },
    [dismissTranscriptSelectionAction, onMessagesTouchStartBase],
  );

  const onMessagesTouchMove = useCallback<TouchEventHandler<HTMLDivElement>>(
    (event) => {
      dismissTranscriptSelectionAction();
      onMessagesTouchMoveBase(event);
    },
    [dismissTranscriptSelectionAction, onMessagesTouchMoveBase],
  );

  const onMessagesTouchEnd = useCallback<TouchEventHandler<HTMLDivElement>>(
    (event) => {
      onMessagesTouchEndBase(event);
    },
    [onMessagesTouchEndBase],
  );

  const onMessagesMouseUp = useCallback<MouseEventHandler<HTMLDivElement>>(
    (event) => {
      const container = event.currentTarget;
      const clientX = event.clientX;
      const clientY = event.clientY;
      window.requestAnimationFrame(() => {
        if (!enabled || !container) {
          setPendingTranscriptSelectionAction(null);
          return;
        }

        const selectionState = readTranscriptAssistantSelection({ container });
        if (!selectionState) {
          setPendingTranscriptSelectionAction(null);
          return;
        }

        if (
          composerImagesRef.current.length + composerAssistantSelectionsRef.current.length >=
          PROVIDER_SEND_TURN_MAX_ATTACHMENTS
        ) {
          setPendingTranscriptSelectionAction(null);
          toastManager.add({
            type: "warning",
            title: `You can attach up to ${PROVIDER_SEND_TURN_MAX_ATTACHMENTS} references per message.`,
          });
          return;
        }

        const layout = resolveTranscriptSelectionActionLayout({
          selectionRect: selectionState.selectionRect,
          pointer: { x: clientX, y: clientY },
        });
        setPendingTranscriptSelectionAction({
          selection: selectionState.selection,
          left: layout.left,
          top: layout.top,
          placement: layout.placement,
        });
      });
    },
    [enabled, composerImagesRef, composerAssistantSelectionsRef],
  );

  const commitTranscriptAssistantSelection = useCallback(() => {
    const pendingSelection = pendingTranscriptSelectionAction;
    if (!pendingSelection) {
      return;
    }

    if (
      composerImagesRef.current.length + composerAssistantSelectionsRef.current.length >=
      PROVIDER_SEND_TURN_MAX_ATTACHMENTS
    ) {
      setPendingTranscriptSelectionAction(null);
      toastManager.add({
        type: "warning",
        title: `You can attach up to ${PROVIDER_SEND_TURN_MAX_ATTACHMENTS} references per message.`,
      });
      return;
    }

    const nextSelection = createAssistantSelectionAttachment(pendingSelection.selection);
    if (!nextSelection) {
      setPendingTranscriptSelectionAction(null);
      if (getAssistantSelectionValidationError(pendingSelection.selection) === "too-long") {
        toastManager.add({
          type: "warning",
          title: "Selections can be up to 4,000 characters.",
        });
      }
      return;
    }

    const inserted = addComposerAssistantSelectionToDraft(nextSelection);
    setPendingTranscriptSelectionAction(null);
    if (inserted) {
      window.getSelection()?.removeAllRanges();
      scheduleComposerFocus();
    }
  }, [
    addComposerAssistantSelectionToDraft,
    composerAssistantSelectionsRef,
    composerImagesRef,
    pendingTranscriptSelectionAction,
    scheduleComposerFocus,
  ]);

  useEffect(() => {
    setPendingTranscriptSelectionAction(null);
  }, [threadId]);

  useEffect(() => {
    if (!enabled) {
      setPendingTranscriptSelectionAction(null);
    }
  }, [enabled]);

  useEffect(() => {
    if (!pendingTranscriptSelectionAction) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("[data-transcript-selection-action='true']")
      ) {
        return;
      }
      setPendingTranscriptSelectionAction(null);
    };
    const handleWindowChange = () => {
      setPendingTranscriptSelectionAction(null);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("resize", handleWindowChange);
    document.addEventListener("selectionchange", handleWindowChange);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("resize", handleWindowChange);
      document.removeEventListener("selectionchange", handleWindowChange);
    };
  }, [pendingTranscriptSelectionAction]);

  return {
    pendingTranscriptSelectionAction,
    commitTranscriptAssistantSelection,
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
  };
}
