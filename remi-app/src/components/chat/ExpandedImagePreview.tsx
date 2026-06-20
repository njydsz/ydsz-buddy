/**
 * @file ExpandedImagePreview.tsx
 * @description 展开图片预览的数据模型和构建函数，定义图片预览项和预览集合的结构。
 */

/** 展开图片预览中的单个图片项 */
export interface ExpandedImageItem {
  /** 图片源 URL */
  src: string;
  /** 图片名称 */
  name: string;
}

/** 展开图片预览集合，包含图片列表和当前选中索引 */
export interface ExpandedImagePreview {
  /** 图片项列表 */
  images: ExpandedImageItem[];
  /** 当前选中的图片索引 */
  index: number;
}

/**
 * 从图片列表构建展开图片预览数据
 * @param images - 图片列表，每项包含 id、name 和可选的 previewUrl
 * @param selectedImageId - 选中的图片 ID
 * @returns 预览数据，无可预览图片时返回 null
 */
export function buildExpandedImagePreview(
  images: ReadonlyArray<{ id: string; name: string; previewUrl?: string }>,
  selectedImageId: string,
): ExpandedImagePreview | null {
  const previewableImages = images.flatMap((image) =>
    image.previewUrl ? [{ id: image.id, src: image.previewUrl, name: image.name }] : [],
  );
  if (previewableImages.length === 0) {
    return null;
  }
  const selectedIndex = previewableImages.findIndex((image) => image.id === selectedImageId);
  if (selectedIndex < 0) {
    return null;
  }
  return {
    images: previewableImages.map((image) => ({
      src: image.src,
      name: image.name,
    })),
    index: selectedIndex,
  };
}
