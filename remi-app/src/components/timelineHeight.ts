/**
 * @file 时间线高度估算模块
 * @description 在 ResizeObserver 测量到达之前，预估聊天消息行的高度。
 *              用于虚拟化列表的快速滚动场景，确保在真实尺寸测量完成前布局不会跳动。
 *              导出消息/工作区高度估算器，供 MessagesTimeline 和浏览器测试使用。
 */

import type { TurnDiffFileChange } from "../types";
import { DEFAULT_CHAT_FONT_SIZE_PX, normalizeChatFontSizePx } from "../appSettings";
import { deriveDisplayedUserMessageState } from "../lib/terminalContext";
import { buildTurnDiffTree, type TurnDiffTreeNode } from "../lib/turnDiffTree";
import { buildInlineTerminalContextText } from "./chat/userMessageTerminalContexts";
import { deriveUserMessagePreviewState } from "./chat/userMessagePreview";
import {
  getChatTranscriptAssistantCharWidthPx,
  getChatTranscriptLineHeightPx,
  getChatTranscriptUserCharWidthPx,
} from "./chat/chatTypography";

/** 助手消息每行字符数回退值 */
const ASSISTANT_CHARS_PER_LINE_FALLBACK = 72;
/** 用户消息每行字符数回退值 */
const USER_CHARS_PER_LINE_FALLBACK = 56;
/** 助手消息基础高度（像素） */
const ASSISTANT_BASE_HEIGHT_PX = 78;
/** 用户消息基础高度（像素） */
const USER_BASE_HEIGHT_PX = 97;
/** 用户附件缩略图尺寸（像素） */
const USER_ATTACHMENT_THUMBNAIL_SIZE_PX = 60;
/** 用户附件缩略图间距（像素） */
const USER_ATTACHMENT_THUMBNAIL_GAP_PX = 8;
/** 用户附件每行缩略图数量 */
const USER_ATTACHMENT_THUMBNAILS_PER_ROW = 4;
/** 用户附件行底部边距（像素） */
const USER_ATTACHMENT_ROW_MARGIN_BOTTOM_PX = 4;
/** 用户消息折叠/展开切换按钮高度（像素） */
const USER_MESSAGE_TOGGLE_HEIGHT_PX = 20;
/** 用户调度芯片高度（像素） */
const USER_DISPATCH_CHIP_HEIGHT_PX = 24;
/** 用户调度芯片底部边距（像素） */
const USER_DISPATCH_CHIP_MARGIN_BOTTOM_PX = 6;
/** 用户调度芯片含媒体时的底部边距（像素） */
const USER_DISPATCH_CHIP_WITH_MEDIA_MARGIN_BOTTOM_PX = 12;
/** 用户消息气泡宽度占比 */
const USER_BUBBLE_WIDTH_RATIO = 0.8;
/** 用户消息气泡水平内边距（像素） */
const USER_BUBBLE_HORIZONTAL_PADDING_PX = 32;
/** 助手消息水平内边距（像素） */
const ASSISTANT_MESSAGE_HORIZONTAL_PADDING_PX = 8;
/** 用户消息每行最少字符数 */
const MIN_USER_CHARS_PER_LINE = 4;
/** 助手消息每行最少字符数 */
const MIN_ASSISTANT_CHARS_PER_LINE = 20;
/** 助手行内代码宽度倍率 */
const ASSISTANT_INLINE_CODE_WIDTH_MULTIPLIER = 1.2;
/** 助手行内代码换行额外开销字符数 */
const ASSISTANT_INLINE_CODE_WRAP_OVERHEAD_CHARS = 2;
/** 行内代码片段正则 */
const INLINE_CODE_SPAN_REGEX = /`([^`\n]+)`/g;
/** 完成分隔线高度（像素） */
const COMPLETION_DIVIDER_HEIGHT_PX = 40;
/** 变更文件摘要装饰高度（像素） */
const TURN_DIFF_SUMMARY_CHROME_HEIGHT_PX = 76;
/** 变更文件树行高（像素） */
const TURN_DIFF_TREE_ROW_HEIGHT_PX = 24;
/** 变更文件树行间距（像素） */
const TURN_DIFF_TREE_ROW_GAP_PX = 2;
/** 工作组装饰高度（像素） */
const WORK_GROUP_CHROME_HEIGHT_PX = 24;
/** 工作组标题高度（像素） */
const WORK_GROUP_HEADER_HEIGHT_PX = 20;
/** 工作条目行高（像素） */
const WORK_ENTRY_ROW_HEIGHT_PX = 30;
/** 工作条目变更文件高度（像素） */
const WORK_ENTRY_CHANGED_FILES_HEIGHT_PX = 24;
/** 工作条目间距（像素） */
const WORK_ENTRY_GAP_PX = 2;
/** 行内工具预览顶部边距（像素） */
const INLINE_TOOL_PREVIEW_MARGIN_TOP_PX = 10;
/** 行内工具预览行高（像素） */
const INLINE_TOOL_PREVIEW_ROW_HEIGHT_PX = 22;
/** 行内工具预览行间距（像素） */
const INLINE_TOOL_PREVIEW_ROW_GAP_PX = 1;
/** 行内工具预览切换按钮顶部边距（像素） */
const INLINE_TOOL_PREVIEW_TOGGLE_MARGIN_TOP_PX = 4;
/** 行内工具预览切换按钮高度（像素） */
const INLINE_TOOL_PREVIEW_TOGGLE_HEIGHT_PX = 18;
/** 行内工具预览容器装饰高度（像素） */
const INLINE_TOOL_PREVIEW_CONTAINER_CHROME_HEIGHT_PX = 0;
/** 变更文件摘要高度缓存，避免重复计算 */
const changedFilesSummaryHeightCache = new WeakMap<
  ReadonlyArray<TurnDiffFileChange>,
  { collapsed?: number; expanded?: number }
>();

/**
 * 时间线消息高度估算输入
 * @property role - 消息角色
 * @property text - 消息文本
 * @property attachments - 附件列表
 * @property dispatchMode - 调度模式
 * @property diffSummaryFiles - 变更文件摘要列表
 * @property diffSummaryAllDirectoriesExpanded - 变更文件摘要是否全部展开
 * @property inlineToolEntries - 行内工具条目列表
 * @property inlineToolExpanded - 行内工具是否展开
 * @property showCompletionDivider - 是否显示完成分隔线
 */
interface TimelineMessageHeightInput {
  role: "user" | "assistant" | "system";
  text: string;
  attachments?: ReadonlyArray<{ id: string; type?: "image" | "assistant-selection" }>;
  dispatchMode?: "queue" | "steer";
  diffSummaryFiles?: ReadonlyArray<TurnDiffFileChange>;
  diffSummaryAllDirectoriesExpanded?: boolean;
  inlineToolEntries?: ReadonlyArray<TimelineWorkEntryHeightInput>;
  inlineToolExpanded?: boolean;
  showCompletionDivider?: boolean;
}

/**
 * 时间线高度估算布局参数
 * @property timelineWidthPx - 时间线宽度（像素），null 时使用回退值
 * @property chatFontSizePx - 聊天字体大小（像素）
 */
interface TimelineHeightEstimateLayout {
  timelineWidthPx: number | null;
  chatFontSizePx?: number;
}

/**
 * 时间线工作条目高度估算输入
 * @property tone - 条目语气类型
 * @property command - 命令文本
 * @property detail - 详情文本
 * @property changedFiles - 变更文件列表
 */
interface TimelineWorkEntryHeightInput {
  tone: "thinking" | "tool" | "info" | "error";
  command?: string | null;
  detail?: string | null;
  changedFiles?: ReadonlyArray<string>;
}

/**
 * 工作组高度估算选项
 * @property expanded - 是否展开
 * @property maxVisibleEntries - 最大可见条目数
 */
interface TimelineWorkGroupEstimateOptions {
  expanded: boolean;
  maxVisibleEntries: number;
}

/**
 * 估算文本自动换行后的行数
 * 避免对长日志使用 split 分配数组，采用单次遍历计数
 * @param text - 待估算的文本
 * @param charsPerLine - 每行字符数
 * @returns 估算的行数
 */
function estimateWrappedLineCount(text: string, charsPerLine: number): number {
  if (text.length === 0) return 1;

  // Avoid allocating via split for long logs; iterate once and count wrapped lines.
  let lines = 0;
  let currentLineLength = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) {
      lines += Math.max(1, Math.ceil(currentLineLength / charsPerLine));
      currentLineLength = 0;
      continue;
    }
    currentLineLength += 1;
  }

  lines += Math.max(1, Math.ceil(currentLineLength / charsPerLine));
  return lines;
}

/** 判断值是否为有限正数 */
function isFinitePositiveNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * 估算用户消息每行字符数
 * @param timelineWidthPx - 时间线宽度
 * @param chatFontSizePx - 聊天字体大小
 * @returns 每行字符数
 */
function estimateCharsPerLineForUser(
  timelineWidthPx: number | null,
  chatFontSizePx: number,
): number {
  if (!isFinitePositiveNumber(timelineWidthPx)) return USER_CHARS_PER_LINE_FALLBACK;
  const bubbleWidthPx = timelineWidthPx * USER_BUBBLE_WIDTH_RATIO;
  const textWidthPx = Math.max(bubbleWidthPx - USER_BUBBLE_HORIZONTAL_PADDING_PX, 0);
  return Math.max(
    MIN_USER_CHARS_PER_LINE,
    Math.floor(textWidthPx / getChatTranscriptUserCharWidthPx(chatFontSizePx)),
  );
}

/**
 * 估算助手消息每行字符数
 * @param timelineWidthPx - 时间线宽度
 * @param chatFontSizePx - 聊天字体大小
 * @returns 每行字符数
 */
function estimateCharsPerLineForAssistant(
  timelineWidthPx: number | null,
  chatFontSizePx: number,
): number {
  if (!isFinitePositiveNumber(timelineWidthPx)) return ASSISTANT_CHARS_PER_LINE_FALLBACK;
  const textWidthPx = Math.max(timelineWidthPx - ASSISTANT_MESSAGE_HORIZONTAL_PADDING_PX, 0);
  return Math.max(
    MIN_ASSISTANT_CHARS_PER_LINE,
    Math.floor(textWidthPx / getChatTranscriptAssistantCharWidthPx(chatFontSizePx)),
  );
}

/**
 * 计算变更文件差异树中可见的行数
 * 在 ResizeObserver 校正真实尺寸前，用于预估差异摘要的渲染行数
 * @param nodes - 差异树节点数组
 * @param allDirectoriesExpanded - 是否展开所有目录
 * @returns 可见行数
 */
function countVisibleTurnDiffTreeRows(
  nodes: ReadonlyArray<TurnDiffTreeNode>,
  allDirectoriesExpanded: boolean,
): number {
  let count = 0;
  for (const node of nodes) {
    count += 1;
    if (allDirectoriesExpanded && node.kind === "directory") {
      count += countVisibleTurnDiffTreeRows(node.children, allDirectoriesExpanded);
    }
  }
  return count;
}

/**
 * 估算变更文件摘要的高度（带缓存）
 * @param files - 变更文件列表
 * @param allDirectoriesExpanded - 是否展开所有目录，默认 true
 * @returns 估算高度（像素）
 */
export function estimateChangedFilesSummaryHeight(
  files: ReadonlyArray<TurnDiffFileChange>,
  allDirectoriesExpanded = true,
): number {
  if (files.length === 0) return 0;

  const cacheKey = allDirectoriesExpanded ? "expanded" : "collapsed";
  const cachedHeights = changedFilesSummaryHeightCache.get(files);
  const cachedHeight = cachedHeights?.[cacheKey];
  if (typeof cachedHeight === "number") {
    return cachedHeight;
  }

  const visibleRowCount = countVisibleTurnDiffTreeRows(
    buildTurnDiffTree(files),
    allDirectoriesExpanded,
  );

  const height =
    TURN_DIFF_SUMMARY_CHROME_HEIGHT_PX +
    visibleRowCount * TURN_DIFF_TREE_ROW_HEIGHT_PX +
    Math.max(visibleRowCount - 1, 0) * TURN_DIFF_TREE_ROW_GAP_PX;
  changedFilesSummaryHeightCache.set(files, {
    ...cachedHeights,
    [cacheKey]: height,
  });

  return height;
}

/** 估算单个工作条目的高度 */
function estimateTimelineWorkEntryHeight(entry: TimelineWorkEntryHeightInput): number {
  const hasChangedFiles = (entry.changedFiles?.length ?? 0) > 0;
  const previewIsChangedFiles = hasChangedFiles && !entry.command && !entry.detail;

  return (
    WORK_ENTRY_ROW_HEIGHT_PX +
    (hasChangedFiles && !previewIsChangedFiles ? WORK_ENTRY_CHANGED_FILES_HEIGHT_PX : 0)
  );
}

/**
 * 估算工作组的高度
 * 向上偏移估算，确保快速滚动时行不会在测量前堆叠
 * @param entries - 工作条目列表
 * @param options - 估算选项
 * @returns 估算高度（像素）
 */
export function estimateTimelineWorkGroupHeight(
  entries: ReadonlyArray<TimelineWorkEntryHeightInput>,
  options: TimelineWorkGroupEstimateOptions,
): number {
  if (entries.length === 0) return WORK_GROUP_CHROME_HEIGHT_PX;

  const visibleEntries =
    options.expanded || entries.length <= options.maxVisibleEntries
      ? entries
      : entries.slice(-options.maxVisibleEntries);
  const showHeader =
    entries.length > options.maxVisibleEntries ||
    visibleEntries.some((entry) => entry.tone !== "tool");

  return (
    WORK_GROUP_CHROME_HEIGHT_PX +
    (showHeader ? WORK_GROUP_HEADER_HEIGHT_PX : 0) +
    visibleEntries.reduce((total, entry) => total + estimateTimelineWorkEntryHeight(entry), 0) +
    Math.max(visibleEntries.length - 1, 0) * WORK_ENTRY_GAP_PX
  );
}

/**
 * 估算助手消息下方行内工具预览块的高度
 * @param entries - 行内工具条目列表
 * @param options - 估算选项
 * @returns 估算高度（像素）
 */
export function estimateTimelineInlineToolPreviewHeight(
  entries: ReadonlyArray<TimelineWorkEntryHeightInput>,
  options: TimelineWorkGroupEstimateOptions,
): number {
  if (entries.length === 0) return 0;

  const visibleEntries =
    options.expanded || entries.length <= options.maxVisibleEntries
      ? entries
      : entries.slice(0, options.maxVisibleEntries);
  const hasToggle = entries.length > options.maxVisibleEntries;

  return (
    INLINE_TOOL_PREVIEW_MARGIN_TOP_PX +
    INLINE_TOOL_PREVIEW_CONTAINER_CHROME_HEIGHT_PX +
    visibleEntries.length * INLINE_TOOL_PREVIEW_ROW_HEIGHT_PX +
    Math.max(visibleEntries.length - 1, 0) * INLINE_TOOL_PREVIEW_ROW_GAP_PX +
    (hasToggle
      ? INLINE_TOOL_PREVIEW_TOGGLE_MARGIN_TOP_PX + INLINE_TOOL_PREVIEW_TOGGLE_HEIGHT_PX
      : 0)
  );
}

/**
 * 将助手消息中的行内代码片段展开为等效长度的占位字符
 * 行内代码使用等宽字体，宽度约为普通文本的 1.2 倍
 * @param text - 原始文本
 * @returns 展开行内代码后的文本
 */
function expandAssistantInlineCodeForEstimate(text: string): string {
  return text.replace(INLINE_CODE_SPAN_REGEX, (_match, code: string) =>
    "x".repeat(
      Math.max(
        code.length + 2,
        Math.ceil(
          code.length * ASSISTANT_INLINE_CODE_WIDTH_MULTIPLIER +
            ASSISTANT_INLINE_CODE_WRAP_OVERHEAD_CHARS,
        ),
      ),
    ),
  );
}

/**
 * 估算时间线消息的高度
 * 根据消息角色（用户/助手/系统）、文本内容、附件、差异摘要等综合计算
 * @param message - 消息高度估算输入
 * @param layout - 布局参数，默认时间线宽度为 null
 * @returns 估算高度（像素）
 */
export function estimateTimelineMessageHeight(
  message: TimelineMessageHeightInput,
  layout: TimelineHeightEstimateLayout = { timelineWidthPx: null },
): number {
  const chatFontSizePx = normalizeChatFontSizePx(
    layout.chatFontSizePx ?? DEFAULT_CHAT_FONT_SIZE_PX,
  );
  const lineHeightPx = getChatTranscriptLineHeightPx(chatFontSizePx);

  if (message.role === "assistant") {
    const charsPerLine = estimateCharsPerLineForAssistant(layout.timelineWidthPx, chatFontSizePx);
    const estimatedLines = estimateWrappedLineCount(
      expandAssistantInlineCodeForEstimate(message.text),
      charsPerLine,
    );
    const changedFilesHeight = estimateChangedFilesSummaryHeight(
      message.diffSummaryFiles ?? [],
      message.diffSummaryAllDirectoriesExpanded ?? true,
    );
    const inlineToolPreviewHeight = estimateTimelineInlineToolPreviewHeight(
      message.inlineToolEntries ?? [],
      {
        expanded: message.inlineToolExpanded ?? false,
        maxVisibleEntries: 4,
      },
    );
    return (
      ASSISTANT_BASE_HEIGHT_PX +
      estimatedLines * lineHeightPx +
      (message.showCompletionDivider ? COMPLETION_DIVIDER_HEIGHT_PX : 0) +
      changedFilesHeight +
      inlineToolPreviewHeight
    );
  }

  if (message.role === "user") {
    const charsPerLine = estimateCharsPerLineForUser(layout.timelineWidthPx, chatFontSizePx);
    const displayedUserMessage = deriveDisplayedUserMessageState(message.text, {
      hideImageOnlyBootstrapPrompt: (message.attachments?.length ?? 0) > 0,
    });
    const userMessagePreview = deriveUserMessagePreviewState(displayedUserMessage.visibleText);
    const renderedText =
      displayedUserMessage.contexts.length > 0
        ? [buildInlineTerminalContextText(displayedUserMessage.contexts), userMessagePreview.text]
            .filter((part) => part.length > 0)
            .join(" ")
        : userMessagePreview.text;
    const estimatedLines =
      renderedText.length > 0 ? estimateWrappedLineCount(renderedText, charsPerLine) : 0;
    const imageAttachmentCount =
      message.attachments?.filter((attachment) => attachment.type === "image").length ?? 0;
    const assistantSelectionCount =
      message.attachments?.filter((attachment) => attachment.type === "assistant-selection")
        .length ?? 0;
    const imageAttachmentHeight =
      imageAttachmentCount > 0
        ? Math.ceil(imageAttachmentCount / USER_ATTACHMENT_THUMBNAILS_PER_ROW) *
            USER_ATTACHMENT_THUMBNAIL_SIZE_PX +
          Math.max(Math.ceil(imageAttachmentCount / USER_ATTACHMENT_THUMBNAILS_PER_ROW) - 1, 0) *
            USER_ATTACHMENT_THUMBNAIL_GAP_PX
        : 0;
    const assistantSelectionHeight = assistantSelectionCount > 0 ? 40 : 0;
    const attachmentHeight =
      imageAttachmentHeight + assistantSelectionHeight > 0
        ? imageAttachmentHeight +
          assistantSelectionHeight +
          (renderedText.length > 0 ? USER_ATTACHMENT_ROW_MARGIN_BOTTOM_PX : 0)
        : 0;
    const dispatchChipHeight =
      message.dispatchMode === "steer"
        ? USER_DISPATCH_CHIP_HEIGHT_PX +
          (imageAttachmentCount > 0 || assistantSelectionCount > 0
            ? USER_DISPATCH_CHIP_WITH_MEDIA_MARGIN_BOTTOM_PX
            : USER_DISPATCH_CHIP_MARGIN_BOTTOM_PX)
        : 0;
    const toggleHeight = userMessagePreview.collapsible ? USER_MESSAGE_TOGGLE_HEIGHT_PX : 0;
    return (
      USER_BASE_HEIGHT_PX +
      estimatedLines * lineHeightPx +
      attachmentHeight +
      dispatchChipHeight +
      toggleHeight
    );
  }

  // system 消息不在聊天时间线中渲染，但保留显式分支以防时间线数据中存在
  const charsPerLine = estimateCharsPerLineForAssistant(layout.timelineWidthPx, chatFontSizePx);
  const estimatedLines = estimateWrappedLineCount(
    expandAssistantInlineCodeForEstimate(message.text),
    charsPerLine,
  );
  return ASSISTANT_BASE_HEIGHT_PX + estimatedLines * lineHeightPx;
}
