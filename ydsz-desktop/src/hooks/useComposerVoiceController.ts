/**
 * @module useComposerVoiceController
 * @description 管理编辑器语音笔记的状态机，包括录音、取消和语音转文字的完整生命周期。
 * 将异步转写逻辑从 ChatView 组件中抽离，使 ChatView 保持 UI 聚焦。
 */

import { type ProviderKind, type ServerProviderStatus, type ThreadId } from "~/contracts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Project } from "../types";
import { formatVoiceRecordingDuration, useVoiceRecorder } from "../lib/voiceRecorder";
import { readNativeApi } from "../nativeApi";
import { toastManager } from "../components/ui/toast";
import {
  deriveComposerVoiceState,
  describeVoiceRecordingStartError,
  isVoiceAuthExpiredMessage,
  sanitizeVoiceErrorMessage,
} from "../components/ChatView.logic";

/** useComposerVoiceController hook 的配置选项 */
interface UseComposerVoiceControllerOptions {
  /** 当前激活的项目 */
  activeProject: Project | undefined;
  /** 当前激活的线程 ID */
  activeThreadId: ThreadId | null;
  /** 当前线程 ID */
  threadId: ThreadId;
  /** 当前选中的服务提供者类型 */
  selectedProvider: ProviderKind;
  /** 当前服务提供者的状态信息 */
  activeProviderStatus: ServerProviderStatus | null;
  /** 待处理的用户输入数量 */
  pendingUserInputCount: number;
  /** 语音转写完成后的回调，接收转写文本 */
  onTranscriptReady: (transcript: string) => void;
  /** 刷新语音状态的回调 */
  refreshVoiceStatus: () => void;
  /** 是否启用语音智能润色 */
  voicePolishEnabled?: boolean;
}

/** useComposerVoiceController hook 的返回结果 */
interface UseComposerVoiceControllerResult {
  /** 是否正在录音 */
  isVoiceRecording: boolean;
  /** 是否正在转写语音 */
  isVoiceTranscribing: boolean;
  /** 语音波形级别数据 */
  voiceWaveformLevels: readonly number[];
  /** 录音时长的格式化标签 */
  voiceRecordingDurationLabel: string;
  /** 是否显示语音笔记控件 */
  showVoiceNotesControl: boolean;
  /** 开始语音录音 */
  startComposerVoiceRecording: () => Promise<void>;
  /** 提交语音录音（停止录音并转写） */
  submitComposerVoiceRecording: () => Promise<void>;
  /** 取消语音录音 */
  cancelComposerVoiceRecording: () => void;
}

/**
 * 编辑器语音控制器 hook。
 * 管理语音笔记的录音、提交转写和取消操作，将异步转写生命周期从 ChatView 中解耦。
 *
 * @param options - hook 配置选项
 * @returns 语音控制器的状态和操作方法
 */
export function useComposerVoiceController(
  options: UseComposerVoiceControllerOptions,
): UseComposerVoiceControllerResult {
  const {
    activeProject,
    activeThreadId,
    threadId,
    selectedProvider,
    activeProviderStatus,
    pendingUserInputCount,
    onTranscriptReady,
    refreshVoiceStatus,
    voicePolishEnabled = true,
  } = options;
  const {
    isRecording: isVoiceRecording,
    durationMs: voiceRecordingDurationMs,
    waveformLevels: voiceWaveformLevels,
    startRecording: startVoiceRecording,
    stopRecording: stopVoiceRecording,
    cancelRecording: cancelVoiceRecording,
  } = useVoiceRecorder();
  const [isVoiceTranscribing, setIsVoiceTranscribing] = useState(false);
  const voiceTranscriptionRequestIdRef = useRef(0);
  const voiceThreadIdRef = useRef(threadId);
  const voiceProviderRef = useRef<ProviderKind>(selectedProvider);
  voiceThreadIdRef.current = threadId;
  voiceProviderRef.current = selectedProvider;

  const voiceRecordingDurationLabel = useMemo(
    () => formatVoiceRecordingDuration(voiceRecordingDurationMs),
    [voiceRecordingDurationMs],
  );
  const { canStartVoiceNotes, showVoiceNotesControl } = useMemo(
    () =>
      deriveComposerVoiceState({
        authStatus: activeProviderStatus?.authStatus,
        voiceTranscriptionAvailable: activeProviderStatus?.voiceTranscriptionAvailable,
        isRecording: isVoiceRecording,
        isTranscribing: isVoiceTranscribing,
      }),
    [
      activeProviderStatus?.authStatus,
      activeProviderStatus?.voiceTranscriptionAvailable,
      isVoiceRecording,
      isVoiceTranscribing,
    ],
  );

  useEffect(() => {
    voiceTranscriptionRequestIdRef.current += 1;
    void cancelVoiceRecording();
    setIsVoiceTranscribing(false);
  }, [cancelVoiceRecording, threadId]);

  useEffect(() => {
    if (canStartVoiceNotes || !isVoiceRecording) {
      return;
    }
    voiceTranscriptionRequestIdRef.current += 1;
    void cancelVoiceRecording();
    setIsVoiceTranscribing(false);
  }, [canStartVoiceNotes, cancelVoiceRecording, isVoiceRecording]);

  const startComposerVoiceRecording = useCallback(async () => {
    if (!activeProject) {
      return;
    }
    if (activeProviderStatus?.authStatus === "unauthenticated") {
      toastManager.add({
        type: "error",
        title: "Sign in to ChatGPT in Codex before using voice notes.",
      });
      return;
    }
    if (!canStartVoiceNotes) {
      toastManager.add({
        type: "error",
        title: "Voice notes require a ChatGPT-authenticated Codex session.",
      });
      return;
    }
    if (pendingUserInputCount > 0) {
      toastManager.add({
        type: "error",
        title: "Answer plan questions before recording a voice note.",
      });
      return;
    }

    try {
      await startVoiceRecording();
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not start recording",
        description: describeVoiceRecordingStartError(error),
      });
    }
  }, [
    activeProject,
    activeProviderStatus?.authStatus,
    canStartVoiceNotes,
    pendingUserInputCount,
    startVoiceRecording,
  ]);

  const submitComposerVoiceRecording = useCallback(async () => {
    if (!activeProject || !isVoiceRecording) {
      return;
    }

    const api = readNativeApi();
    if (!api) {
      toastManager.add({
        type: "error",
        title: "Voice transcription is unavailable right now.",
      });
      void cancelVoiceRecording();
      return;
    }

    setIsVoiceTranscribing(true);
    const requestId = voiceTranscriptionRequestIdRef.current + 1;
    voiceTranscriptionRequestIdRef.current = requestId;
    const requestThreadId = threadId;
    const requestProvider = selectedProvider;
    const isCurrentVoiceRequest = () =>
      voiceTranscriptionRequestIdRef.current === requestId &&
      voiceThreadIdRef.current === requestThreadId &&
      voiceProviderRef.current === requestProvider;

    try {
      const payload = await stopVoiceRecording();
      if (!isCurrentVoiceRequest()) {
        return;
      }
      if (!payload) {
        toastManager.add({
          type: "warning",
          title: "No audio was captured.",
        });
        return;
      }
      const result = await api.server.transcribeVoice({
        provider: "codex",
        cwd: activeProject.cwd,
        ...(activeThreadId ? { threadId: activeThreadId } : {}),
        ...payload,
      });
      if (!isCurrentVoiceRequest()) {
        return;
      }
      let finalText = result.text;
      if (voicePolishEnabled && finalText.trim().length > 0) {
        try {
          const polished = await api.server.voicePolishText({
            text: finalText,
            enabled: true,
            removeFillerWords: true,
            fixGrammar: true,
            addStructure: false,
            targetLanguage: "zh",
          });
          if (polished.text && polished.text !== finalText) {
            finalText = polished.text;
          }
        } catch (polishError) {
          // 润色失败不阻塞转写结果，继续使用原始文本
          // eslint-disable-next-line no-console
          console.warn("Voice polish failed, using raw transcript:", polishError);
        }
      }
      onTranscriptReady(finalText);
    } catch (error) {
      if (!isCurrentVoiceRequest()) {
        return;
      }

      const description =
        error instanceof Error
          ? sanitizeVoiceErrorMessage(error.message)
          : "The voice note could not be transcribed.";
      const authExpired = isVoiceAuthExpiredMessage(description);
      if (authExpired) {
        refreshVoiceStatus();
      }
      toastManager.add({
        type: "error",
        title: authExpired ? "Sign in to ChatGPT again" : "Voice transcription failed",
        description: authExpired
          ? "Voice transcription uses your ChatGPT session in Codex. That session was rejected, so sign in again there and retry."
          : description,
        ...(authExpired
          ? {
              actionProps: {
                children: "Refresh status",
                onClick: refreshVoiceStatus,
              },
            }
          : {}),
      });
    } finally {
      if (isCurrentVoiceRequest()) {
        setIsVoiceTranscribing(false);
      }
    }
  }, [
    activeProject,
    activeThreadId,
    cancelVoiceRecording,
    isVoiceRecording,
    onTranscriptReady,
    refreshVoiceStatus,
    selectedProvider,
    stopVoiceRecording,
    threadId,
    voicePolishEnabled,
  ]);

  const cancelComposerVoiceRecording = useCallback(() => {
    voiceTranscriptionRequestIdRef.current += 1;
    setIsVoiceTranscribing(false);
    void cancelVoiceRecording();
  }, [cancelVoiceRecording]);

  return {
    isVoiceRecording,
    isVoiceTranscribing,
    voiceWaveformLevels,
    voiceRecordingDurationLabel,
    showVoiceNotesControl,
    startComposerVoiceRecording,
    submitComposerVoiceRecording,
    cancelComposerVoiceRecording,
  };
}
