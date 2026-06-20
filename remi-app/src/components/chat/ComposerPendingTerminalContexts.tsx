/**
 * @file ComposerPendingTerminalContexts.tsx
 * @description 编辑器中待发送的终端上下文标签列表，显示终端上下文的缩略标签和过期状态。
 */

import { cn } from "~/lib/utils";
import {
  type TerminalContextDraft,
  formatTerminalContextLabel,
  isTerminalContextExpired,
} from "~/lib/terminalContext";
import { TerminalContextInlineChip } from "./TerminalContextInlineChip";

/**
 * ComposerPendingTerminalContexts 组件的属性接口
 */
interface ComposerPendingTerminalContextsProps {
  /** 待发送的终端上下文列表 */
  contexts: ReadonlyArray<TerminalContextDraft>;
  /** 容器类名 */
  className?: string;
}

/** 单个终端上下文标签的属性接口 */
interface ComposerPendingTerminalContextChipProps {
  /** 终端上下文草稿 */
  context: TerminalContextDraft;
}

/**
 * ComposerPendingTerminalContextChip 组件
 * @description 单个终端上下文标签，显示标签文本和过期状态
 * @param props.context - 终端上下文草稿
 */
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

/**
 * ComposerPendingTerminalContexts 组件
 * @description 待发送的终端上下文标签列表
 * @param props.contexts - 终端上下文列表
 * @param props.className - 容器类名
 */
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
