/**
 * @file MentionChipIcon.tsx
 * @description @提及标签的共享图标渲染器，根据路径类型选择文件夹图标、Seti 文件类型图标或插件图标。
 * 同时提供 React 组件和 DOM 元素创建函数，确保编辑器 Lexical 标签和消息标签保持一致。
 */

import { memo } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getFileIconUrlForEntry, inferEntryKindFromPath } from "~/file-icons";
import { FileIcon, PlugIcon } from "~/lib/icons";
import { COMPOSER_INLINE_MENTION_CHIP_ICON_CLASS_NAME } from "../composerInlineChip";
import { FolderClosed } from "../FolderClosed";
import { FileEntryIcon } from "./FileEntryIcon";

/** 文件夹关闭图标的 SVG 静态标记 */
const FOLDER_CLOSED_ICON_SVG = renderToStaticMarkup(
  <FolderClosed aria-hidden="true" className={COMPOSER_INLINE_MENTION_CHIP_ICON_CLASS_NAME} />,
);
/** 文件图标的 SVG 静态标记 */
const FILE_ICON_SVG = renderToStaticMarkup(
  <FileIcon aria-hidden="true" className={COMPOSER_INLINE_MENTION_CHIP_ICON_CLASS_NAME} />,
);
/** 插件图标的 SVG 静态标记 */
const PLUG_ICON_SVG = renderToStaticMarkup(
  <PlugIcon aria-hidden="true" className={COMPOSER_INLINE_MENTION_CHIP_ICON_CLASS_NAME} />,
);

/** @提及标签的类型：路径或插件 */
export type MentionChipKind = "path" | "plugin";

/**
 * 创建包含 SVG 图标的静态 span 元素
 * @param svg - SVG 标记字符串
 * @returns 包含图标的 span 元素
 */
function createStaticIconSpan(svg: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.ariaHidden = "true";
  span.className = COMPOSER_INLINE_MENTION_CHIP_ICON_CLASS_NAME;
  span.innerHTML = svg;
  return span;
}

/**
 * MentionChipIcon 组件
 * @description @提及标签的图标渲染器，根据路径类型选择文件夹、文件或插件图标
 * @param props.path - 文件/目录路径
 * @param props.theme - 当前主题（亮色/暗色）
 * @param props.kind - 标签类型（路径或插件）
 */
export const MentionChipIcon = memo(function MentionChipIcon(props: {
  path: string;
  theme: "light" | "dark";
  kind?: MentionChipKind;
}) {
  if (props.kind === "plugin" || props.path.startsWith("plugin://")) {
    return <PlugIcon className={COMPOSER_INLINE_MENTION_CHIP_ICON_CLASS_NAME} />;
  }
  const kind = inferEntryKindFromPath(props.path);
  if (kind === "directory") {
    return <FolderClosed className={COMPOSER_INLINE_MENTION_CHIP_ICON_CLASS_NAME} />;
  }
  // Delegate file rendering to FileEntryIcon so we inherit the onError
  // fallback that swaps to the Lucide FileIcon if the Seti asset is missing.
  return (
    <FileEntryIcon
      pathValue={props.path}
      kind={kind}
      theme={props.theme}
      className={COMPOSER_INLINE_MENTION_CHIP_ICON_CLASS_NAME}
    />
  );
});

/**
 * 创建 @提及标签图标的 DOM 元素（用于 Lexical 编辑器中的非 React 环境）
 * @param path - 文件/目录路径
 * @param theme - 当前主题
 * @param kind - 标签类型
 * @returns 图标的 HTMLElement
 */
export function createMentionChipIconElement(
  path: string,
  theme: "light" | "dark",
  kind: MentionChipKind = "path",
): HTMLElement {
  if (kind === "plugin" || path.startsWith("plugin://")) {
    return createStaticIconSpan(PLUG_ICON_SVG);
  }
  if (inferEntryKindFromPath(path) === "directory") {
    return createStaticIconSpan(FOLDER_CLOSED_ICON_SVG);
  }
  const image = document.createElement("img");
  image.alt = "";
  image.ariaHidden = "true";
  image.className = COMPOSER_INLINE_MENTION_CHIP_ICON_CLASS_NAME;
  image.loading = "lazy";
  image.src = getFileIconUrlForEntry(path, "file", theme);
  image.addEventListener(
    "error",
    () => {
      image.replaceWith(createStaticIconSpan(FILE_ICON_SVG));
    },
    { once: true },
  );
  return image;
}
