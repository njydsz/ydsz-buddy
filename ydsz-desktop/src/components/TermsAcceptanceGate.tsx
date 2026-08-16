/**
 * @file TermsAcceptanceGate
 * @description 首次启动条款接受 Gate(P0-6)
 *
 * 挂在 App 根节点(在 IdleLockGate 之内),当用户尚未接受使用条款时,
 * 渲染全屏 Gate 拦截交互,要求用户:
 *   1. 查看隐私政策 / 使用条款(可选,通过对话框查看)
 *   2. 勾选同意复选框
 *   3. 点击"同意并继续"按钮
 *
 * 接受后写入 `termsAcceptedAt` 时间戳到 localStorage(对齐移动端)。
 * 已接受时直接渲染 children,无任何视觉影响。
 *
 * ## 与 mobile 端 OnboardingPage 的差异
 *
 * - mobile 把 onboarding 拆为 welcome/connect/push/terms 4 步
 * - desktop 已有 OnboardingTour 7 步功能介绍,本 Gate 只负责 terms 接受,
 *   避免与 OnboardingTour 的 7 步功能引导重复
 *
 * ## data-testid
 *
 * - `terms-acceptance-gate` 根容器
 * - `terms-acceptance-checkbox` 同意复选框
 * - `terms-acceptance-button` 同意并继续按钮
 * - `terms-view-privacy` 查看隐私政策按钮
 * - `terms-view-terms` 查看使用条款按钮
 * - `terms-legal-dialog` 文档查看对话框
 */
import { useState, type ReactNode } from "react";
import { ShieldCheck, FileText, X } from "lucide-react";
import { Button } from "./ui/button";
import { useMessages } from "../i18n";
import { useLanguage } from "../i18n/I18nContext";
import {
  acceptTerms,
  resetTermsAcceptance,
  useTermsState,
} from "../lib/termsStore";
import {
  getLegalDocument,
  LEGAL_LAST_UPDATED,
  type LegalDocKind,
} from "../lib/legalDocuments";
import { cn } from "../lib/utils";

/** 当前打开的法律文档类型(null 表示对话框关闭) */
type OpenDoc = LegalDocKind | null;

interface TermsAcceptanceGateProps {
  children: ReactNode;
}

/**
 * 条款接受 Gate 组件。
 *
 * 当 `termsAcceptedAt === null` 时渲染全屏拦截 UI;
 * 否则直接渲染 children。
 */
export function TermsAcceptanceGate({ children }: TermsAcceptanceGateProps) {
  const { termsAcceptedAt } = useTermsState();
  const messages = useMessages();
  const language = useLanguage();
  const [accepted, setAccepted] = useState(false);
  const [openDoc, setOpenDoc] = useState<OpenDoc>(null);

  if (termsAcceptedAt !== null) {
    return <>{children}</>;
  }

  const t = messages.termsAcceptance;
  const lang = language === "en" || language === "zh" ? language : "zh";

  const handleAccept = () => {
    if (!accepted) return;
    acceptTerms();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background px-4 text-foreground"
      data-testid="terms-acceptance-gate"
    >
      <div className="flex w-full max-w-md flex-col items-center gap-6 rounded-2xl border border-border bg-card p-8 shadow-2xl">
        {/* 图标 */}
        <div
          className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary"
          data-testid="terms-acceptance-icon"
        >
          <ShieldCheck className="size-8" />
        </div>

        {/* 标题 + 副标题 */}
        <div className="space-y-2 text-center">
          <h1 className="text-xl font-semibold" data-testid="terms-acceptance-title">
            {t.heading}
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t.subtitle}
          </p>
        </div>

        {/* 查看文档按钮 */}
        <div className="flex w-full gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setOpenDoc("privacy")}
            data-testid="terms-view-privacy"
          >
            <ShieldCheck className="mr-1.5 size-4" />
            {t.viewPrivacy}
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setOpenDoc("terms")}
            data-testid="terms-view-terms"
          >
            <FileText className="mr-1.5 size-4" />
            {t.viewTerms}
          </Button>
        </div>

        {/* 同意复选框 */}
        <label
          className="flex w-full cursor-pointer items-start gap-2 rounded-lg border border-border bg-background p-3"
          data-testid="terms-acceptance-checkbox-label"
        >
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-primary"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            data-testid="terms-acceptance-checkbox"
            aria-label={t.acceptLabel}
          />
          <span className="text-xs leading-relaxed text-foreground">
            {t.acceptLabel}
          </span>
        </label>

        {/* 同意并继续按钮 */}
        <Button
          className="w-full"
          disabled={!accepted}
          onClick={handleAccept}
          data-testid="terms-acceptance-button"
        >
          {t.acceptButton}
        </Button>
      </div>

      {/* 法律文档查看对话框 */}
      {openDoc !== null && (
        <LegalDocDialog
          kind={openDoc}
          lang={lang}
          onClose={() => setOpenDoc(null)}
        />
      )}
    </div>
  );
}

/**
 * 法律文档查看对话框(全屏覆盖)。
 *
 * 展示 `getLegalDocument(lang, kind)` 返回的文档内容。
 */
function LegalDocDialog({
  kind,
  lang,
  onClose,
}: {
  kind: LegalDocKind;
  lang: "zh" | "en";
  onClose: () => void;
}) {
  const messages = useMessages();
  const t = messages.termsAcceptance;
  const doc = getLegalDocument(lang, kind);
  const Icon = kind === "privacy" ? ShieldCheck : FileText;
  const title = kind === "privacy" ? t.dialogTitlePrivacy : t.dialogTitleTerms;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      data-testid="terms-legal-dialog"
      data-doc={kind}
    >
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-border bg-card shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <Icon className="size-4 text-primary" />
            <h2 className="text-sm font-semibold" data-testid="terms-legal-dialog-title">
              {title}
            </h2>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t.closeButton}>
            <X className="size-4" />
          </Button>
        </div>

        {/* 正文 */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-3 text-xs text-muted-foreground" data-testid="terms-legal-updated">
            {t.lastUpdated}: {LEGAL_LAST_UPDATED}
          </div>
          <p className="mb-4 text-sm text-muted-foreground" data-testid="terms-legal-intro">
            {doc.intro}
          </p>
          <ul className="space-y-3" data-testid="terms-legal-sections">
            {doc.sections.map((section) => (
              <li
                key={section.h}
                className="rounded-lg border border-border/60 bg-background p-3"
                data-testid="terms-legal-section"
              >
                <h3 className="text-sm font-medium text-foreground">{section.h}</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {section.p}
                </p>
              </li>
            ))}
          </ul>
        </div>

        {/* 底部关闭按钮 */}
        <div className="border-t border-border px-5 py-3">
          <Button className="w-full" onClick={onClose}>
            {t.closeButton}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * 设置页使用的"法律文档"卡片入口。
 *
 * 渲染当前接受状态 + 重新查看 / 重置按钮,
 * 由 `_chat.settings.tsx::renderAdvancedPanel` 调用。
 */
export function LegalDocumentsSettingsCard() {
  const messages = useMessages();
  const language = useLanguage();
  const { termsAcceptedAt } = useTermsState();
  const [openDoc, setOpenDoc] = useState<OpenDoc>(null);
  const t = messages.termsAcceptance;
  const lang = language === "en" || language === "zh" ? language : "zh";

  return (
    <div className="space-y-2" data-testid="settings-legal-card">
      {/* 当前接受状态 */}
      <div className="rounded-xl border border-(--color-border-light) bg-(--color-background-panel) px-4 py-3.5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1 space-y-0.5">
            <h3 className="text-sm font-medium text-foreground">
              {messages.settings.advanced.aboutSection}
            </h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {termsAcceptedAt
                ? `${t.acceptedAtPrefix} ${termsAcceptedAt}`
                : t.subtitle}
            </p>
          </div>
        </div>
      </div>

      {/* 查看文档按钮组 */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => setOpenDoc("privacy")}
          data-testid="settings-legal-view-privacy"
        >
          <ShieldCheck className="mr-1.5 size-3.5" />
          {t.viewPrivacy}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => setOpenDoc("terms")}
          data-testid="settings-legal-view-terms"
        >
          <FileText className="mr-1.5 size-3.5" />
          {t.viewTerms}
        </Button>
      </div>

      {/* 重置按钮(用于重新触发 Gate) */}
      <Button
        variant="ghost"
        size="sm"
        className={cn("w-full")}
        onClick={() => {
          if (
            typeof window !== "undefined" &&
            typeof window.confirm === "function"
          ) {
            // 使用原生 confirm 避免 i18n 键扩张;信息走 messages
            const ok = window.confirm(t.resetButton);
            if (ok) resetTermsAcceptance();
          } else {
            resetTermsAcceptance();
          }
        }}
        data-testid="settings-legal-reset"
      >
        {t.resetButton}
      </Button>

      {/* 文档查看对话框 */}
      {openDoc !== null && (
        <LegalDocDialog
          kind={openDoc}
          lang={lang}
          onClose={() => setOpenDoc(null)}
        />
      )}
    </div>
  );
}
