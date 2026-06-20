/**
 * @file 编辑器底部栏布局模块
 * @description 定义编辑器底部栏的响应式断点和紧凑模式判断逻辑。
 */

/** 普通操作底部栏的紧凑模式断点（像素） */
export const COMPOSER_FOOTER_COMPACT_BREAKPOINT_PX = 620;
/** 宽操作底部栏的紧凑模式断点（像素） */
export const COMPOSER_FOOTER_WIDE_ACTIONS_COMPACT_BREAKPOINT_PX = 720;

/**
 * 判断是否应使用紧凑模式的编辑器底部栏
 * @param width - 容器宽度（像素），null 时返回 false
 * @param options - 选项，hasWideActions 表示是否有宽操作按钮
 * @returns 是否使用紧凑模式
 */
export function shouldUseCompactComposerFooter(
  width: number | null,
  options?: { hasWideActions?: boolean },
): boolean {
  const breakpoint = options?.hasWideActions
    ? COMPOSER_FOOTER_WIDE_ACTIONS_COMPACT_BREAKPOINT_PX
    : COMPOSER_FOOTER_COMPACT_BREAKPOINT_PX;
  return width !== null && width < breakpoint;
}
