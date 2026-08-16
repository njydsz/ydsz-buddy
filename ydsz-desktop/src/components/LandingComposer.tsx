/**
 * @file 落地页独立 Composer 组件
 *
 * 当没有活跃线程时，在落地页中央展示一个 Trae 风格的 composer：
 * - 大尺寸多行文本输入框，带描述性 placeholder
 * - 底部工具栏：附件、语音、速通、模型选择器、发送按钮
 * - 卡片容器：明显边框 + 阴影 + 圆角
 *
 * 用户输入后点击发送，通过 `onSubmit` 回调通知父组件创建新线程。
 * 快捷操作点击后预填输入框。
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { cn } from "~/lib/utils";
import {
  ArrowUpIcon,
  ChevronDownIcon,
  MicIcon,
  PaperclipIcon,
  SettingsIcon,
  SparklesIcon,
  ZapIcon,
} from "~/lib/icons";

interface LandingComposerProps {
  /** 发送回调。父组件负责创建线程并导航 */
  onSubmit: (prompt: string) => void | Promise<void>;
  /** 是否正在发送/连接中 */
  disabled?: boolean;
  /** placeholder 文案 */
  placeholder?: string;
  /** 外部控制的预填 prompt（快捷操作点击时传入） */
  prefilledPrompt?: string;
  /** 预填消费后的回调，父组件用于清除预填状态 */
  onPrefillConsumed?: () => void;
  /** 预填后是否自动聚焦 */
  autoFocusOnPrefill?: boolean;
}

function ToolbarButton({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg text-[13px] text-foreground/70 transition-colors",
        "hover:bg-muted/60 hover:text-foreground",
        "active:scale-95",
        disabled && "cursor-not-allowed opacity-40",
      )}
    >
      {children}
    </button>
  );
}

function ModelPickerButton({ disabled }: { disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] text-foreground/80 transition-colors",
        "hover:bg-muted/60 hover:text-foreground",
        disabled && "cursor-not-allowed opacity-40",
      )}
    >
      <SparklesIcon className="size-4 text-foreground/70" />
      <span>默认模型</span>
      <ChevronDownIcon className="size-3 opacity-70" />
    </button>
  );
}

export function LandingComposer({
  onSubmit,
  disabled = false,
  placeholder,
  prefilledPrompt,
  onPrefillConsumed,
  autoFocusOnPrefill = true,
}: LandingComposerProps) {
  const [prompt, setPrompt] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isSubmittingRef = useRef(false);
  const onPrefillConsumedRef = useRef(onPrefillConsumed);
  onPrefillConsumedRef.current = onPrefillConsumed;

  // 当外部传入 prefilledPrompt 时，预填到输入框
  useEffect(() => {
    if (prefilledPrompt && prefilledPrompt !== prompt) {
      setPrompt(prefilledPrompt);
      onPrefillConsumedRef.current?.();
      if (autoFocusOnPrefill) {
        // 延迟聚焦，等待 DOM 更新
        requestAnimationFrame(() => {
          textareaRef.current?.focus();
          // 将光标移到末尾
          const len = textareaRef.current?.value.length ?? 0;
          textareaRef.current?.setSelectionRange(len, len);
        });
      }
    }
  }, [prefilledPrompt]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed || disabled || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    try {
      await onSubmit(trimmed);
      setPrompt("");
    } finally {
      isSubmittingRef.current = false;
    }
  }, [prompt, disabled, onSubmit]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSubmit();
      }
    },
    [handleSubmit],
  );

  // 自动调整 textarea 高度
  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, []);

  const hasContent = prompt.trim().length > 0;

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <div
        className={cn(
          "group w-full rounded-2xl border border-border bg-card shadow-sm transition-all duration-200",
          "hover:shadow-md",
          "focus-within:ring-1 focus-within:ring-ring/20 focus-within:shadow-md",
          disabled && "opacity-70",
        )}
      >
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            handleInput();
          }}
          onKeyDown={handleKeyDown}
          placeholder={
            placeholder ??
            "输入任何内容，使用 @ 引用文件/文件夹，或使用 / 查看可用命令"
          }
          disabled={disabled}
          rows={2}
          className={cn(
            "block w-full resize-none bg-transparent px-5 py-4 text-[15px] leading-relaxed text-foreground",
            "placeholder:text-muted-foreground/70",
            "focus:outline-none",
            "disabled:cursor-not-allowed",
          )}
          style={{ maxHeight: 180, minHeight: 64 }}
        />

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between px-2 pb-2">
          {/* Left tools */}
          <div className="flex items-center gap-0.5">
            <ToolbarButton title="添加附件" disabled={disabled}>
              <PaperclipIcon className="size-4" />
            </ToolbarButton>
            <ToolbarButton title="语音输入" disabled={disabled}>
              <MicIcon className="size-4" />
            </ToolbarButton>
            <ToolbarButton title="速通" disabled={disabled}>
              <ZapIcon className="size-4" />
            </ToolbarButton>
          </div>

          {/* Right tools */}
          <div className="flex items-center gap-1">
            <ModelPickerButton disabled={disabled} />
            <ToolbarButton title="设置" disabled={disabled}>
              <SettingsIcon className="size-4" />
            </ToolbarButton>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={disabled || !hasContent}
              className={cn(
                "ml-1 flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-150",
                hasContent && !disabled
                  ? "bg-foreground text-background hover:scale-105"
                  : "bg-secondary text-secondary-foreground opacity-40",
              )}
              aria-label="Send"
            >
              <ArrowUpIcon className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
