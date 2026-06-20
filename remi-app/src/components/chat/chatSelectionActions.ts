/**
 * @file chatSelectionActions.ts
 * @description 对话文本选择的辅助函数，用于读取助手消息选区并计算浮动操作按钮的布局位置。
 * 避免因选区变化导致不必要的重渲染。
 */

/** 助手消息选区数据 */
export interface TranscriptAssistantSelection {
  /** 助手消息 ID */
  assistantMessageId: string;
  /** 选中的文本 */
  text: string;
}

/** 选区操作按钮的布局位置 */
export interface TranscriptSelectionActionLayout {
  /** 左偏移量 */
  left: number;
  /** 上偏移量 */
  top: number;
  /** 放置方向（上方/下方） */
  placement: "top" | "bottom";
}

/** 操作按钮宽度（像素） */
const TRANSCRIPT_SELECTION_ACTION_WIDTH_PX = 108;
/** 操作按钮高度（像素） */
const TRANSCRIPT_SELECTION_ACTION_HEIGHT_PX = 32;
/** 操作按钮与选区的间距（像素） */
const TRANSCRIPT_SELECTION_ACTION_GAP_PX = 8;

/**
 * 获取选区的客户端矩形
 * @param selection - 浏览器选区对象
 * @returns 选区矩形，无有效选区时返回 null
 */
function getSelectionRect(selection: Selection): DOMRect | null {
  if (selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }
  const range = selection.getRangeAt(0);
  const rects = Array.from(range.getClientRects()).filter(
    (rect) => rect.width > 0 || rect.height > 0,
  );
  if (rects.length > 0) {
    return rects[rects.length - 1] ?? null;
  }
  const boundingRect = range.getBoundingClientRect();
  return boundingRect.width > 0 || boundingRect.height > 0 ? boundingRect : null;
}

/**
 * 查找节点所属的助手消息容器元素
 * @param node - DOM 节点
 * @returns 最近的包含 data-assistant-message-id 属性的元素，未找到返回 null
 */
function selectionContainerForNode(node: Node | null): HTMLElement | null {
  if (!node) {
    return null;
  }
  const element = node instanceof HTMLElement ? node : node.parentElement;
  return element?.closest<HTMLElement>("[data-assistant-message-id]") ?? null;
}

/**
 * 读取对话中助手消息的文本选区
 * @param input.container - 选区搜索范围的容器元素
 * @returns 选区数据和选区矩形，无有效选区时返回 null
 */
export function readTranscriptAssistantSelection(input: {
  container: HTMLElement | null;
}): { selection: TranscriptAssistantSelection; selectionRect: DOMRect | null } | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const anchorContainer = selectionContainerForNode(selection.anchorNode);
  const focusContainer = selectionContainerForNode(selection.focusNode);
  if (!anchorContainer || !focusContainer || anchorContainer !== focusContainer) {
    return null;
  }
  const { container } = input;
  if (!container || !container.contains(anchorContainer)) {
    return null;
  }

  const assistantMessageId = anchorContainer.dataset.assistantMessageId?.trim() ?? "";
  const text = selection
    .toString()
    .replace(/\r\n/g, "\n")
    .replace(/^\n+|\n+$/g, "")
    .trim();
  if (assistantMessageId.length === 0 || text.length === 0) {
    return null;
  }

  return {
    selection: {
      assistantMessageId,
      text,
    },
    selectionRect: getSelectionRect(selection),
  };
}

/**
 * 计算选区操作按钮的布局位置
 * @param input.selectionRect - 选区矩形
 * @param input.pointer - 指针位置
 * @param input.viewport - 视口尺寸（可选）
 * @returns 操作按钮的布局位置
 */
export function resolveTranscriptSelectionActionLayout(input: {
  selectionRect: DOMRect | null;
  pointer: { x: number; y: number };
  viewport?: { width: number; height: number } | null;
}): TranscriptSelectionActionLayout {
  const viewportWidth =
    input.viewport?.width ??
    (typeof window === "undefined" ? input.pointer.x + 8 : window.innerWidth);
  const viewportHeight =
    input.viewport?.height ??
    (typeof window === "undefined" ? input.pointer.y + 8 : window.innerHeight);

  const anchorCenterX =
    input.selectionRect !== null
      ? input.selectionRect.left + input.selectionRect.width / 2
      : input.pointer.x;
  const selectionTop = input.selectionRect?.top ?? input.pointer.y;
  const selectionBottom = input.selectionRect?.bottom ?? input.pointer.y;
  const availableAbove = selectionTop;
  const availableBelow = viewportHeight - selectionBottom;
  const placement =
    availableAbove >= TRANSCRIPT_SELECTION_ACTION_HEIGHT_PX + TRANSCRIPT_SELECTION_ACTION_GAP_PX ||
    availableAbove >= availableBelow
      ? "top"
      : "bottom";
  const unclampedTop =
    placement === "top"
      ? selectionTop - TRANSCRIPT_SELECTION_ACTION_HEIGHT_PX - TRANSCRIPT_SELECTION_ACTION_GAP_PX
      : selectionBottom + TRANSCRIPT_SELECTION_ACTION_GAP_PX;

  return {
    left: Math.max(
      8,
      Math.min(
        Math.round(anchorCenterX - TRANSCRIPT_SELECTION_ACTION_WIDTH_PX / 2),
        Math.max(viewportWidth - TRANSCRIPT_SELECTION_ACTION_WIDTH_PX - 8, 8),
      ),
    ),
    top: Math.max(
      8,
      Math.min(
        Math.round(unclampedTop),
        Math.max(viewportHeight - TRANSCRIPT_SELECTION_ACTION_HEIGHT_PX - 8, 8),
      ),
    ),
    placement,
  };
}
