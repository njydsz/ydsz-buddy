/**
 * @file OcrPanel
 * @description 截图 OCR 面板组件（P2-2）
 *
 * 提供"选图片 → 识别 → 复制/插入"流程的独立 UI 组件。
 * 与 composer / 设置页 / 工具菜单均能集成使用。
 *
 * ## 内部结构
 *
 * 1. `OcrPanel` — 容器,负责打开/关闭状态、上下文注入
 * 2. `OcrPanelTrigger` — 触发按钮(可放到任意位置)
 * 3. `OcrPanelBody` — 弹窗主体(语言选择 / 选图 / 结果展示)
 * 4. `OcrPanelProviderBadge` — provider 状态小徽标(用于 header 提示)
 *
 * ## a11y
 *
 * - 弹窗使用 `role=dialog` + `aria-modal=true`
 * - Esc 关闭、点击 backdrop 关闭
 * - 焦点在打开时进入"选图"按钮
 *
 * ## E2E data-testid
 *
 * - `ocr-panel-trigger` 触发按钮
 * - `ocr-panel` 弹窗容器
 * - `ocr-panel-language` 语言 select
 * - `ocr-panel-pick-file` 选图按钮
 * - `ocr-panel-paste` 粘贴区域
 * - `ocr-panel-result` 结果预览
 * - `ocr-panel-insert` 插入按钮
 * - `ocr-panel-copy` 复制按钮
 * - `ocr-panel-error` 错误展示
 * - `ocr-panel-no-provider` 不可用提示
 */
import {
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "~/i18n";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import {
  type OcrProviderId,
  type OcrProviderInfo,
  type OcrResult,
  useOcrRecognize,
} from "~/hooks/useOcrRecognize";

export interface OcrPanelProps {
  /** 受控 open 状态 */
  open?: boolean;
  /** open 状态变化回调 */
  onOpenChange?: (open: boolean) => void;
  /** 触发按钮(可自定义 children);不传时使用默认 trigger */
  trigger?: ReactNode;
  /** 识别完成后的"插入"按钮回调,默认显示"复制文字"按钮 */
  onInsert?: (result: OcrResult) => void;
  /** 默认语言(BCP-47 标签) */
  defaultLanguage?: string;
  /** 自定义 trigger label className */
  triggerClassName?: string;
}

/**
 * OCR 面板 — 把 trigger / 弹窗 / 状态打包
 */
export function OcrPanel(props: OcrPanelProps) {
  const { open: controlledOpen, onOpenChange, trigger, onInsert, defaultLanguage, triggerClassName } = props;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  const { messages } = useTranslation();
  const t = messages.ocr;

  return (
    <>
      {trigger !== undefined ? (
        <span
          onClick={() => setOpen(true)}
          className={triggerClassName}
          data-testid="ocr-panel-trigger"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOpen(true);
            }
          }}
        >
          {trigger}
        </span>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          data-testid="ocr-panel-trigger"
          aria-label={t.triggerButtonAria}
          title={t.triggerHint}
          className={cn("gap-2", triggerClassName)}
        >
          <span aria-hidden="true">{"\u{1F4C4}"}</span>
          <span>{t.triggerButton}</span>
        </Button>
      )}
      {open ? (
        <OcrPanelBody
          onClose={() => setOpen(false)}
          onInsert={onInsert}
          defaultLanguage={defaultLanguage}
        />
      ) : null}
    </>
  );
}

interface OcrPanelBodyProps {
  onClose: () => void;
  onInsert?: (result: OcrResult) => void;
  defaultLanguage?: string;
}

function OcrPanelBody({ onClose, onInsert, defaultLanguage }: OcrPanelBodyProps) {
  const { messages } = useTranslation();
  const t = messages.ocr;
  const [language, setLanguage] = useState<string>(defaultLanguage ?? "auto");
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [base64Payload, setBase64Payload] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const ocr = useOcrRecognize({
    onComplete: () => {
      // 成功后无需额外处理(state 已更新)
    },
  });

  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 打开时把焦点送到"选图"按钮
  useEffect(() => {
    const id = window.setTimeout(() => {
      fileInputRef.current?.focus();
    }, 30);
    return () => window.clearTimeout(id);
  }, []);

  /** 选文件后转 base64 + data url 预览 */
  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      return;
    }
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    const base64 = btoa(binary);
    setBase64Payload(base64);
    setPreviewDataUrl(`data:${file.type};base64,${base64}`);
  }, []);

  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  /** 触发识别 */
  const handleRecognize = useCallback(async () => {
    if (!base64Payload) return;
    const lang = languageToBcp47(language);
    await ocr.recognize({ kind: "base64", data: base64Payload }, lang ?? undefined);
  }, [base64Payload, language, ocr]);

  const handleCopy = useCallback(async () => {
    if (!ocr.result) return;
    try {
      await navigator.clipboard.writeText(ocr.result.text);
    } catch (err) {
      // 静默失败
      if (typeof console !== "undefined") {
        // eslint-disable-next-line no-console
        console.warn("[OcrPanel] clipboard write failed:", err);
      }
    }
  }, [ocr.result]);

  const handleInsert = useCallback(() => {
    if (ocr.result) {
      onInsert?.(ocr.result);
      onClose();
    }
  }, [ocr.result, onInsert, onClose]);

  const providerInfo = ocr.providerInfo;
  const noProvider = providerInfo
    ? providerInfo.active === "none" || providerInfo.available.length === 0
    : false;

  return (
    <div
      className="fixed inset-0 z-[180] flex items-center justify-center bg-background/70 backdrop-blur-sm"
      data-testid="ocr-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ocr-panel-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="flex w-full max-w-2xl flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-2xl"
      >
        <header className="flex items-center justify-between">
          <div>
            <h2 id="ocr-panel-title" className="text-base font-semibold text-foreground">
              {t.triggerButton}
            </h2>
            <p className="text-xs text-muted-foreground">{t.triggerHint}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t.closeAria}
            data-testid="ocr-panel-close"
          >
            <span aria-hidden="true">{"\u00D7"}</span>
          </button>
        </header>

        {providerInfo ? (
          <ProviderBadge info={providerInfo} t={t} />
        ) : null}

        {noProvider ? (
          <div
            className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300"
            data-testid="ocr-panel-no-provider"
            role="alert"
          >
            <p className="font-medium">{t.noProviderTitle}</p>
            <p className="mt-1 text-xs">{t.noProviderDescription}</p>
            <p className="mt-1 font-mono text-xs">{t.installTesseractHint}</p>
          </div>
        ) : null}

        {/* 语言选择 */}
        <div className="flex flex-col gap-1" data-testid="ocr-panel-language">
          <label htmlFor="ocr-language" className="text-sm font-medium text-foreground">
            {t.languageLabel}
          </label>
          <select
            id="ocr-language"
            className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="auto">{t.languageAuto}</option>
            <option value="en">{t.languageEnglish}</option>
            <option value="zh">{t.languageChinese}</option>
          </select>
        </div>

        {/* 选图 + 拖拽 */}
        <div
          className="flex flex-col gap-2"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          data-testid="ocr-panel-paste"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            data-testid="ocr-panel-pick-file"
            className="block w-full text-sm text-foreground file:mr-3 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground"
          />
          {previewDataUrl ? (
            <div className="mt-1 flex max-h-40 items-center justify-center overflow-hidden rounded border border-border bg-muted">
              <img
                src={previewDataUrl}
                alt="preview"
                className="max-h-40 max-w-full object-contain"
              />
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={ocr.busy || !base64Payload || noProvider}
            onClick={() => void handleRecognize()}
            data-testid="ocr-panel-recognize"
          >
            {ocr.busy ? t.recognizing : t.triggerButton}
          </Button>
        </div>

        {/* 结果 */}
        {ocr.result ? (
          <div
            className="flex flex-col gap-2"
            data-testid="ocr-panel-result"
            aria-live="polite"
          >
            <p className="text-xs text-muted-foreground">
              {t.recognizedLines(ocr.result.lines.length)}
              {ocr.result.elapsedMs > 0
                ? ` · ${ocr.result.elapsedMs}ms · ${ocr.result.provider}`
                : ` · ${ocr.result.provider}`}
            </p>
            {ocr.result.text.trim().length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.noText}</p>
            ) : (
              <pre
                className="max-h-64 overflow-auto whitespace-pre-wrap rounded border border-border bg-muted p-3 text-sm text-foreground"
                data-testid="ocr-panel-result-text"
              >
                {ocr.result.text}
              </pre>
            )}
            <div className="flex items-center gap-2">
              {onInsert ? (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={handleInsert}
                  data-testid="ocr-panel-insert"
                >
                  {t.insertToComposer}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleCopy()}
                data-testid="ocr-panel-copy"
              >
                {t.copyText}
              </Button>
            </div>
          </div>
        ) : null}

        {/* 错误 */}
        {ocr.error ? (
          <p
            className="text-xs text-destructive"
            data-testid="ocr-panel-error"
            role="alert"
            aria-live="polite"
          >
            {ocr.error || t.errorFallback}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ProviderBadge({ info, t }: { info: OcrProviderInfo; t: { providerActive: string; providerMacosVision: string; providerWindowsOcr: string; providerTesseract: string; providerNone: string } }) {
  const activeLabel = useMemo(() => {
    const id: OcrProviderId = info.active as OcrProviderId;
    if (id === "macos_vision") return t.providerMacosVision;
    if (id === "windows_ocr") return t.providerWindowsOcr;
    if (id === "tesseract") return t.providerTesseract;
    return t.providerNone;
  }, [info.active, t]);

  return (
    <div
      className="flex items-center gap-2 rounded border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground"
      data-testid="ocr-panel-provider-badge"
      data-provider={info.active}
    >
      <span className="font-medium text-foreground">{t.providerActive}:</span>
      <span>{activeLabel}</span>
    </div>
  );
}

function languageToBcp47(value: string): string | null {
  switch (value) {
    case "en":
      return "en-US";
    case "zh":
      return "zh-Hans";
    case "auto":
    default:
      return null;
  }
}
