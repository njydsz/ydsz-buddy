/**
 * @file Diff 行内编辑浮层组件
 *
 * 在 DiffPanel 中按 Cmd+K 触发,让用户输入 ast-grep pattern 和 rewrite 模板,
 * 通过 dryRun 预览替换结果,确认后落盘。
 *
 * ## 核心功能
 *
 * - 输入 pattern / rewrite,300ms 防抖后调用 `astGrepRewrite({ dryRun: true })`
 * - 显示替换次数(replacements)和命中位置数(matchLocations)
 * - Accept: 调用 `astGrepRewrite({ dryRun: false })` 落盘,然后回调 onApplied
 * - Reject: 调用 onClose
 * - pattern 编译失败时显示错误提示
 *
 * ## 使用场景
 *
 * - DiffPanel 中 Cmd+K 触发的行内结构化编辑
 *
 * ## 注意事项
 *
 * - 浮层固定在 DiffPanel 视口底部,带 backdrop-blur
 * - 不会创建新的 Monaco 实例,纯输入框 + 按钮
 * - 使用项目现有的 shadcn/ui 组件(Input / Button)
 */
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils";
import { astGrepRewrite } from "~/lib/astGrepClient";
import type { AstGrepLanguage, AstGrepRewriteResult } from "~/contracts";
import { Check, X, AlertCircle, Loader2, Wand2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface DiffInlineEditBarProps {
  /** 当前文件路径(相对工作区根或绝对) */
  filePath: string;
  /** 当前文件内容(用于生成 diff 预览)。若未提供,仅显示替换次数和命中位置 */
  originalContent?: string;
  /** 语言(从文件后缀推断) */
  language: AstGrepLanguage;
  /** 关闭回调 */
  onClose: () => void;
  /** 替换应用成功后的回调(用于触发 DiffPanel 刷新) */
  onApplied: () => void;
}

/** 防抖延迟(ms) */
const PREVIEW_DEBOUNCE_MS = 300;

export function DiffInlineEditBar({
  filePath,
  originalContent: _originalContent,
  language,
  onClose,
  onApplied,
}: DiffInlineEditBarProps) {
  const [pattern, setPattern] = useState("");
  const [rewrite, setRewrite] = useState("");
  const [preview, setPreview] = useState<AstGrepRewriteResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const debounceTimerRef = useRef<number | null>(null);

  // 防抖预览:pattern / rewrite 变化后 300ms 调用 dryRun
  useEffect(() => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const trimmedPattern = pattern.trim();
    const trimmedRewrite = rewrite.trim();
    if (!trimmedPattern || !trimmedRewrite) {
      setPreview(null);
      setError(null);
      setPreviewing(false);
      return;
    }

    setPreviewing(true);
    let cancelled = false;
    debounceTimerRef.current = window.setTimeout(async () => {
      try {
        const result = await astGrepRewrite({
          filePath,
          language,
          pattern: trimmedPattern,
          rewrite: trimmedRewrite,
          dryRun: true,
        });
        if (cancelled) return;
        setPreview(result);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setPreview(null);
      } finally {
        if (!cancelled) setPreviewing(false);
      }
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [pattern, rewrite, filePath, language]);

  // Accept: 落盘后回调 onApplied
  const handleAccept = async () => {
    const trimmedPattern = pattern.trim();
    const trimmedRewrite = rewrite.trim();
    if (!trimmedPattern || !trimmedRewrite) return;

    setApplying(true);
    setError(null);
    try {
      await astGrepRewrite({
        filePath,
        language,
        pattern: trimmedPattern,
        rewrite: trimmedRewrite,
        dryRun: false,
      });
      onApplied();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setApplying(false);
    }
  };

  // Reject: 直接关闭
  const handleReject = () => {
    onClose();
  };

  // Escape 关闭
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      handleReject();
    }
  };

  const canAccept =
    !applying && !previewing && Boolean(preview) && (preview?.replacements ?? 0) > 0;

  return (
    <div
      data-testid="diff-inline-edit-bar"
      onKeyDown={handleKeyDown}
      className={cn(
        "absolute inset-x-0 bottom-0 z-20",
        "border-t border-border/70 bg-background/95 backdrop-blur-sm",
        "px-3 py-2 shadow-lg",
      )}
    >
      {/* 标题行 */}
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <Wand2 className="size-3.5 text-primary" />
          <span>Inline Edit</span>
          <span className="text-muted-foreground/70">·</span>
          <code className="text-[10px] text-muted-foreground">{language}</code>
        </div>
        <button
          type="button"
          onClick={handleReject}
          aria-label="Close inline edit bar"
          className="inline-flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* 输入区 */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <label className="w-16 shrink-0 text-[10px] font-medium text-muted-foreground">
            pattern
          </label>
          <Input
            type="text"
            size="sm"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder="console.log($MSG)"
            autoFocus
            spellCheck={false}
            autoComplete="off"
            className="font-mono text-[11px]"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="w-16 shrink-0 text-[10px] font-medium text-muted-foreground">
            rewrite
          </label>
          <Input
            type="text"
            size="sm"
            value={rewrite}
            onChange={(e) => setRewrite(e.target.value)}
            placeholder="logger.info($MSG)"
            spellCheck={false}
            autoComplete="off"
            className="font-mono text-[11px]"
          />
        </div>
      </div>

      {/* 预览状态 / 错误 / 命中信息 */}
      <div className="mt-1.5 min-h-[18px]">
        {error ? (
          <div className="flex items-start gap-1 text-[11px] text-destructive">
            <AlertCircle className="mt-px size-3 shrink-0" />
            <span className="break-all">{error}</span>
          </div>
        ) : previewing ? (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            <span>正在生成预览…</span>
          </div>
        ) : preview ? (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            {preview.replacements > 0 ? (
              <>
                <span className="font-medium text-foreground">
                  {preview.replacements}
                </span>
                <span>处替换</span>
                {preview.matchLocations.length > 0 && (
                  <>
                    <span className="opacity-50">·</span>
                    <span>{preview.matchLocations.length} 个命中位置</span>
                  </>
                )}
              </>
            ) : (
              <span>未匹配到任何节点</span>
            )}
          </div>
        ) : (
          <div className="text-[11px] text-muted-foreground/60">
            输入 pattern 和 rewrite 后自动预览(Esc 取消)
          </div>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="mt-1.5 flex items-center justify-end gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={handleReject}
          disabled={applying}
        >
          <X className="size-3" />
          <span>Reject</span>
        </Button>
        <Button
          type="button"
          size="xs"
          onClick={handleAccept}
          disabled={!canAccept}
        >
          {applying ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Check className="size-3" />
          )}
          <span>Accept</span>
        </Button>
      </div>
    </div>
  );
}
