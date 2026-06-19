import { useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { rpc } from "@/lib/rpc";
import { ComposerPromptEditor } from "./ComposerPromptEditor";
import { BranchToolbar } from "./BranchToolbar";
import { useT } from "@/i18n";
import { useAppStore } from "@/store";
import { toast } from "@/lib/toast";
import { log } from "@/lib/logger";
import { cn } from "@/lib/utils";

interface MessageRow {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  text: string;
  createdAt: string;
  status?: "streaming" | "complete" | "error" | "failed" | "queued";
  turnId?: string;
  error?: string;
}

export function ChatView() {
  const t = useT();
  const params = useParams({ strict: false });
  const threadId = (params as { threadId?: string }).threadId;
  const queryClient = useQueryClient();
  const upsertThread = useAppStore((s) => s.upsertThread);
  const [busy, setBusy] = useState(false);

  const threadQuery = useQuery({
    queryKey: ["thread", threadId],
    queryFn: () => rpc.threadGet(threadId!),
    enabled: Boolean(threadId),
  });

  const messagesQuery = useQuery({
    queryKey: ["thread", threadId, "messages"],
    queryFn: () => rpc.threadListMessages(threadId!),
    enabled: Boolean(threadId),
    refetchInterval: (q) => {
      const data = q.state.data as MessageRow[] | undefined;
      // Keep polling while any assistant message is in flight.
      return data?.some(
        (m) => m.role === "assistant" && (m.status === "streaming" || m.status === "queued"),
      )
        ? 2_000
        : false;
    },
  });

  if (!threadId) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        {t("chat.selectThread")}
      </div>
    );
  }

  const rawMessages = messagesQuery.data ?? [];
  const messages: MessageRow[] = rawMessages.map((m) => ({
    id: m.id,
    role: (m.role as MessageRow["role"]) ?? "system",
    text: m.text,
    createdAt: m.createdAt,
    status: (m as { status?: MessageRow["status"] }).status,
    turnId: (m as { turnId?: string }).turnId,
    error: (m as { error?: string }).error,
  }));
  const streaming = messages.some(
    (m) => m.role === "assistant" && m.status === "streaming",
  );

  const onRetryTurn = async (turnId?: string) => {
    if (!threadId || !turnId) return;
    setBusy(true);
    try {
      await rpc.threadRetryTurn(threadId, turnId);
      toast.info(t("chat.retry"), { source: "chat" });
      queryClient.invalidateQueries({
        queryKey: ["thread", threadId, "messages"],
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.error("threadRetryTurn failed", { error: msg, threadId, turnId });
      toast.error(msg, { source: "chat" });
    } finally {
      setBusy(false);
    }
  };

  const onCancelTurn = async (turnId?: string) => {
    if (!threadId || !turnId) return;
    try {
      await rpc.threadCancel(threadId);
      toast.info(t("chat.cancel"), { source: "chat" });
      queryClient.invalidateQueries({
        queryKey: ["thread", threadId, "messages"],
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.error("threadCancel failed", { error: msg, threadId, turnId });
      toast.error(msg, { source: "chat" });
    }
  };

  const onRefresh = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["thread", threadId, "messages"],
    });
  };

  // The store's `upsertThread` keeps the sidebar in sync with the
  // latest title. We only call it when the thread title actually
  // changes to avoid re-renders.
  const thread = threadQuery.data;
  useMemo(() => {
    if (thread) {
      upsertThread({
        ...thread,
        archivedAt: thread.archivedAt ?? null,
        isPinned: thread.isPinned ?? false,
        latestTurn: thread.latestTurn ?? null,
        hasPendingApprovals: thread.hasPendingApprovals ?? false,
        hasPendingUserInput: thread.hasPendingUserInput ?? false,
      });
    }
  }, [thread, upsertThread]);

  return (
    <div className="flex h-full flex-col">
      <BranchToolbar thread={threadQuery.data} />
      <div className="flex items-center justify-between border-b border-border/40 bg-card/30 px-4 py-1 text-[11px] text-muted-foreground">
        <span>
          {messages.length} {messages.length === 1 ? "message" : "messages"}
        </span>
        <div className="flex items-center gap-3">
          {streaming ? (
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              {t("chat.thinking")}
            </span>
          ) : null}
          <button
            type="button"
            onClick={onRefresh}
            className="rounded border border-border/40 px-1.5 py-0.5 hover:border-primary"
          >
            Refresh
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            onRetry={() => onRetryTurn(message.turnId)}
            onCancel={() => onCancelTurn(message.turnId)}
            disabled={busy}
          />
        ))}
        {messages.length === 0 && !messagesQuery.isLoading ? (
          <div className="text-sm text-muted-foreground">
            {t("chat.noMessages")}
          </div>
        ) : null}
        {messagesQuery.isError ? (
          <div className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
            {String(messagesQuery.error)}
          </div>
        ) : null}
      </div>
      <ComposerPromptEditor threadId={threadId} />
    </div>
  );
}

function MessageBubble({
  message,
  onRetry,
  onCancel,
  disabled,
}: {
  message: MessageRow;
  onRetry: () => void;
  onCancel: () => void;
  disabled: boolean;
}) {
  const t = useT();
  const roleLabel =
    message.role === "user"
      ? t("chat.user")
      : message.role === "assistant"
        ? t("chat.assistant")
        : message.role === "tool"
          ? t("chat.attachments")
          : t("chat.system");
  const isAssistant = message.role === "assistant";
  const isError = message.status === "error" || message.status === "failed";
  const isStreaming = message.status === "streaming";
  return (
    <div
      className={cn(
        "mb-3 rounded-md border p-3",
        isError
          ? "border-red-500/40 bg-red-500/10"
          : isAssistant
            ? "border-border/60 bg-accent/30"
            : "border-border/60 bg-card",
      )}
    >
      <div className="mb-1 flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
        <span className="flex items-center gap-2">
          {roleLabel}
          {isStreaming ? (
            <span className="flex items-center gap-1 normal-case text-emerald-400">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              {t("chat.thinking")}
            </span>
          ) : null}
        </span>
        <span>{new Date(message.createdAt).toLocaleTimeString()}</span>
      </div>
      <div className="whitespace-pre-wrap break-words text-sm leading-6">
        {message.text}
        {isStreaming ? <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-foreground" /> : null}
      </div>
      {isError ? (
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-red-300">
          <span>{message.error ?? t("chat.turnFailed")}</span>
          {message.turnId ? (
            <button
              type="button"
              onClick={onRetry}
              disabled={disabled}
              className="rounded border border-red-500/40 px-2 py-0.5 hover:bg-red-500/20 disabled:opacity-50"
            >
              {t("chat.retry")}
            </button>
          ) : null}
        </div>
      ) : null}
      {isAssistant && message.turnId && !isError ? (
        <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
          {isStreaming ? (
            <button
              type="button"
              onClick={onCancel}
              disabled={disabled}
              className="rounded border border-amber-500/40 px-2 py-0.5 text-amber-300 hover:bg-amber-500/10 disabled:opacity-50"
            >
              {t("chat.cancel")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
