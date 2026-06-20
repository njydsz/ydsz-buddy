/**
 * @file TranscriptSelectionActionLayer.tsx
 * @description 对话选择操作浮层，根据控制器状态渲染浮动的"添加到聊天"操作按钮。
 */

import { type PendingTranscriptSelectionAction } from "./useTranscriptAssistantSelectionAction";
import { TranscriptSelectionAction } from "./TranscriptSelectionAction";

/**
 * TranscriptSelectionActionLayer 组件的属性接口
 */
interface TranscriptSelectionActionLayerProps {
  /** 待执行的选择操作（无则为 null） */
  action: PendingTranscriptSelectionAction | null;
  /** 添加到聊天的回调 */
  onAddToChat: () => void;
}

/**
 * TranscriptSelectionActionLayer 组件
 * @description 对话选择操作浮层，根据控制器状态渲染浮动的"添加到聊天"操作按钮
 * @param props.action - 待执行的选择操作
 * @param props.onAddToChat - 添加到聊天的回调
 */
export function TranscriptSelectionActionLayer(props: TranscriptSelectionActionLayerProps) {
  if (!props.action) {
    return null;
  }

  return (
    <TranscriptSelectionAction
      left={props.action.left}
      top={props.action.top}
      placement={props.action.placement}
      onAddToChat={props.onAddToChat}
    />
  );
}
