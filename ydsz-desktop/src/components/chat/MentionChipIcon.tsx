// FILE: MentionChipIcon.tsx
// Purpose: Shared icon renderer for file/folder mention chips. Picks between
//          the outlined folder glyph and the Seti file-type icon so the
//          composer Lexical chip (DOM) and the sent-message chip (React)
//          stay in sync.
// Layer: UI shared component/helper
// Exports: MentionChipIcon, createMentionChipIconElement
/**
 * @file 提及芯片图标
 *
 * 文件/文件夹提及芯片的图标渲染器：
 *
 * - **文件夹**：使用 `HiOutlineFolderOpen`
 * - **文件**：使用 Seti 风格文件类型图标
 * - **双形态**：支持 Lexical DOM chip + React chip
 * - **静态 markup**：`createMentionChipIconElement` 用于 DOM 场景
 *
 * ## 核心导出
 *
 * - `MentionChipIcon`：主组件
 * - `createMentionChipIconElement`：返回 HTML 字符串
 *
 * ## 使用场景
 *
 * - Composer @ mention 芯片
 * - 已发送消息中的引用芯片
 *
 * ## 注意事项
 *
 * - DOM 字符串用于 Lexical 节点属性
 * - 颜色与 Seti 主题保持一致
 */
import { memo } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BookText } from "lucide-react";
import { getFileIconUrlForEntry, inferEntryKindFromPath } from "~/file-icons";
import { FileIcon, PlugIcon } from "~/lib/icons";
import { COMPOSER_INLINE_MENTION_CHIP_ICON_CLASS_NAME } from "../composerInlineChip";
import { FolderClosed } from "../FolderClosed";
import { FileEntryIcon } from "./FileEntryIcon";

const FOLDER_CLOSED_ICON_SVG = renderToStaticMarkup(
  <FolderClosed aria-hidden="true" className={COMPOSER_INLINE_MENTION_CHIP_ICON_CLASS_NAME} />,
);
const FILE_ICON_SVG = renderToStaticMarkup(
  <FileIcon aria-hidden="true" className={COMPOSER_INLINE_MENTION_CHIP_ICON_CLASS_NAME} />,
);
const PLUG_ICON_SVG = renderToStaticMarkup(
  <PlugIcon aria-hidden="true" className={COMPOSER_INLINE_MENTION_CHIP_ICON_CLASS_NAME} />,
);
const WIKI_ICON_SVG = renderToStaticMarkup(
  <BookText aria-hidden="true" className={COMPOSER_INLINE_MENTION_CHIP_ICON_CLASS_NAME} />,
);

export type MentionChipKind = "path" | "plugin" | "wiki";

function createStaticIconSpan(svg: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.ariaHidden = "true";
  span.className = COMPOSER_INLINE_MENTION_CHIP_ICON_CLASS_NAME;
  span.innerHTML = svg;
  return span;
}

export const MentionChipIcon = memo(function MentionChipIcon(props: {
  path: string;
  theme: "light" | "dark";
  kind?: MentionChipKind;
}) {
  if (props.kind === "plugin" || props.path.startsWith("plugin://")) {
    return <PlugIcon className={COMPOSER_INLINE_MENTION_CHIP_ICON_CLASS_NAME} />;
  }
  if (props.kind === "wiki" || props.path.startsWith("wiki://")) {
    return <BookText className={COMPOSER_INLINE_MENTION_CHIP_ICON_CLASS_NAME} />;
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

export function createMentionChipIconElement(
  path: string,
  theme: "light" | "dark",
  kind: MentionChipKind = "path",
): HTMLElement {
  if (kind === "plugin" || path.startsWith("plugin://")) {
    return createStaticIconSpan(PLUG_ICON_SVG);
  }
  if (kind === "wiki" || path.startsWith("wiki://")) {
    return createStaticIconSpan(WIKI_ICON_SVG);
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
