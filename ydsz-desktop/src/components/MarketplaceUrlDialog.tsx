/**
 * @file MarketplaceUrlDialog.tsx
 * @description 技能市场 URL 编辑对话框
 *
 * ## 行为
 *
 * - 用户输入 URL → 实时校验（必须以 http:// 或 https:// 开头）
 * - "应用"按钮：仅切换 URL，不触发 refresh
 * - "应用并刷新"按钮：切换 URL + 立即 refresh
 * - "恢复默认"按钮：清空 URL（让后端走默认 / 环境变量）+ refresh
 *
 * ## 数据流
 *
 * 1. UI 拿当前 `appSettings.marketplaceUrl` 作为初值
 * 2. 提交后调用 `useSkillMarketplaceActions().setUrl(...)`
 * 3. `setUrl` 成功后自动写回 appSettings（见 `useSkillMarketplaceActions`）
 */

import { useEffect, useState } from "react";
import { useMessages } from "~/i18n/I18nContext";
import { useAppSettings, normalizeMarketplaceUrl } from "~/appSettings";
import { useSkillMarketplaceActions, useSkillMarketplaceStatus } from "~/hooks/useSkillMarketplace";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { toastManager } from "./ui/toast";
import { cn } from "~/lib/utils";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";
import { Loader2Icon, RotateCcwIcon } from "~/lib/icons";
import { monitor } from "~/lib/monitor";

interface MarketplaceUrlDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MarketplaceUrlDialog({ open, onOpenChange }: MarketplaceUrlDialogProps) {
  const messages = useMessages();
  const { settings, updateSettings } = useAppSettings();
  const statusQuery = useSkillMarketplaceStatus();
  const { setUrl } = useSkillMarketplaceActions();

  const [draft, setDraft] = useState<string>(settings.marketplaceUrl ?? "");
  const [isSubmitting, setIsSubmitting] = useState<"apply" | "applyRefresh" | "reset" | null>(null);

  // 同步初值：每次打开对话框时把当前 settings.marketplaceUrl 拉进来
  useEffect(() => {
    if (open) {
      setDraft(settings.marketplaceUrl ?? "");
    }
  }, [open, settings.marketplaceUrl]);

  const normalized = normalizeMarketplaceUrl(draft);
  const isValid =
    draft.trim().length === 0 || normalized.length > 0;
  const isUnchanged = normalized === (settings.marketplaceUrl ?? "");

  const handleApply = async (refreshAfter: boolean) => {
    setIsSubmitting(refreshAfter ? "applyRefresh" : "apply");
    try {
      await setUrl({
        url: normalized.length > 0 ? normalized : null,
        refresh: refreshAfter,
      });
      toastSuccess(messages, refreshAfter);
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "应用失败";
      monitor.captureError({
        type: "skill_marketplace.url_dialog",
        message: "failed to apply marketplace url",
        stack: error instanceof Error ? error.stack : undefined,
        context: { url: normalized, refresh: refreshAfter },
        level: "error",
      });
      toastFail(messages, message);
    } finally {
      setIsSubmitting(null);
    }
  };

  const handleReset = async () => {
    setIsSubmitting("reset");
    try {
      await setUrl({ url: null, refresh: true });
      updateSettings({ marketplaceUrl: "" });
      toastSuccess(messages, true);
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "重置失败";
      monitor.captureError({
        type: "skill_marketplace.url_dialog",
        message: "failed to reset marketplace url",
        stack: error instanceof Error ? error.stack : undefined,
        context: {},
        level: "error",
      });
      toastFail(messages, message);
    } finally {
      setIsSubmitting(null);
    }
  };

  // 当前生效的远端 URL（仅在「不修改」时显示，避免与编辑后的草稿混淆）
  const effectiveUrl = statusQuery.data?.remoteUrl ?? null;
  const showInvalid = draft.trim().length > 0 && !isValid;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup
        showCloseButton
        data-testid="marketplace-url-dialog"
      >
        <DialogHeader>
          <DialogTitle>{messages.skills.marketplaceUrlDialogTitle}</DialogTitle>
          <DialogDescription>
            {messages.skills.marketplaceUrlDialogDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 px-6 pb-2">
          <div className="space-y-1.5">
            <Label htmlFor="marketplace-url-input" className="text-xs">
              {messages.skills.marketplaceUrlLabel}
            </Label>
            <Input
              id="marketplace-url-input"
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={messages.skills.marketplaceUrlPlaceholder}
              data-testid="marketplace-url-input"
              className={cn("font-mono", showInvalid && "border-destructive focus-visible:ring-destructive")}
            />
            {showInvalid ? (
              <p
                className="text-[11px] text-destructive"
                data-testid="marketplace-url-invalid"
              >
                {messages.skills.marketplaceUrlInvalid}
              </p>
            ) : null}
          </div>

          {effectiveUrl ? (
            <p
              className="truncate text-[11px] text-muted-foreground/80"
              data-testid="marketplace-url-effective"
            >
              当前生效：<span className="font-mono">{effectiveUrl}</span>
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              disabled={isSubmitting !== null}
              data-testid="marketplace-url-reset"
            >
              {isSubmitting === "reset" ? (
                <Loader2Icon className="mr-1 size-3.5 animate-spin" />
              ) : (
                <RotateCcwIcon className="mr-1 size-3.5" />
              )}
              {messages.skills.marketplaceUrlReset}
            </Button>
            <div className="flex items-center gap-2">
              <DialogClose
                render={<Button variant="ghost" size="sm" disabled={isSubmitting !== null} />}
              >
                {messages.skills.marketplaceUrlCancel}
              </DialogClose>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleApply(true)}
                disabled={!isValid || isUnchanged || isSubmitting !== null}
                data-testid="marketplace-url-apply-refresh"
              >
                {isSubmitting === "applyRefresh" ? (
                  <Loader2Icon className="mr-1 size-3.5 animate-spin" />
                ) : null}
                {messages.skills.marketplaceUrlApplyAndRefresh}
              </Button>
              <Button
                size="sm"
                onClick={() => handleApply(false)}
                disabled={!isValid || isUnchanged || isSubmitting !== null}
                data-testid="marketplace-url-apply"
              >
                {isSubmitting === "apply" ? (
                  <Loader2Icon className="mr-1 size-3.5 animate-spin" />
                ) : null}
                {messages.skills.marketplaceUrlApply}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function toastSuccess(
  messages: ReturnType<typeof useMessages>,
  refreshed: boolean,
) {
  toastManager.add({
    type: "success",
    title: messages.skills.marketplaceHeading,
    description: refreshed
      ? "已应用并刷新"
      : "已应用，下次启动或下次刷新时生效",
  });
}

function toastFail(
  messages: ReturnType<typeof useMessages>,
  message: string,
) {
  toastManager.add({
    type: "error",
    title: messages.skills.marketplaceHeading,
    description: message,
  });
}
