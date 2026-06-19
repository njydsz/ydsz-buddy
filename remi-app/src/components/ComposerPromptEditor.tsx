import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { rpc } from "@/lib/rpc";
import { getNativeApi } from "@/lib/nativeApi";
import { useT } from "@/i18n";
import { useAppStore } from "@/store";
import { useTransportState } from "@/hooks/useTransport";
import { toast } from "@/lib/toast";
import { log } from "@/lib/logger";

interface Props {
  threadId: string;
}

export function ComposerPromptEditor({ threadId }: Props) {
  const t = useT();
  const queryClient = useQueryClient();
  const setComposerDraft = useAppStore((s) => s.setComposerDraft);
  const persistedDraft = useAppStore((s) => s.composerDraft);
  const transport = useTransportState();

  const [text, setText] = useState(persistedDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draftRestoredRef = useRef(false);

  // When the thread changes, restore the persisted draft (if any) so
  // the user can pick up where they left off. The draft is per-app
  // (not per-thread) for now — this matches the Peak Code web app
  // behavior.
  useEffect(() => {
    if (persistedDraft && !draftRestoredRef.current) {
      draftRestoredRef.current = true;
      toast.info(t("chat.draftRestored"), { source: "composer" });
    }
    setText(persistedDraft);
  }, [threadId, persistedDraft, t]);

  // Persist on change (debounced) so reloads can restore the draft.
  useEffect(() => {
    if (text === persistedDraft) return;
    const id = setTimeout(() => setComposerDraft(text), 300);
    return () => clearTimeout(id);
  }, [text, persistedDraft, setComposerDraft]);

  const send = useCallback(async () => {
    if (!text.trim() || busy) return;
    if (transport !== "open") {
      toast.warning(t("toast.connectionLost"), { source: "composer" });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await rpc.threadSendMessage({ threadId, text });
      setText("");
      setComposerDraft("");
      queryClient.invalidateQueries({ queryKey: ["thread", threadId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["thread", threadId, "turns"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error(msg, { source: "composer" });
      log.error("sendMessage failed", { error: msg, threadId });
    } finally {
      setBusy(false);
    }
  }, [text, busy, transport, threadId, queryClient, setComposerDraft, t]);

  const onPickFolder = useCallback(async () => {
    const api = getNativeApi();
    if (!api) return;
    const dialog = await import("@tauri-apps/plugin-dialog");
    const path = await dialog.open({ directory: true, multiple: false });
    if (typeof path === "string") {
      setText((prev: string) => (prev ? `${prev}\n@${path}` : `@${path}`));
    }
  }, []);

  const onCancel = useCallback(async () => {
    if (!busy) return;
    try {
      await rpc.threadCancel(threadId);
      toast.info(t("chat.cancel"), { source: "composer" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg, { source: "composer" });
    }
  }, [busy, threadId, t]);

  const onCopy = useCallback(async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("chat.copied"), { source: "composer", duration: 2_000 });
    } catch {
      /* ignore */
    }
  }, [text, t]);

  return (
    <div className="border-t border-border/60 bg-card/40 p-3">
      <textarea
        className="w-full resize-none rounded-md border border-border bg-background p-2 text-sm text-foreground focus:border-primary focus:outline-none"
        rows={3}
        placeholder={t("chat.placeholder")}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void send();
          }
        }}
        disabled={busy}
      />
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            className="rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground hover:border-primary hover:text-foreground"
            onClick={onPickFolder}
            type="button"
          >
            {t("chat.attach")}
          </button>
          <button
            className="rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground hover:border-primary hover:text-foreground disabled:opacity-50"
            onClick={onCopy}
            type="button"
            disabled={!text}
          >
            {t("chat.copy")}
          </button>
        </div>
        <div className="flex items-center gap-2">
          {busy ? (
            <button
              className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-300 transition hover:border-red-500/60"
              onClick={onCancel}
              type="button"
            >
              {t("chat.cancel")}
            </button>
          ) : null}
          <button
            className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            onClick={send}
            disabled={busy || !text.trim() || transport !== "open"}
            type="button"
          >
            {busy ? t("chat.sending") : t("chat.send")}
          </button>
        </div>
      </div>
      {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
