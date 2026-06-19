import { useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { rpc } from "@/lib/rpc";
import { ComposerPromptEditor } from "./ComposerPromptEditor";
import { BranchToolbar } from "./BranchToolbar";

export function ChatView() {
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
      const data = q.state.data as Array<{ role: string }> | undefined;
      // Poll while any message is still streaming.
      return data?.some((m) => m.role === "assistant") ? 2_000 : false;
    },
  });

  if (!threadId) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Select a thread to start chatting.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <BranchToolbar thread={threadQuery.data} />
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {(messagesQuery.data ?? []).map((message) => (
          <div
            key={message.id}
            className={
              "mb-3 rounded-md border border-border/60 p-3 " +
              (message.role === "user" ? "bg-card" : "bg-accent/40")
            }
          >
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {message.role}
            </div>
            <div className="whitespace-pre-wrap text-sm">{message.text}</div>
          </div>
        ))}
        {(messagesQuery.data ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No messages yet. Type a prompt below to start.
          </div>
        ) : null}
      </div>
      <ComposerPromptEditor threadId={threadId} />
    </div>
  );
}
