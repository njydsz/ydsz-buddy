/**
 * @file 编辑器行内芯片样式模块
 * @description 共享编辑器和聊天中行内芯片的样式类名和技能标签辅助函数。
 *              包括技能芯片、附件芯片、提及芯片、Agent 芯片等样式定义。
 */

/** 行内芯片基础样式类名 */
export const COMPOSER_INLINE_CHIP_CLASS_NAME =
  "inline-flex max-w-full select-none items-center gap-0.5 rounded border border-[color:var(--color-border-light)] bg-[var(--sidebar-accent)] p-0.5 font-medium text-[11px] leading-[1.1] text-[var(--color-text-foreground)] align-middle";

/** 附件芯片样式类名（用于图片预览和文本选择等附件胶囊） */
export const COMPOSER_ATTACHMENT_CHIP_CLASS_NAME =
  "inline-flex min-w-0 max-w-full items-center gap-0.5 rounded-full border border-[color:var(--color-border)] bg-[var(--composer-surface)] p-0.5 text-[11px] font-medium text-[var(--color-text-foreground)]";

/** 文件/文件夹提及芯片样式类名（与技能芯片同色调和圆角，但更紧凑） */
export const COMPOSER_INLINE_MENTION_CHIP_CLASS_NAME =
  "inline-flex max-w-full select-none items-center gap-0.5 rounded-sm bg-[var(--info-foreground)]/10 pl-1.5 pr-2 py-0.5 text-[11px] font-medium text-[var(--info-foreground)]/80 align-middle -translate-y-px";

/** 技能芯片样式类名 */
export const COMPOSER_INLINE_SKILL_CHIP_CLASS_NAME =
  "inline-flex max-w-full select-none items-center gap-1 rounded-md bg-[var(--info)]/10 px-2 py-0.5 text-[var(--info-foreground)]/80 align-middle -translate-y-px";

/** 技能芯片图标样式类名 */
export const COMPOSER_INLINE_SKILL_CHIP_ICON_CLASS_NAME = "size-3.5 shrink-0";

/** 行内芯片图标样式类名 */
export const COMPOSER_INLINE_CHIP_ICON_CLASS_NAME = "size-3.5 shrink-0 opacity-85";

/** 提及芯片图标样式类名 */
export const COMPOSER_INLINE_MENTION_CHIP_ICON_CLASS_NAME = "size-4 shrink-0";

/** 行内芯片标签样式类名 */
export const COMPOSER_INLINE_CHIP_LABEL_CLASS_NAME = "truncate select-none leading-tight";

/** 行内芯片关闭按钮样式类名 */
export const COMPOSER_INLINE_CHIP_DISMISS_BUTTON_CLASS_NAME =
  "ml-0.5 inline-flex size-3.5 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground/72 transition-colors hover:bg-foreground/6 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/** 技能芯片图标的 SVG 字符串 */
export const COMPOSER_INLINE_SKILL_CHIP_ICON_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`;

/** Agent 提及芯片样式类名（用于 @alias 语法，颜色按模型动态应用） */
export const COMPOSER_INLINE_AGENT_CHIP_CLASS_NAME =
  "inline-flex max-w-full select-none items-center gap-1 rounded-md px-1.5 py-0.5 align-middle text-[11px] font-medium";

/** Agent 芯片图标样式类名 */
export const COMPOSER_INLINE_AGENT_CHIP_ICON_CLASS_NAME = "size-3 shrink-0";

/**
 * 将原始技能 ID 格式化为行内芯片标签
 * 将连字符和下划线分隔的 ID 转换为首字母大写的空格分隔标签
 * @param name - 原始技能 ID（如 "check-code"）
 * @returns 格式化后的标签（如 "Check Code"）
 * @example
 * ```typescript
 * formatComposerSkillChipLabel("check-code"); // "Check Code"
 * formatComposerSkillChipLabel("my_skill"); // "My Skill"
 * ```
 */
export function formatComposerSkillChipLabel(name: string): string {
  return name
    .split(/[-_]/)
    .map((segment) =>
      segment.length > 0 ? segment.charAt(0).toUpperCase() + segment.slice(1) : segment,
    )
    .join(" ");
}
