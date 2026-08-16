/**
 * @file 语音录制器
 * @description 在浏览器中捕获麦克风音频并归一化为 Remodex 风格的 WAV 片段，
 *              提供录音控制、波形可视化、时长格式化等功能。
 *              依赖浏览器 MediaDevices API、Web Audio API 和 FileReader 进行 Base64 编码。
 */

import { useCallback, useEffect, useRef, useState } from "react";

/** 目标采样率（24kHz） */
const TARGET_SAMPLE_RATE = 24_000;
/** 音频处理缓冲区大小 */
const BUFFER_SIZE = 4_096;

/** 语音录制载荷，包含 Base64 编码的 WAV 音频和元数据 */
export interface VoiceRecordingPayload {
  /** Base64 编码的 WAV 音频数据 */
  readonly audioBase64: string;
  /** MIME 类型，固定为 "audio/wav" */
  readonly mimeType: "audio/wav";
  /** 采样率（Hz） */
  readonly sampleRateHz: number;
  /** 录制时长（毫秒） */
  readonly durationMs: number;
}

/** 录制器运行时状态，包含音频上下文、节点和缓冲区 */
interface RecorderRuntime {
  /** 音频上下文 */
  readonly audioContext: AudioContext;
  /** 媒体流源节点 */
  readonly sourceNode: MediaStreamAudioSourceNode;
  /** 脚本处理器节点 */
  readonly processorNode: ScriptProcessorNode;
  /** 静音增益节点（用于抑制本地回放） */
  readonly silentGainNode: GainNode;
  /** 媒体流 */
  readonly stream: MediaStream;
  /** 音频数据块列表 */
  readonly chunks: Float32Array[];
  /** 录制开始时间戳 */
  readonly startedAt: number;
  /** 实际采样率 */
  sampleRateHz: number;
}

/** 波形可视化最大采样点数 */
const MAX_WAVEFORM_SAMPLES = 160;

/**
 * 格式化语音录制时长
 *
 * @param durationMs - 录制时长（毫秒）
 * @returns 格式化后的时长字符串（如 "1:05"）
 */
export function formatVoiceRecordingDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * 语音录制器 React Hook
 *
 * 提供麦克风录音的完整生命周期管理，包括：
 * - 开始/停止/取消录制
 * - 实时波形可视化数据
 * - 录制时长追踪
 * - 自动重采样至 24kHz 并编码为 16-bit 单声道 WAV
 *
 * @returns 录制器状态和控制方法
 * @returns isRecording - 是否正在录制
 * @returns durationMs - 当前录制时长（毫秒）
 * @returns waveformLevels - 波形可视化电平数组
 * @returns startRecording - 开始录制
 * @returns stopRecording - 停止录制并返回 WAV 载荷
 * @returns cancelRecording - 取消录制（丢弃数据）
 */
export function useVoiceRecorder() {
  const runtimeRef = useRef<RecorderRuntime | null>(null);
  const timerRef = useRef<number | null>(null);
  const waveformLevelsRef = useRef<number[]>([]);
  const waveformLastEmitAtRef = useRef(0);
  const [isRecording, setIsRecording] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const [waveformLevels, setWaveformLevels] = useState<number[]>([]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const teardownRuntime = useCallback(async () => {
    const runtime = runtimeRef.current;
    runtimeRef.current = null;
    clearTimer();
    setIsRecording(false);

    if (!runtime) {
      setDurationMs(0);
      return null;
    }

    runtime.processorNode.onaudioprocess = null;
    runtime.sourceNode.disconnect();
    runtime.processorNode.disconnect();
    runtime.silentGainNode.disconnect();
    runtime.stream.getTracks().forEach((track) => track.stop());
    await runtime.audioContext.close().catch(() => undefined);

    const sampleRateHz = runtime.sampleRateHz;
    const duration = Math.max(0, performance.now() - runtime.startedAt);
    setDurationMs(0);

    return {
      chunks: runtime.chunks,
      sampleRateHz,
      durationMs: duration,
    };
  }, [clearTimer]);

  const startRecording = useCallback(async () => {
    if (runtimeRef.current) {
      throw new Error("Voice recording is already running.");
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone recording is unavailable in this browser.");
    }

    let stream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;
    let sourceNode: MediaStreamAudioSourceNode | null = null;
    let processorNode: ScriptProcessorNode | null = null;
    let silentGainNode: GainNode | null = null;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      audioContext = new AudioContext();
      await audioContext.resume();

      sourceNode = audioContext.createMediaStreamSource(stream);
      processorNode = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);
      silentGainNode = audioContext.createGain();
      silentGainNode.gain.value = 0;

      const runtime: RecorderRuntime = {
        audioContext,
        sourceNode,
        processorNode,
        silentGainNode,
        stream,
        chunks: [],
        startedAt: performance.now(),
        sampleRateHz: audioContext.sampleRate,
      };

      processorNode.onaudioprocess = (event) => {
        const inputBuffer = event.inputBuffer;
        const channelCount = inputBuffer.numberOfChannels;
        const frameCount = inputBuffer.length;
        const monoSamples = new Float32Array(frameCount);

        for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
          const channelData = inputBuffer.getChannelData(channelIndex);
          for (let sampleIndex = 0; sampleIndex < frameCount; sampleIndex += 1) {
            monoSamples[sampleIndex] =
              (monoSamples[sampleIndex] ?? 0) + (channelData[sampleIndex] ?? 0);
          }
        }

        const normalizer = channelCount > 0 ? channelCount : 1;
        for (let sampleIndex = 0; sampleIndex < frameCount; sampleIndex += 1) {
          monoSamples[sampleIndex] = (monoSamples[sampleIndex] ?? 0) / normalizer;
        }

        runtime.chunks.push(monoSamples);

        const rmsLevel = Math.min(
          1,
          Math.sqrt(
            monoSamples.reduce((sum, sample) => sum + sample * sample, 0) /
              Math.max(1, monoSamples.length),
          ) * 3.2,
        );
        const now = performance.now();
        if (now - waveformLastEmitAtRef.current >= 45) {
          waveformLastEmitAtRef.current = now;
          const nextLevels = [...waveformLevelsRef.current, rmsLevel].slice(-MAX_WAVEFORM_SAMPLES);
          waveformLevelsRef.current = nextLevels;
          setWaveformLevels(nextLevels);
        }
      };

      sourceNode.connect(processorNode);
      processorNode.connect(silentGainNode);
      silentGainNode.connect(audioContext.destination);

      runtimeRef.current = runtime;
      waveformLevelsRef.current = [];
      waveformLastEmitAtRef.current = 0;
      setWaveformLevels([]);
      setDurationMs(0);
      setIsRecording(true);
      timerRef.current = window.setInterval(() => {
        const activeRuntime = runtimeRef.current;
        if (!activeRuntime) {
          return;
        }
        setDurationMs(Math.max(0, performance.now() - activeRuntime.startedAt));
      }, 200);
    } catch (error) {
      processorNode?.disconnect();
      sourceNode?.disconnect();
      silentGainNode?.disconnect();
      stream?.getTracks().forEach((track) => track.stop());
      await audioContext?.close().catch(() => undefined);
      throw error;
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<VoiceRecordingPayload | null> => {
    const recorded = await teardownRuntime();
    if (!recorded) {
      return null;
    }

    const mergedSamples = mergeFloat32Chunks(recorded.chunks);
    if (mergedSamples.length === 0) {
      return null;
    }

    const resampledSamples = resampleLinear(
      mergedSamples,
      recorded.sampleRateHz,
      TARGET_SAMPLE_RATE,
    );
    if (resampledSamples.length === 0) {
      return null;
    }

    const wavBytes = encodeMono16BitWav(resampledSamples, TARGET_SAMPLE_RATE);
    const audioBase64 = await blobToBase64(new Blob([wavBytes], { type: "audio/wav" }));

    const payload: VoiceRecordingPayload = {
      audioBase64,
      mimeType: "audio/wav",
      sampleRateHz: TARGET_SAMPLE_RATE,
      durationMs: Math.max(
        1,
        Math.round((resampledSamples.length / TARGET_SAMPLE_RATE) * 1_000) || recorded.durationMs,
      ),
    };
    return payload;
  }, [teardownRuntime]);

  const cancelRecording = useCallback(async () => {
    await teardownRuntime();
    waveformLevelsRef.current = [];
    waveformLastEmitAtRef.current = 0;
    setWaveformLevels([]);
  }, [teardownRuntime]);

  useEffect(
    () => () => {
      void teardownRuntime();
    },
    [teardownRuntime],
  );

  return {
    isRecording,
    durationMs,
    waveformLevels,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}

/**
 * 合并多个 Float32Array 音频块为单个连续数组
 *
 * @param chunks - 音频数据块数组
 * @returns 合并后的 Float32Array
 */
function mergeFloat32Chunks(chunks: readonly Float32Array[]): Float32Array {
  let totalLength = 0;
  for (const chunk of chunks) {
    totalLength += chunk.length;
  }
  const merged = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

/**
 * 线性插值重采样
 *
 * 将音频采样数据从输入采样率转换为目标采样率，使用线性插值在相邻采样点之间计算新值。
 * 若输入采样率无效则返回空数组；若输入与输出采样率相同则直接拷贝。
 *
 * @param samples - 原始音频采样数据（Float32 格式，-1.0 ~ 1.0）
 * @param inputSampleRateHz - 原始采样率（Hz）
 * @param outputSampleRateHz - 目标采样率（Hz）
 * @returns 重采样后的 Float32Array
 */
function resampleLinear(
  samples: Float32Array,
  inputSampleRateHz: number,
  outputSampleRateHz: number,
): Float32Array {
  if (!Number.isFinite(inputSampleRateHz) || inputSampleRateHz <= 0) {
    return new Float32Array(0);
  }
  if (inputSampleRateHz === outputSampleRateHz) {
    return samples.slice();
  }

  const ratio = inputSampleRateHz / outputSampleRateHz;
  const outputLength = Math.max(1, Math.round(samples.length / ratio));
  const output = new Float32Array(outputLength);

  for (let index = 0; index < outputLength; index += 1) {
    const sourceIndex = index * ratio;
    const leftIndex = Math.floor(sourceIndex);
    const rightIndex = Math.min(samples.length - 1, leftIndex + 1);
    const interpolationWeight = sourceIndex - leftIndex;
    const leftValue = samples[leftIndex] ?? 0;
    const rightValue = samples[rightIndex] ?? leftValue;
    output[index] = leftValue + (rightValue - leftValue) * interpolationWeight;
  }

  return output;
}

/**
 * 编码为 16-bit 单声道 WAV
 *
 * 将 Float32 采样数据编码为标准 PCM 16-bit 单声道 WAV 格式的 ArrayBuffer，
 * 包含 44 字节 WAV 文件头（RIFF/WAVE/fmt/data）和 PCM 数据段。
 *
 * @param samples - 音频采样数据（Float32 格式，-1.0 ~ 1.0）
 * @param sampleRateHz - 采样率（Hz）
 * @returns 包含完整 WAV 文件数据的 ArrayBuffer
 */
function encodeMono16BitWav(samples: Float32Array, sampleRateHz: number): ArrayBuffer {
  const dataView = new DataView(new ArrayBuffer(44 + samples.length * 2));

  writeAscii(dataView, 0, "RIFF");
  dataView.setUint32(4, 36 + samples.length * 2, true);
  writeAscii(dataView, 8, "WAVE");
  writeAscii(dataView, 12, "fmt ");
  dataView.setUint32(16, 16, true);
  dataView.setUint16(20, 1, true);
  dataView.setUint16(22, 1, true);
  dataView.setUint32(24, sampleRateHz, true);
  dataView.setUint32(28, sampleRateHz * 2, true);
  dataView.setUint16(32, 2, true);
  dataView.setUint16(34, 16, true);
  writeAscii(dataView, 36, "data");
  dataView.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    const pcm = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    dataView.setInt16(offset, Math.round(pcm), true);
    offset += 2;
  }

  return dataView.buffer;
}

/**
 * 向 DataView 中写入 ASCII 字符串
 *
 * 将字符串的每个字符以单字节无符号整数形式依次写入 DataView 的指定偏移位置，
 * 用于填充 WAV 文件头中的 RIFF/WAVE/fmt /data 等标识符。
 *
 * @param view - 目标 DataView
 * @param offset - 写入起始偏移（字节）
 * @param value - 要写入的 ASCII 字符串
 */
function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

/**
 * 将 Blob 转换为 Base64 字符串
 *
 * 使用 FileReader 将 Blob 读取为 Data URL，然后截取逗号后的 Base64 编码部分。
 * 用于将 WAV 音频 Blob 编码为可传输的 Base64 字符串。
 *
 * @param blob - 要转换的 Blob 对象
 * @returns Base64 编码字符串
 * @throws 当 FileReader 读取失败时抛出错误
 */
async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Failed to read recorded audio."));
    });
    reader.addEventListener("error", () => {
      reject(reader.error ?? new Error("Failed to read recorded audio."));
    });
    reader.readAsDataURL(blob);
  });
  const commaIndex = dataUrl.indexOf(",");
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
}
