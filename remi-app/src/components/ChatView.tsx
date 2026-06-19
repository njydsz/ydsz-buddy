import { useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { rpc } from "@/lib/rpc";
import { ComposerPromptEditor } from "./ComposerPromptEditor";
import { BranchToolbar } from "./BranchToolbar";
import { useT } from "@/i18n";

export function ChatView() {
  const t = useT();
  const params = useParams({ strict: false });
  const threadId = (params as { threadId?: string }).threadId;

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
      const data = q.state.data as Array<{ role: string; status?: string }> | undefined;
      // Keep polling while any assistant message is in flight.
      return data?.some(
        (m) => m.role === "assistant" && (!m.status || m.status === "streaming"),
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

  const messages = messagesQuery.data ?? [];

  return (
    <div className="flex h-full flex-col">
      <BranchToolbar thread={threadQuery.data} />
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
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

interface MessageBubbleProps {
  message: {
    id: string;
    role: string;
    text: string;
    createdAt: string;
    status?: string;
  };
}

function MessageBubble({ message }: MessageBubbleProps) {
  const t = useT();
  const roleLabel =
    message.role === "user"
      ? t("chat.user")
      : message.role === "assistant"
        ? t("chat.assistant")
        : t("chat.system");
  const isAssistant = message.role === "assistant";
  const isError = message.status === "error" || message.status === "failed";
  return (
    <div
      className={
        "mb-3 rounded-md border p-3 " +
        (isError
          ? "border-red-500/40 bg-red-500/10"
          : isAssistant
            ? "border-border/60 bg-accent/30"
            : "border-border/60 bg-card")
      }
    >
      <div className="mb-1 flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
        <span>{roleLabel}</span>
        <span>{new Date(message.createdAt).toLocaleTimeString()}</span>
      </div>
      <div className="whitespace-pre-wrap text-sm leading-6">{message.text}</div>
      {isError ? (
        <div className="mt-2 text-xs text-red-300">{t("chat.turnFailed")}</div>
      ) : null}
    </div>
  );
}
