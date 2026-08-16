// FILE: ComposerReferenceAttachments.tsx
// Purpose: Render assistant-selection and image composer attachments in one reusable row.
// Layer: Chat composer presentation
/**
 * @file Composer 引用附件行
 *
 * 统一展示助手选区 + 图片附件的复合行：
 *
 * - **助手选区**：通过 `AssistantSelectionsSummaryChip` 汇总
 * - **图片附件**：通过 `ComposerImageAttachmentChip` 单独展示
 * - **可点击预览**：`onExpandImage` 回调
 *
 * ## 核心导出
 *
 * - `ComposerReferenceAttachments`：主组件
 * - `ComposerReferenceAttachmentsProps`：组件 props
 *
 * ## 使用场景
 *
 * - Composer 上方附件条
 *
 * ## 注意事项
 *
 * - `nonPersistedImageIdSet` 标识尚未持久化的图片
 * - 渲染顺序：选区在前，图片在后
 */
import { type ComposerImageAttachment } from "../../composerDraftStore";
import { type ChatAssistantSelectionAttachment } from "../../types";
import { type ExpandedImagePreview } from "./ExpandedImagePreview";
import { AssistantSelectionsSummaryChip } from "./AssistantSelectionsSummaryChip";
import { ComposerImageAttachmentChip } from "./ComposerImageAttachmentChip";

interface ComposerReferenceAttachmentsProps {
  assistantSelections: ReadonlyArray<ChatAssistantSelectionAttachment>;
  images: ReadonlyArray<ComposerImageAttachment>;
  nonPersistedImageIdSet: ReadonlySet<string>;
  onExpandImage: (preview: ExpandedImagePreview) => void;
  onRemoveAssistantSelections: () => void;
  onRemoveImage: (imageId: string) => void;
}

export function ComposerReferenceAttachments({
  assistantSelections,
  images,
  nonPersistedImageIdSet,
  onExpandImage,
  onRemoveAssistantSelections,
  onRemoveImage,
}: ComposerReferenceAttachmentsProps) {
  if (assistantSelections.length === 0 && images.length === 0) {
    return null;
  }

  return (
    <div className="mb-2.5 flex flex-wrap gap-2">
      <AssistantSelectionsSummaryChip
        selections={assistantSelections}
        onRemove={assistantSelections.length > 0 ? onRemoveAssistantSelections : undefined}
      />
      {images.map((image) => (
        <ComposerImageAttachmentChip
          key={image.id}
          image={image}
          images={images}
          nonPersisted={nonPersistedImageIdSet.has(image.id)}
          onExpandImage={onExpandImage}
          onRemoveImage={onRemoveImage}
        />
      ))}
    </div>
  );
}
