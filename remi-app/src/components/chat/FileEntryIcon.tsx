/**
 * @file FileEntryIcon.tsx
 * @description 文件条目图标组件，根据路径类型渲染文件夹图标或 Seti 文件类型图标，加载失败时回退到通用文件图标。
 */

import { memo, useMemo, useState } from "react";
import { getFileIconUrlForEntry } from "../../file-icons";
import { FileIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";
import { FolderClosed } from "../FolderClosed";

/**
 * FileEntryIcon 组件
 * @description 文件条目图标，根据路径类型渲染文件夹图标或 Seti 文件类型图标
 * @param props.pathValue - 文件/目录路径
 * @param props.kind - 条目类型（文件或目录）
 * @param props.theme - 当前主题（亮色/暗色）
 * @param props.className - 额外类名
 */
export const FileEntryIcon = memo(function FileEntryIcon(props: {
  pathValue: string;
  kind: "file" | "directory";
  theme: "light" | "dark";
  className?: string;
}) {
  // Match the look of the local filepath picker: directories always render the
  // outlined FolderClosed glyph rather than an extra network fetch to Seti.
  if (props.kind === "directory") {
    return (
      <FolderClosed className={cn("size-4 shrink-0 text-muted-foreground/70", props.className)} />
    );
  }

  return (
    <FileIconImage
      pathValue={props.pathValue}
      theme={props.theme}
      className={props.className ?? ""}
    />
  );
});

/** 文件图标图片子组件，加载 Seti 图标，失败时回退到通用文件图标 */
const FileIconImage = memo(function FileIconImage(props: {
  pathValue: string;
  theme: "light" | "dark";
  className: string;
}) {
  const [failedIconUrl, setFailedIconUrl] = useState<string | null>(null);
  const iconUrl = useMemo(
    () => getFileIconUrlForEntry(props.pathValue, "file", props.theme),
    [props.pathValue, props.theme],
  );

  if (failedIconUrl === iconUrl) {
    return <FileIcon className={cn("size-4 text-muted-foreground/80", props.className)} />;
  }

  return (
    <img
      src={iconUrl}
      alt=""
      aria-hidden="true"
      className={cn("size-4 shrink-0", props.className)}
      loading="lazy"
      onError={() => setFailedIconUrl(iconUrl)}
    />
  );
});
