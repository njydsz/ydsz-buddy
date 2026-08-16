/**
 * @file Design Mode 元素信息面板
 *
 * 当用户在浏览器 Design Mode 中点击元素后，此面板展示提取的：
 * - 元素标签、ID、类名
 * - 外部 HTML（截断显示）
 * - 计算后的 CSS 样式
 * - 元素位置和尺寸
 * - 页面 URL 和标题
 *
 * 提供"发送给 Agent"按钮，将截图 + 元素信息注入 Composer。
 */

import { useCallback, useState } from "react";
import {
  type BrowserDesignModeElement,
  type ThreadId,
  PROVIDER_SEND_TURN_MAX_ATTACHMENTS,
  PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
} from "~/contracts";
import { useComposerDraftStore } from "../composerDraftStore";
import { readNativeApi } from "~/nativeApi";
import { composerImageFromBrowserScreenshot } from "../lib/browserPromptContext";
import {
  CopyIcon,
  SendIcon,
  XIcon,
  Code2Icon,
  SquarePenIcon,
} from "~/lib/icons";
import { cn } from "~/lib/utils";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { toastManager } from "./ui/toast";

export interface DesignModePanelProps {
  threadId: ThreadId;
  tabId: string;
  element: BrowserDesignModeElement;
  onClose: () => void;
}

type TabKind = "html" | "css" | "info";

function formatElementLabel(el: BrowserDesignModeElement): string {
  let label = el.tagName;
  if (el.elementId) {
    label += `#${el.elementId}`;
  }
  if (el.classList.length > 0) {
    label += `.${el.classList.slice(0, 3).join(".")}`;
  }
  return label;
}

function buildAgentPrompt(el: BrowserDesignModeElement): string {
  const lines: string[] = [
    "## Browser Design Mode — Element Inspection",
    "",
    `**Page:** ${el.pageTitle}`,
    `**URL:** ${el.url}`,
    `**Element:** \`<${el.tagName}${el.elementId ? ` id="${el.elementId}"` : ""}${el.classList.length > 0 ? ` class="${el.classList.join(" ")}"` : ""}>\``,
    `**Rect:** ${Math.round(el.rectWidth)}x${Math.round(el.rectHeight)} at (${Math.round(el.rectX)}, ${Math.round(el.rectY)})`,
    "",
    "### Outer HTML",
    "```html",
    el.outerHtml,
    "```",
    "",
    "### Computed CSS",
    "```json",
    el.computedStyles,
    "```",
  ];

  if (el.textContent) {
    lines.push("", "### Text Content", el.textContent);
  }

  lines.push("", "_Please analyze this UI element and help me improve or modify it._");
  return lines.join("\n");
}

export function DesignModePanel({ threadId, tabId, element, onClose }: DesignModePanelProps) {
  const [activeTab, setActiveTab] = useState<TabKind>("html");
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const addComposerDraftImage = useComposerDraftStore((store) => store.addImage);
  const composerDraftImageCount = useComposerDraftStore(
    (store) => store.draftsByThreadId[threadId]?.images.length ?? 0,
  );
  const composerDraftAssistantSelectionCount = useComposerDraftStore(
    (store) => store.draftsByThreadId[threadId]?.assistantSelections.length ?? 0,
  );

  const elementLabel = formatElementLabel(element);

  const onCopyHtml = useCallback(() => {
    navigator.clipboard.writeText(element.outerHtml).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [element.outerHtml]);

  const onCopyCss = useCallback(() => {
    navigator.clipboard.writeText(element.computedStyles).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [element.computedStyles]);

  const onSendToAgent = useCallback(async () => {
    const api = readNativeApi();
    if (!api) return;

    setSending(true);
    try {
      const attachmentCount = composerDraftImageCount + composerDraftAssistantSelectionCount;
      if (attachmentCount >= PROVIDER_SEND_TURN_MAX_ATTACHMENTS) {
        toastManager.add({
          type: "error",
          title: `Attachment limit reached (${PROVIDER_SEND_TURN_MAX_ATTACHMENTS} max).`,
        });
        return;
      }

      const screenshot = await api.browser.captureScreenshot({ threadId, tabId });

      if (screenshot.sizeBytes > PROVIDER_SEND_TURN_MAX_IMAGE_BYTES) {
        toastManager.add({
          type: "error",
          title: "Screenshot exceeds size limit.",
        });
        return;
      }

      addComposerDraftImage(threadId, composerImageFromBrowserScreenshot(screenshot));

      const prompt = buildAgentPrompt(element);
      await navigator.clipboard.writeText(prompt);

      toastManager.add({
        type: "success",
        title: "Screenshot added & element info copied",
        description: "Paste into composer to send to Agent.",
      });

      onClose();
    } catch {
      toastManager.add({
        type: "error",
        title: "Failed to send element to Agent.",
      });
    } finally {
      setSending(false);
    }
  }, [
    addComposerDraftImage,
    composerDraftAssistantSelectionCount,
    composerDraftImageCount,
    element,
    onClose,
    tabId,
    threadId,
  ]);

  const tabs: { kind: TabKind; label: string }[] = [
    { kind: "html", label: "HTML" },
    { kind: "css", label: "CSS" },
    { kind: "info", label: "Info" },
  ];

  return (
    <div className="flex h-full flex-col border-l border-border bg-background/95 backdrop-blur-sm">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Code2Icon className="size-4 shrink-0 text-indigo-400" />
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
          {elementLabel}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-6 shrink-0"
          onClick={onClose}
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>

      <div className="flex items-center gap-1 border-b border-border px-2 py-1">
        {tabs.map((tab) => (
          <button
            key={tab.kind}
            type="button"
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              activeTab === tab.kind
                ? "bg-indigo-500/15 text-indigo-300"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
            onClick={() => setActiveTab(tab.kind)}
          >
            {tab.label}
          </button>
        ))}
        <div className="flex-1" />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-6"
          onClick={activeTab === "html" ? onCopyHtml : onCopyCss}
          title="Copy to clipboard"
        >
          <CopyIcon className="size-3" />
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="p-3">
          {activeTab === "html" && (
            <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-foreground/85">
              {element.outerHtml}
            </pre>
          )}
          {activeTab === "css" && (
            <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-foreground/85">
              {element.computedStyles}
            </pre>
          )}
          {activeTab === "info" && (
            <div className="space-y-2 text-xs">
              <InfoRow label="Tag" value={element.tagName} />
              <InfoRow label="ID" value={element.elementId || "\u2014"} />
              <InfoRow
                label="Classes"
                value={element.classList.length > 0 ? element.classList.join(" ") : "\u2014"}
              />
              <InfoRow
                label="Size"
                value={`${Math.round(element.rectWidth)} x ${Math.round(element.rectHeight)} px`}
              />
              <InfoRow
                label="Position"
                value={`(${Math.round(element.rectX)}, ${Math.round(element.rectY)})`}
              />
              <InfoRow label="URL" value={element.url} />
              <InfoRow label="Title" value={element.pageTitle || "\u2014"} />
              {element.textContent && (
                <div className="pt-2">
                  <div className="mb-1 text-muted-foreground">Text Content</div>
                  <div className="rounded-md bg-muted/40 p-2 text-foreground/80">
                    {element.textContent}
                  </div>
                </div>
              )}
            </div>
          )}
          {copied && (
            <div className="mt-2 text-center text-[11px] text-emerald-400">
              Copied to clipboard
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="border-t border-border p-3">
        <Button
          type="button"
          className="w-full gap-2"
          size="sm"
          disabled={sending}
          onClick={onSendToAgent}
        >
          {sending ? (
            <>
              <SquarePenIcon className="size-3.5 animate-pulse" />
              Sending...
            </>
          ) : (
            <>
              <SendIcon className="size-3.5" />
              Send to Agent
            </>
          )}
        </Button>
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
          Screenshot + element info will be added to Composer
        </p>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-16 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-all font-mono text-foreground/85">{value}</span>
    </div>
  );
}

export default DesignModePanel;
