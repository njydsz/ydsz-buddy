/**
 * @file useOcrRecognize
 * @description 截图 OCR 识别 hook（P2-2）
 *
 * 封装与后端 `ocr_recognize_text` / `ocr_list_providers` 命令的交互,
 * 提供"选图片 → 识别 → 拿到文字"的一站式 API。
 *
 * ## 平台适配
 *
 * 后端会自动选最合适的 provider:
 * - macOS: Apple Vision
 * - Windows: Windows.Media.Ocr
 * - 其它: Tesseract (需要系统安装)
 *
 * 失败时降级:
 * - provider 不可用 → 抛 "no_provider" 错误,UI 引导安装 tesseract
 * - 识别中但 provider 抛错 → 抛原 error string,UI 展示给用户
 *
 * ## 与 E2E / a11y 配合
 *
 * - 输入可来自剪贴板 (ClipboardItem / DataTransfer) 或 file picker
 * - 触发后立刻禁用按钮,避免重复点击
 * - 进度通过 `state` 暴露,UI 可绑定 busy 状态
 */
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";

/** OCR provider 标识 */
export type OcrProviderId = "macos_vision" | "windows_ocr" | "tesseract" | "none";

/** provider 信息 */
export interface OcrProviderInfo {
  active: OcrProviderId;
  platform: string;
  tesseractInstalled: boolean;
  tesseractPath: string | null;
  swiftAvailable: boolean;
  powershellAvailable: boolean;
  available: OcrProviderId[];
}

/** 单行识别结果 */
export interface OcrLine {
  text: string;
  confidence: number;
  /** [x, y, w, h] 像素坐标,可能为 null */
  bbox?: [number, number, number, number] | null;
}

/** 识别结果 */
export interface OcrResult {
  text: string;
  provider: OcrProviderId | string;
  confidence: number;
  lines: OcrLine[];
  elapsedMs: number;
}

/** OCR 来源(支持 base64 / 文件路径) */
export type OcrSourceInput =
  | { kind: "base64"; data: string; mime?: string }
  | { kind: "path"; path: string };

/** 状态机 */
export type OcrState = "idle" | "loading" | "recognizing" | "done" | "error";

export interface UseOcrRecognizeOptions {
  /** 选好后是否自动开始识别(默认 true) */
  autoStart?: boolean;
  /** 识别完成回调 */
  onComplete?: (result: OcrResult) => void;
  /** 错误回调 */
  onError?: (error: string) => void;
}

export interface UseOcrRecognizeResult {
  /** 当前状态 */
  state: OcrState;
  /** 错误信息(若有) */
  error: string | null;
  /** 识别结果(若有) */
  result: OcrResult | null;
  /** provider 信息 */
  providerInfo: OcrProviderInfo | null;
  /** 当前是否正在识别(loading + recognizing) */
  busy: boolean;
  /** 启动识别(需要传入 source) */
  recognize: (source: OcrSourceInput, language?: string) => Promise<OcrResult | null>;
  /** 重置 state */
  reset: () => void;
  /** 刷新 provider 信息 */
  refreshProvider: () => Promise<void>;
}

/**
 * OCR hook — 与后端 `commands::ocr` 配套使用
 */
export function useOcrRecognize(options: UseOcrRecognizeOptions = {}): UseOcrRecognizeResult {
  const { onComplete, onError } = options;
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);
  onCompleteRef.current = onComplete;
  onErrorRef.current = onError;

  const [state, setState] = useState<OcrState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OcrResult | null>(null);
  const [providerInfo, setProviderInfo] = useState<OcrProviderInfo | null>(null);

  const busy = state === "loading" || state === "recognizing";

  /** 拉取 provider 列表 */
  const refreshProvider = useCallback(async () => {
    setState("loading");
    try {
      const info = await invoke<OcrProviderInfo>("ocr_list_providers");
      setProviderInfo(info);
      setState("idle");
    } catch (err) {
      setError(toErrorString(err));
      setState("error");
    }
  }, []);

  /** 启动一次识别 */
  const recognize = useCallback(
    async (source: OcrSourceInput, language?: string): Promise<OcrResult | null> => {
      setError(null);
      setResult(null);
      setState("recognizing");
      try {
        const output = await invoke<OcrResult>("ocr_recognize_text", {
          input: {
            source,
            language: language ?? null,
          },
        });
        setResult(output);
        setState("done");
        onCompleteRef.current?.(output);
        return output;
      } catch (err) {
        const message = toErrorString(err);
        setError(message);
        setState("error");
        onErrorRef.current?.(message);
        return null;
      }
    },
    [],
  );

  /** 重置 state */
  const reset = useCallback(() => {
    setError(null);
    setResult(null);
    setState("idle");
  }, []);

  // 挂载时主动拉取一次 provider 列表(让 UI 知道有没有可用的 OCR)
  useEffect(() => {
    void refreshProvider();
  }, [refreshProvider]);

  return {
    state,
    error,
    result,
    providerInfo,
    busy,
    recognize,
    reset,
    refreshProvider,
  };
}

/** 把 invoke 抛出的错误规范成 string */
function toErrorString(err: unknown): string {
  if (err == null) return "unknown error";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
