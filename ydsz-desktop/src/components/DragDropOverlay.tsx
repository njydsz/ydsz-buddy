/**
 * @file 拖拽覆盖层组件
 *
 * 本组件提供拖拽时的视觉反馈：
 *
 * - **文件信息展示**：显示文件名、大小、类型
 * - **多文件列表**：多文件拖拽时显示文件列表和总大小
 * - **文件类型图标**：根据文件类型显示对应图标
 * - **警告提示**：不支持的文件类型显示警告
 * - **平滑动画**：使用 CSS 过渡实现淡入淡出效果
 *
 * ## 核心导出
 *
 * - `DragDropOverlay`: 拖拽覆盖层组件
 *
 * ## 使用场景
 *
 * - Composer 输入框的文件拖拽预览
 * - 拖拽文件时显示文件信息
 * - 多文件拖拽时显示文件列表
 *
 * ## 注意事项
 *
 * - 需要配合 useEnhancedDragDrop Hook 使用
 * - 支持减少动画偏好（prefers-reduced-motion）
 * - 使用绝对定位覆盖目标区域
 */

import { type FileInfo, formatFileSize, getCategoryLabel, isLargeFileForConfirmation, listLargeFilesForConfirmation, summarizeFileCategoryDistribution } from "~/lib/fileUtils";
import { type DragState } from "~/hooks/useEnhancedDragDrop";
import { cn } from "~/lib/utils";
import { useReducedMotion } from "~/hooks/useReducedMotion";
import {
  File,
  Folder,
  Image,
  Video,
  Music,
  FileText,
  Archive,
  Code,
  Database,
  AlertCircle,
} from "lucide-react";

/**
 * 文件图标映射
 */
const FILE_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  image: Image,
  video: Video,
  music: Music,
  "file-text": FileText,
  archive: Archive,
  code: Code,
  database: Database,
  file: File,
};

/**
 * 获取文件图标组件
 *
 * @param iconName - 图标名称
 * @returns 图标组件
 */
function getFileIcon(iconName: string): React.ComponentType<{ className?: string }> {
  return FILE_ICON_MAP[iconName] ?? File;
}

/**
 * 拖拽覆盖层属性
 */
export interface DragDropOverlayProps {
  /** 拖拽状态 */
  dragState: DragState;
  /** 自定义类名 */
  className?: string;
}

/**
 * 单个文件信息卡片
 */
function FileCard({ file }: { file: FileInfo }) {
  const Icon = getFileIcon(file.icon);
  const categoryLabel = getCategoryLabel(file.category);

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-background/80 p-3 backdrop-blur-sm",
        file.supported
          ? "border-border/50 shadow-sm"
          : "border-destructive/50 bg-destructive/5",
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-md",
          file.supported ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive",
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">{file.name}</div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{categoryLabel}</span>
          <span>•</span>
          <span>{formatFileSize(file.size)}</span>
          {!file.supported && (
            <>
              <span>•</span>
              <span className="flex items-center gap-1 text-destructive">
                <AlertCircle className="h-3 w-3" />
                不支持
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 多文件列表
 */
function FileList({ files, totalSize }: { files: FileInfo[]; totalSize: number }) {
  const displayFiles = files.slice(0, 3);
  const remainingCount = files.length - displayFiles.length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{files.length} 个文件</span>
        <span>总计 {formatFileSize(totalSize)}</span>
      </div>
      <div className="space-y-2">
        {displayFiles.map((file, index) => (
          <FileCard key={`${file.name}-${index}`} file={file} />
        ))}
        {remainingCount > 0 && (
          <div className="rounded-lg border border-border/50 bg-background/60 p-3 text-center text-sm text-muted-foreground backdrop-blur-sm">
            还有 {remainingCount} 个文件...
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 警告提示
 */
function WarningBanner({ files }: { files: FileInfo[] }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <div className="font-medium">不支持的文件类型</div>
        <div className="mt-1 text-xs">
          {files.length === 1
            ? `"${files[0]?.name}" 不受支持`
            : `${files.length} 个文件不受支持`}
        </div>
      </div>
    </div>
  );
}

/**
 * C-6 文件类型分布摘要
 * 在拖入多文件时展示 "图片 3 · 文档 2 · 视频 1"
 */
function CategoryDistribution({
  distribution,
}: {
  distribution: ReturnType<typeof summarizeFileCategoryDistribution>;
}) {
  if (distribution.length === 0) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-1.5 text-xs"
      data-testid="drag-drop-category-distribution"
    >
      {distribution.map((entry) => (
        <span
          key={entry.category}
          className="inline-flex items-center gap-1 rounded-md border border-border/40 bg-background/60 px-2 py-0.5"
        >
          <span className="text-muted-foreground">{getCategoryLabel(entry.category)}</span>
          <span className="font-medium text-foreground">{entry.count}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * C-6 大文件警告条
 * 单文件 > 50MB 时提示用户"作为附件 / 跳过"
 */
function LargeFileWarning({ files }: { files: FileInfo[] }) {
  if (files.length === 0) return null;
  return (
    <div
      className="flex items-start gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300"
      data-testid="drag-drop-large-file-warning"
      data-large-file-count={files.length}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <div className="font-medium">
          {files.length === 1
            ? `大文件警告：${files[0]?.name} (${formatFileSize(files[0]?.size ?? 0)})`
            : `${files.length} 个文件超过 50MB`}
        </div>
        <div className="mt-1 text-xs">
          {files.length === 1
            ? "该文件将作为附件上传，确认继续？"
            : "大文件将作为附件上传，drop 时会再次确认"}
        </div>
      </div>
    </div>
  );
}

/**
 * C-6 目录拖入提示
 * 在拖入条目中检测到目录时,提示用户"包含 N 个文件夹,释放后会询问是否展开"
 */
function DirectoryDragHint({ count, names }: { count: number; names: string[] }) {
  if (count === 0) return null;
  const preview = names.slice(0, 2).join("、");
  const more = names.length > 2 ? ` 等 ${names.length} 个文件夹` : "";
  return (
    <div
      className="flex items-start gap-2 rounded-lg border border-sky-500/50 bg-sky-500/10 p-3 text-sm text-sky-700 dark:text-sky-300"
      data-testid="drag-drop-directory-hint"
      data-directory-count={count}
    >
      <Folder className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <div className="font-medium">
          包含 {count} 个文件夹
        </div>
        <div className="mt-1 text-xs">
          {preview}
          {more}
          {preview ? "，释放后会询问是否全部展开" : "释放后会询问是否全部展开"}
        </div>
      </div>
    </div>
  );
}

/**
 * 拖拽覆盖层组件
 *
 * @param props - 组件属性
 * @returns React 组件
 *
 * @example
 * ```tsx
 * const { dragState, handleDragEnter, handleDragOver, handleDragLeave, handleDrop } =
 *   useEnhancedDragDrop({
 *     onFilesDrop: (files) => console.log(files),
 *   });
 *
 * return (
 *   <div
 *     onDragEnter={handleDragEnter}
 *     onDragOver={handleDragOver}
 *     onDragLeave={handleDragLeave}
 *     onDrop={handleDrop}
 *     className="relative"
 *   >
 *     <Editor />
 *     {dragState.isDragging && <DragDropOverlay dragState={dragState} />}
 *   </div>
 * );
 * ```
 */
export function DragDropOverlay({ dragState, className }: DragDropOverlayProps) {
  const prefersReducedMotion = useReducedMotion();

  if (!dragState.isDragging) {
    return null;
  }

  const hasFiles = dragState.files.length > 0;
  const hasUnsupported = dragState.hasUnsupported;
  // C-6: 文件类型分布（仅在拖入文件时计算）
  const distribution = hasFiles ? summarizeFileCategoryDistribution(dragState.files) : [];
  // C-6: 大文件警告（> 50MB）
  const largeFiles = hasFiles ? listLargeFilesForConfirmation(dragState.files) : [];
  // C-6: 目录拖入提示
  const directorySummary = dragState.directorySummary ?? { count: 0, names: [] };

  return (
    <div
      className={cn(
        "absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm",
        className,
      )}
      style={{
        animation: prefersReducedMotion ? "none" : "fadeIn 200ms ease-out",
      }}
    >
      <div className="w-full max-w-md space-y-4 p-6">
        {/* 标题 */}
        <div className="text-center">
          <h3 className="text-lg font-semibold text-foreground">
            {hasFiles
              ? directorySummary.count > 0
                ? "拖入文件 / 文件夹"
                : "拖拽文件"
              : "拖拽内容"}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasFiles
              ? `共 ${dragState.files.length} 个条目${
                  directorySummary.count > 0
                    ? `，含 ${directorySummary.count} 个文件夹`
                    : ""
                }，总计 ${formatFileSize(dragState.totalSize)}`
              : dragState.urls.length > 0
                ? `检测到 ${dragState.urls.length} 个链接`
                : "释放以添加内容"}
          </p>
        </div>

        {/* C-6: 目录拖入提示 */}
        {hasFiles && directorySummary.count > 0 ? (
          <DirectoryDragHint
            count={directorySummary.count}
            names={directorySummary.names}
          />
        ) : null}

        {/* C-6: 文件类型分布（多文件拖入时显示） */}
        {hasFiles && distribution.length > 1 ? (
          <CategoryDistribution distribution={distribution} />
        ) : null}

        {/* C-6: 大文件警告条 */}
        {hasFiles && isLargeFileForConfirmation(dragState.files) ? (
          <LargeFileWarning files={largeFiles} />
        ) : null}

        {/* 文件列表 */}
        {hasFiles && (
          <>
            {hasUnsupported && <WarningBanner files={dragState.unsupportedFiles} />}
            {dragState.files.length === 1 ? (
              <FileCard file={dragState.files[0]!} />
            ) : (
              <FileList files={dragState.files} totalSize={dragState.totalSize} />
            )}
          </>
        )}

        {/* URL 列表 */}
        {!hasFiles && dragState.urls.length > 0 && (
          <div className="space-y-2">
            {dragState.urls.map((url, index) => (
              <div
                key={`${url}-${index}`}
                className="truncate rounded-lg border border-border/50 bg-background/80 p-3 text-sm text-foreground backdrop-blur-sm"
              >
                {url}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 动画样式 */}
      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
