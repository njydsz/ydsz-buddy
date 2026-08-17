/**
 * @file InlineAIToolbar — 选中文本后的浮动 AI 工具栏
 *
 * 实现"人机双写"核心交互：用户在 Composer 或文档编辑器中选中文本后，
 * 自动弹出浮动工具栏，提供润色、改写、扩展、缩短、翻译等 AI 操作。
 *
 * ## 核心能力
 *
 * - **智能定位**：根据选区位置自动计算工具栏显示位置
 * - **5 种 AI 操作**：润色、改写、扩展、缩短、翻译
 * - **快捷键支持**：Ctrl+1~5 快速触发对应操作
 * - **结果预览**：AI 生成结果以 inline diff 形式展示，用户可确认/取消
 *
 * ## 使用方式
 *
 * ```tsx
 * <InlineAIToolbar
 *   selectedText="用户选中的文本"
 *   onAction={async (action, text) => {
 *     // 调用 AI API 处理
 *     return await callAI(action, text);
 *   }}
 *   onApply={(result) => {
 *     // 替换选中文本
 *   }}
 *   onClose={() => {
 *     // 关闭工具栏
 *   }}
 * />
 * ```
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Sparkles,
  PenLine,
  Maximize2,
  Minimize2,
  Languages,
  Check,
  X,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "~/lib/utils";
import { toastManager } from "./ui/toast";

// ==================== Types ====================

/** AI 操作类型 */
export type InlineAIAction = "polish" | "rewrite" | "expand" | "shorten" | "translate";

/** AI 操作定义 */
interface ActionDef {
  id: InlineAIAction;
  label: string;
  icon: React.FC<{ className?: string }>;
  colorClass: string;
  shortcut: string;
  prompt: (text: string) => string;
}

/** 工具栏位置 */
interface ToolbarPosition {
  x: number;
  y: number;
}

/** 组件 Props */
interface InlineAIToolbarProps {
  /** 选中的文本 */
  selectedText: string;
  /** 选区位置（滚动坐标） */
  selectionRect?: DOMRect | null;
  /** AI 操作回调 */
  onAction: (action: InlineAIAction, text: string) => Promise<string>;
  /** 应用结果回调 */
  onApply: (result: string) => void;
  /** 关闭回调 */
  onClose: () => void;
  /** 额外 CSS 类名 */
  className?: string;
}

// ==================== Constants ====================

const INLINE_ACTIONS: ActionDef[] = [
  {
    id: "polish",
    label: "润色",
    icon: Sparkles,
    colorClass: "text-violet-500 bg-violet-500/10 hover:bg-violet-500/20",
    shortcut: "Ctrl+1",
    prompt: (text) => `请对以下文本进行润色优化，保持原意不变，提升表达的流畅性和专业性：\n\n${text}`,
  },
  {
    id: "rewrite",
    label: "改写",
    icon: PenLine,
    colorClass: "text-blue-500 bg-blue-500/10 hover:bg-blue-500/20",
    shortcut: "Ctrl+2",
    prompt: (text) => `请改写以下文本，使其表达更清晰有力：\n\n${text}`,
  },
  {
    id: "expand",
    label: "扩展",
    icon: Maximize2,
    colorClass: "text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20",
    shortcut: "Ctrl+3",
    prompt: (text) => `请基于以下文本进行扩展，增加更多细节和说明：\n\n${text}`,
  },
  {
    id: "shorten",
    label: "缩短",
    icon: Minimize2,
    colorClass: "text-amber-500 bg-amber-500/10 hover:bg-amber-500/20",
    shortcut: "Ctrl+4",
    prompt: (text) => `请精简以下文本，保留核心信息，使其更简洁：\n\n${text}`,
  },
  {
    id: "translate",
    label: "翻译",
    icon: Languages,
    colorClass: "text-rose-500 bg-rose-500/10 hover:bg-rose-500/20",
    shortcut: "Ctrl+5",
    prompt: (text) => `请将以下文本翻译成英文（如果已是英文则翻译成中文）：\n\n${text}`,
  },
];

// ==================== Result Preview ====================

interface ResultPreviewProps {
  originalText: string;
  result: string;
  onApply: () => void;
  onRetry: () => void;
  onCancel: () => void;
  isLoading: boolean;
}

function ResultPreview({ originalText, result, onApply, onRetry, onCancel, isLoading }: ResultPreviewProps) {
  return (
    <div className="fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
      <div className="w-full max-w-2xl rounded-xl border border-border/60 bg-card/95 p-4 shadow-2xl backdrop-blur-sm">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[13px] font-medium text-foreground">AI 生成结果</span>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* 原文 vs 结果对比 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-muted/30 p-3">
            <p className="mb-1 text-[10px] font-medium uppercase text-muted-foreground/60">原文</p>
            <p className="max-h-32 overflow-y-auto text-[12px] leading-relaxed text-foreground/80">
              {originalText}
            </p>
          </div>
          <div className="rounded-lg bg-green-500/5 p-3">
            <p className="mb-1 text-[10px] font-medium uppercase text-green-600/60">生成结果</p>
            {isLoading ? (
              <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                生成中...
              </div>
            ) : (
              <p className="max-h-32 overflow-y-auto text-[12px] leading-relaxed text-foreground/80">
                {result}
              </p>
            )}
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="mt-3 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={isLoading}>
            取消
          </Button>
          <Button variant="outline" size="sm" onClick={onRetry} disabled={isLoading}>
            <RefreshCw className="mr-1.5 size-3.5" />
            重新生成
          </Button>
          <Button size="sm" onClick={onApply} disabled={isLoading || !result}>
            <Check className="mr-1.5 size-3.5" />
            应用
          </Button>
        </div>
      </div>
    </div>
  );
}

// ==================== Main Component ====================

export function InlineAIToolbar({
  selectedText,
  selectionRect,
  onAction,
  onApply,
  onClose,
  className,
}: InlineAIToolbarProps) {
  const [activeAction, setActiveAction] = useState<InlineAIAction | null>(null);
  const [result, setResult] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // 计算工具栏位置（选区上方居中）
  const position: ToolbarPosition = selectionRect
    ? {
        x: Math.min(
          selectionRect.left + selectionRect.width / 2,
          window.innerWidth - 200,
        ),
        y: Math.max(selectionRect.top - 50, 10),
      }
    : {
        x: window.innerWidth / 2,
        y: 100,
      };

  // 执行 AI 操作
  const handleAction = useCallback(
    async (action: InlineAIAction) => {
      if (!selectedText.trim()) return;

      setActiveAction(action);
      setIsLoading(true);
      setResult("");

      try {
        const actionDef = INLINE_ACTIONS.find((a) => a.id === action)!;
        const prompt = actionDef.prompt(selectedText);
        const generatedResult = await onAction(action, prompt);
        setResult(generatedResult);
      } catch (error) {
        toastManager.add({
          type: "error",
          title: "AI 处理失败",
          description: error instanceof Error ? error.message : String(error),
        });
        setActiveAction(null);
      } finally {
        setIsLoading(false);
      }
    },
    [selectedText, onAction],
  );

  // 应用结果
  const handleApply = useCallback(() => {
    if (result) {
      onApply(result);
      setActiveAction(null);
      setResult("");
      onClose();
    }
  }, [result, onApply, onClose]);

  // 重新生成
  const handleRetry = useCallback(async () => {
    if (activeAction) {
      await handleAction(activeAction);
    }
  }, [activeAction, handleAction]);

  // 关闭
  const handleClose = useCallback(() => {
    setActiveAction(null);
    setResult("");
    onClose();
  }, [onClose]);

  // 快捷键监听
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case "1":
            e.preventDefault();
            handleAction("polish");
            break;
          case "2":
            e.preventDefault();
            handleAction("rewrite");
            break;
          case "3":
            e.preventDefault();
            handleAction("expand");
            break;
          case "4":
            e.preventDefault();
            handleAction("shorten");
            break;
          case "5":
            e.preventDefault();
            handleAction("translate");
            break;
        }
      }
      if (e.key === "Escape") {
        handleClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleAction, handleClose]);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        // 如果还在选中状态则不关闭
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) {
          handleClose();
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [handleClose]);

  // 结果预览模式
  if (activeAction) {
    return (
      <ResultPreview
        originalText={selectedText}
        result={result}
        onApply={handleApply}
        onRetry={handleRetry}
        onCancel={handleClose}
        isLoading={isLoading}
      />
    );
  }

  return (
    <div
      ref={toolbarRef}
      className={cn(
        "fixed z-50 flex items-center gap-1 rounded-xl border border-border/60 bg-card/95 p-1.5 shadow-xl backdrop-blur-sm",
        "animate-in fade-in slide-in-from-bottom-2 duration-200",
        className,
      )}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: "translateX(-50%)",
      }}
    >
      {INLINE_ACTIONS.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.id}
            type="button"
            onClick={() => handleAction(action.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors",
              action.colorClass,
            )}
            title={`${action.label} (${action.shortcut})`}
          >
            <Icon className="size-3.5" />
            <span>{action.label}</span>
          </button>
        );
      })}

      {/* 分隔线 */}
      <div className="mx-1 h-5 w-px bg-border/40" />

      {/* 关闭按钮 */}
      <button
        type="button"
        onClick={handleClose}
        className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        title="关闭 (Esc)"
      >
        <X className="size-3.5" />
      </button>

      {/* 选中字数提示 */}
      <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-muted-foreground/50">
        {selectedText.length} 字
      </div>
    </div>
  );
}

export { INLINE_ACTIONS };
export type { InlineAIAction as InlineAIActionType, ToolbarPosition };
