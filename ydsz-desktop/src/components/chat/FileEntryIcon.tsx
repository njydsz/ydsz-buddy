/**
 * @file 文件条目图标组件
 *
 * 本组件根据文件扩展名和 MIME 类型返回对应的文件图标：
 *
 * - **扩展名识别**：ts / tsx / js / py / rs / md / json 等
 * - **MIME 类型识别**：image / video / audio / archive
 * - **特殊文件**：.gitignore / Dockerfile / LICENSE 等
 * - **文件夹/通用图标**：作为兜底
 *
 * ## 核心导出
 *
 * - `FileEntryIcon`：图标组件
 * - `getFileIconUrlForEntry`：根据条目获取图标 URL
 *
 * ## 使用场景
 *
 * - 文件浏览器（DirectoryTreeBrowser）
 * - 文件提及（@ file）菜单
 * - ChangedFilesTree 文件行
 *
 * ## 注意事项
 *
 * - 内部缓存图标 URL（基于文件路径）
 * - 大小写不敏感的扩展名匹配
 * - 二进制文件使用通用图标
 */

import { memo, useMemo, useState } from "react";
import { getFileIconUrlForEntry } from "../../file-icons";
import { FileIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";
import { FolderClosed } from "../FolderClosed";

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
