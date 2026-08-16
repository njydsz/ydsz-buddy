/**
 * @file 待处理终端上下文组件
 *
 * 本组件展示 Composer 中已经添加但尚未发送的终端上下文引用（@ Terminal Context），
 * 用户可以预览或删除单个上下文。
 *
 * ## 核心职责
 *
 * - **上下文展示**：终端 ID、命令预览、输出预览
 * - **删除操作**：移除单个上下文
 * - **快速插入**：在 Composer 中插入上下文引用
 *
 * ## 使用场景
 *
 * - Composer 中显示已选中的终端命令/输出
 * - 让 AI 引用之前的命令结果
 *
 * ## 注意事项
 *
 * - 上下文必须包含命令文本与输出
 * - 命令被截断时会显示省略号
 */

import { cn } from "~/lib/utils";
import {
  type TerminalContextDraft,
  formatTerminalContextLabel,
  isTerminalContextExpired,
} from "~/lib/terminalContext";
import { TerminalContextInlineChip } from "./TerminalContextInlineChip";

interface ComposerPendingTerminalContextsProps {
  contexts: ReadonlyArray<TerminalContextDraft>;
  className?: string;
}

interface ComposerPendingTerminalContextChipProps {
  context: TerminalContextDraft;
}

export function ComposerPendingTerminalContextChip({
  context,
}: ComposerPendingTerminalContextChipProps) {
  const label = formatTerminalContextLabel(context);
  const expired = isTerminalContextExpired(context);
  const tooltipText = expired
    ? `Terminal context expired. Remove and re-add ${label} to include it in your message.`
    : context.text;

  return <TerminalContextInlineChip label={label} tooltipText={tooltipText} expired={expired} />;
}

export function ComposerPendingTerminalContexts(props: ComposerPendingTerminalContextsProps) {
  const { contexts, className } = props;

  if (contexts.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {contexts.map((context) => (
        <ComposerPendingTerminalContextChip key={context.id} context={context} />
      ))}
    </div>
  );
}
