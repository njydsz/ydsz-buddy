/**
 * @file 编辑器元数据模块
 * @description 为支持的编辑器提供统一的标签和图标解析能力。
 *              用于聊天头部和"打开方式"选择器等 UI 组件，
 *              确保新增编辑器时无需在多处重复维护编辑器列表。
 */

import { EDITORS, type EditorId } from "@remi-code/contracts";
import type { Icon } from "./components/Icons";
import {
  AntigravityIcon,
  CursorIcon,
  OpenCodeIcon,
  VisualStudioCode,
  Zed,
} from "./components/Icons";
import { FolderClosedIcon } from "./lib/icons";
import { isMacPlatform, isWindowsPlatform } from "./lib/utils";

/**
 * 编辑器选项，用于 UI 展示
 * @property value - 编辑器标识
 * @property label - 编辑器显示名称
 * @property Icon - 编辑器图标组件
 */
export interface EditorOption {
  readonly value: EditorId;
  readonly label: string;
  readonly Icon: Icon;
}

/** 编辑器 ID 到图标组件的映射，未配置的编辑器将使用默认图标 */
const EDITOR_ICONS: Partial<Record<EditorId, Icon>> = {
  cursor: CursorIcon,
  trae: OpenCodeIcon,
  vscode: VisualStudioCode,
  "vscode-insiders": VisualStudioCode,
  vscodium: VisualStudioCode,
  zed: Zed,
  antigravity: AntigravityIcon,
  idea: OpenCodeIcon,
  "file-manager": FolderClosedIcon,
};

/**
 * 解析编辑器的显示标签
 * 根据共享编辑器目录构建标签，新增编辑器无需在多处重复维护
 * @param editorId - 编辑器标识
 * @param platform - 平台标识字符串
 * @returns 编辑器的显示名称，文件管理器会根据平台返回 Finder/Explorer/Files
 */
export function resolveEditorLabel(editorId: EditorId, platform: string): string {
  if (editorId === "file-manager") {
    return isMacPlatform(platform) ? "Finder" : isWindowsPlatform(platform) ? "Explorer" : "Files";
  }

  return EDITORS.find((editor) => editor.id === editorId)?.label ?? editorId;
}

/**
 * 解析编辑器的图标组件
 * 即使品牌专用图标尚未配置，也返回默认图标以保持 UI 健壮性
 * @param editorId - 编辑器标识
 * @returns 图标组件，未匹配时返回 OpenCodeIcon
 */
export function resolveEditorIcon(editorId: EditorId): Icon {
  return EDITOR_ICONS[editorId] ?? OpenCodeIcon;
}

/**
 * 解析当前可用的编辑器选项列表
 * 根据可用编辑器列表过滤共享编辑器目录，生成包含标签和图标的完整选项
 * @param platform - 平台标识字符串
 * @param availableEditors - 当前可用的编辑器 ID 列表
 * @returns 编辑器选项数组，包含标识、标签和图标
 */
export function resolveAvailableEditorOptions(
  platform: string,
  availableEditors: ReadonlyArray<EditorId>,
): ReadonlyArray<EditorOption> {
  const availableEditorIds = new Set(availableEditors);
  return EDITORS.filter((editor) => availableEditorIds.has(editor.id)).map((editor) => ({
    value: editor.id,
    label: resolveEditorLabel(editor.id, platform),
    Icon: resolveEditorIcon(editor.id),
  }));
}
