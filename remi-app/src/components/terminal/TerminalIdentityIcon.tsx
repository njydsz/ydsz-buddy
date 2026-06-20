/**
 * @file TerminalIdentityIcon.tsx
 * @description 终端身份图标组件，根据图标键渲染对应的终端或 AI 提供商图标。
 * 属于终端展示原语层，可在所有终端界面中复用。
 */

import type { TerminalIconKey } from "~/shared/terminalThreads";

import { TerminalSquare } from "~/lib/icons";
import { cn } from "~/lib/utils";

import { ClaudeAI, OpenAI } from "../Icons";

/**
 * 终端身份图标组件的 Props 接口。
 */
interface TerminalIdentityIconProps {
  /** 图标键，决定渲染哪种图标（terminal/openai/claude 等） */
  iconKey: TerminalIconKey;
  /** 自定义样式类名 */
  className?: string;
}

/**
 * 终端身份图标组件。根据图标键渲染对应的终端图标或 AI 提供商品牌图标，
 * 可在标签栏、侧边栏等所有终端界面中复用。
 *
 * @param props.iconKey - 图标键，决定渲染哪种图标
 * @param props.className - 自定义样式类名
 */
export default function TerminalIdentityIcon({ iconKey, className }: TerminalIdentityIconProps) {
  const IconComponent =
    iconKey === "openai" ? OpenAI : iconKey === "claude" ? ClaudeAI : TerminalSquare;

  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center", className)}>
      <IconComponent
        className={cn(
          "size-full",
          iconKey === "claude"
            ? "text-foreground"
            : iconKey === "openai"
              ? "text-foreground/80"
              : "",
        )}
      />
    </span>
  );
}
