/**
 * @file composerPickerStyles.ts
 * @description 聊天编辑器选择器的共享排版令牌，确保选择器标签字体大小与 UI 一致。
 */

/** 选择器触发按钮文本的样式类名，使用 UI-sm 令牌使标签略低于编辑器文本大小 */
export const COMPOSER_PICKER_TRIGGER_TEXT_CLASS_NAME =
  "text-[length:var(--app-font-size-ui-sm,11px)] text-[var(--color-text-foreground-secondary)] sm:text-[length:var(--app-font-size-ui-sm,11px)] font-normal hover:text-[var(--color-text-foreground)] data-pressed:text-[var(--color-text-foreground)]";
