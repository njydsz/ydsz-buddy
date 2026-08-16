// FILE: ComposerVoiceButton.tsx
// Purpose: Renders the composer mic control for recording and transcribing a voice note.
// Layer: Chat composer presentation
// Depends on: shared button styling and caller-owned voice recording state callbacks.
/**
 * @file Composer 语音按钮
 *
 * Composer 工具栏的麦克风按钮：
 *
 * - **录音中**：显示红色状态 + 停止图标
 * - **转录中**：显示 spinner
 * - **默认**：麦克风图标
 *
 * ## 核心导出
 *
 * - `ComposerVoiceButton`：主组件
 *
 * ## 使用场景
 *
 * - Composer 工具栏
 *
 * ## 注意事项
 *
 * - 状态全部通过 props 传入
 * - 录音时长通过 `durationLabel` 展示
 */
import { memo } from "react";

import { Loader2Icon, MicIcon } from "~/lib/icons";
import { Button } from "../ui/button";

export const ComposerVoiceButton = memo(function ComposerVoiceButton(props: {
  disabled?: boolean;
  isRecording: boolean;
  isTranscribing: boolean;
  durationLabel: string;
  onClick: () => void;
}) {
  const label = props.isTranscribing
    ? "Transcribing voice note"
    : props.isRecording
      ? `Stop voice note (${props.durationLabel})`
      : "Record voice note";

  return (
    <Button
      size="icon-sm"
      variant="ghost"
      className="shrink-0 rounded-md"
      disabled={props.disabled || props.isTranscribing}
      aria-label={label}
      title={label}
      onClick={props.onClick}
    >
      {props.isTranscribing ? (
        <Loader2Icon aria-hidden="true" className="size-4 animate-spin" />
      ) : (
        <MicIcon aria-hidden="true" className="size-4" />
      )}
    </Button>
  );
});
