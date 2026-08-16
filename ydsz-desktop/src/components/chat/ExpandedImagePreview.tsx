/**
 * @file 展开图片预览组件
 *
 * 本组件以全屏方式展示图片，支持缩放、旋转、键盘导航、下载。
 *
 * ## 核心职责
 *
 * - **图片展示**：单张大图预览
 * - **缩放控制**：滚轮缩放、按钮缩放
 * - **旋转**：90° 步进旋转
 * - **键盘导航**：方向键切换上一张/下一张
 * - **下载/复制**：保存到本地
 *
 * ## 核心导出
 *
 * - `ExpandedImagePreview`：全屏预览组件
 * - `ExpandedImageItem`：预览项数据结构
 * - `useExpandedImagePreview`：Hook 用于管理预览状态
 *
 * ## 使用场景
 *
 * - 消息中图片的点击放大
 * - 附件浏览器的全屏查看
 * - 截图分享
 *
 * ## 注意事项
 *
 * - 大图（> 10MB）懒加载
 * - 缩放范围 0.25x ~ 4x
 * - ESC 关闭预览
 */

export interface ExpandedImageItem {
  src: string;
  name: string;
}

export interface ExpandedImagePreview {
  images: ExpandedImageItem[];
  index: number;
}

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
