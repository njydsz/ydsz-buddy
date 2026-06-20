/**
 * @file ComposerVoiceButton.tsx
 * @description 聊天编辑器的麦克风按钮，用于开始/停止语音录制和触发转录。
 */

import { memo } from "react";

import { Loader2Icon, MicIcon } from "~/lib/icons";
import { Button } from "../ui/button";

/**
 * ComposerVoiceButton 组件
 * @description 麦克风按钮，用于开始/停止语音录制和触发转录
 * @param props.disabled - 是否禁用按钮
 * @param props.isRecording - 是否正在录制
 * @param props.isTranscribing - 是否正在转录
 * @param props.durationLabel - 录制时长标签
 * @param props.onClick - 点击回调
 */
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
