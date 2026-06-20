/**
 * @file ComposerReferenceAttachments.tsx
 * @description 编辑器引用附件行，统一渲染助手选择摘要标签和图片附件标签。
 */

import { type ComposerImageAttachment } from "../../composerDraftStore";
import { type ChatAssistantSelectionAttachment } from "../../types";
import { type ExpandedImagePreview } from "./ExpandedImagePreview";
import { AssistantSelectionsSummaryChip } from "./AssistantSelectionsSummaryChip";
import { ComposerImageAttachmentChip } from "./ComposerImageAttachmentChip";

/**
 * ComposerReferenceAttachments 组件的属性接口
 */
interface ComposerReferenceAttachmentsProps {
  /** 助手选择附件列表 */
  assistantSelections: ReadonlyArray<ChatAssistantSelectionAttachment>;
  /** 图片附件列表 */
  images: ReadonlyArray<ComposerImageAttachment>;
  /** 未持久化的图片 ID 集合 */
  nonPersistedImageIdSet: ReadonlySet<string>;
  /** 展开图片预览的回调 */
  onExpandImage: (preview: ExpandedImagePreview) => void;
  /** 移除助手选择的回调 */
  onRemoveAssistantSelections: () => void;
  /** 移除图片的回调 */
  onRemoveImage: (imageId: string) => void;
}

/**
 * ComposerReferenceAttachments 组件
 * @description 编辑器引用附件行，统一渲染助手选择摘要标签和图片附件标签
 * @param props.assistantSelections - 助手选择附件列表
 * @param props.images - 图片附件列表
 * @param props.nonPersistedImageIdSet - 未持久化的图片 ID 集合
 * @param props.onExpandImage - 展开图片预览的回调
 * @param props.onRemoveAssistantSelections - 移除助手选择的回调
 * @param props.onRemoveImage - 移除图片的回调
 */
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
