/**
 * @file DirectoryTreePicker
 * @description 将共享的目录浏览器包装为按钮触发的弹出式选择器，
 *              用于在聊天输入区域选择本地文件夹。
 */

import type { ProjectDirectoryEntry, ProjectFileSystemEntry } from "~/contracts";
import { memo, useState } from "react";
import { FolderIcon } from "~/lib/icons";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { DirectoryTreeBrowser } from "./DirectoryTreeBrowser";

/** DirectoryTreePicker 组件的属性接口 */
interface DirectoryTreePickerProps {
  /** 目录树的根路径，为 null 时显示不可用提示 */
  rootPath: string | null;
  /** 触发按钮的显示文本 */
  triggerLabel: string;
  /** 无文件夹时的空状态提示文本 */
  emptyLabel?: string;
  /** 是否在浏览中包含文件（默认仅显示文件夹） */
  includeFiles?: boolean;
  /** 选中目录的回调，接收绝对路径和目录条目信息 */
  onSelectDirectory: (absolutePath: string, entry: ProjectDirectoryEntry) => Promise<void> | void;
}

/**
 * 目录树弹出选择器组件。
 * 以弹出面板形式展示目录浏览器，用户可浏览并选择本地文件夹。
 *
 * @param props.rootPath - 目录树的根路径
 * @param props.triggerLabel - 触发按钮的文本
 * @param props.emptyLabel - 空状态提示
 * @param props.includeFiles - 是否包含文件
 * @param props.onSelectDirectory - 选中目录的回调
 */
export const DirectoryTreePicker = memo(function DirectoryTreePicker({
  rootPath,
  triggerLabel,
  emptyLabel = "No folders found",
  includeFiles = false,
  onSelectDirectory,
}: DirectoryTreePickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button type="button" variant="outline" size="sm" />}>
        <FolderIcon className="size-4" />
        <span>{triggerLabel}</span>
      </PopoverTrigger>
      <PopoverPopup align="start" className="w-[min(32rem,calc(100vw-2rem))] p-0">
        <div className="border-b border-border/60 px-4 py-3">
          <p className="text-sm font-medium text-foreground">Start a chat from a folder</p>
          <p className="mt-1 truncate text-xs text-muted-foreground/60">
            {rootPath ?? "No home directory found"}
          </p>
        </div>
        <DirectoryTreeBrowser
          rootPath={rootPath}
          emptyLabel={emptyLabel}
          unavailableLabel="Home directory unavailable."
          loadingLabel={includeFiles ? "Loading entries\u2026" : "Loading folders\u2026"}
          className="max-h-96 overflow-auto px-2 py-2"
          includeFiles={includeFiles}
          onSelectEntry={async (absolutePath, entry: ProjectFileSystemEntry) => {
            if (entry.kind !== "directory") {
              return;
            }
            await onSelectDirectory(absolutePath, {
              path: entry.path,
              name: entry.name,
              hasChildren: entry.hasChildren ?? false,
              ...(entry.parentPath ? { parentPath: entry.parentPath } : {}),
            });
            setOpen(false);
          }}
        />
      </PopoverPopup>
    </Popover>
  );
});
