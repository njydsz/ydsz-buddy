// FILE: ComposerImageAttachmentChip.tsx
// Purpose: Renders filename-first composer image attachments as compact pills with preview/remove actions.
// Layer: Chat composer presentation
// Depends on: composer draft image metadata, shared chip styles, and expanded image preview helpers.
/**
 * @file Composer 图片附件芯片
 *
 * Composer 中图片附件的胶囊化展示：
 *
 * - **文件名优先**：以文件名为主要标识
 * - **预览/移除**：点击预览、×按钮移除
 * - **共享样式**：使用 `COMPOSER_ATTACHMENT_CHIP_CLASS_NAME`
 * - **错误态**：当图片无法加载时给出警告图标
 *
 * ## 核心导出
 *
 * - `ComposerImageAttachmentChip`：主组件
 *
 * ## 使用场景
 *
 * - Composer 上方附件条
 *
 * ## 注意事项
 *
 * - 预览通过 `buildExpandedImagePreview` 构造
 * - 大小写：使用 `useMemo` 减少重算
 */
import { memo } from "react";
import { type ComposerImageAttachment } from "../../composerDraftStore";
import { CircleAlertIcon, XIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  COMPOSER_ATTACHMENT_CHIP_CLASS_NAME,
  COMPOSER_INLINE_CHIP_DISMISS_BUTTON_CLASS_NAME,
} from "../composerInlineChip";
import { buildExpandedImagePreview, type ExpandedImagePreview } from "./ExpandedImagePreview";

interface ComposerImageAttachmentChipProps {
  image: ComposerImageAttachment;
  images: readonly ComposerImageAttachment[];
  nonPersisted: boolean;
  onExpandImage: (preview: ExpandedImagePreview) => void;
  onRemoveImage: (imageId: string) => void;
}

export const ComposerImageAttachmentChip = memo(function ComposerImageAttachmentChip({
  image,
  images,
  nonPersisted,
  onExpandImage,
  onRemoveImage,
}: ComposerImageAttachmentChipProps) {
  return (
    <div className={COMPOSER_ATTACHMENT_CHIP_CLASS_NAME}>
      <button
        type="button"
        className="flex min-w-0 max-w-[232px] items-center gap-1.5 rounded-full py-0 pl-0 pr-0.5 text-left transition-colors hover:bg-(--color-background-button-secondary-hover) focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        aria-label={`Preview ${image.name}`}
        onClick={() => {
          const preview = buildExpandedImagePreview(images, image.id);
          if (!preview) return;
          onExpandImage(preview);
        }}
      >
        <span className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full border border-(--color-border-light) bg-(--color-background-elevated-secondary)">
          {image.previewUrl ? (
            <img src={image.previewUrl} alt={image.name} className="size-full object-cover" />
          ) : (
            <span className="px-1 text-[9px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
              IMG
            </span>
          )}
        </span>
        <span className="min-w-0 truncate text-[12px] font-medium text-foreground/84">
          {image.name}
        </span>
      </button>

      {nonPersisted && (
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                role="img"
                aria-label="Draft attachment may not persist"
                className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-amber-600"
              >
                <CircleAlertIcon className="size-3" />
              </span>
            }
          />
          <TooltipPopup side="top" className="max-w-64 whitespace-normal leading-tight">
            Draft attachment could not be saved locally and may be lost on navigation.
          </TooltipPopup>
        </Tooltip>
      )}

      <button
        type="button"
        className={cn(
          COMPOSER_INLINE_CHIP_DISMISS_BUTTON_CLASS_NAME,
          "size-5 rounded-full text-muted-foreground/62 hover:bg-(--color-background-button-secondary-hover) hover:text-foreground",
        )}
        onClick={() => onRemoveImage(image.id)}
        aria-label={`Remove ${image.name}`}
      >
        <XIcon className="size-3" />
      </button>
    </div>
  );
});
