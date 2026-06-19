import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { rpc } from "@/lib/rpc";
import { getNativeApi } from "@/lib/nativeApi";

interface Props {
  threadId: string;
}

export function ComposerPromptEditor({ threadId }: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const onSubmit = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await rpc.threadSendMessage({ threadId, text });
      setText("");
      queryClient.invalidateQueries({ queryKey: ["thread", threadId, "messages"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onPickFolder = async () => {
    const api = getNativeApi();
    if (!api) return;
    // The folder picker returns a path; the React side feeds that
    // path into `filesystem.readFile` to attach the contents.
    const dialog = await import("@tauri-apps/plugin-dialog");
    const path = await dialog.open({ directory: true, multiple: false });
    if (typeof path === "string") {
      setText((prev) => (prev ? `${prev}\n@${path}` : `@${path}`));
    }
  };

  return (
    <div className="border-t border-border/60 bg-card/40 p-3">
      <textarea
        className="w-full resize-none rounded-md border border-border bg-background p-2 text-sm text-foreground focus:border-primary focus:outline-none"
        rows={3}
        placeholder="Ask Remi Code anything…  (use @ to attach files)"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            void onSubmit();
          }
        }}
        disabled={busy}
      />
      <div className="mt-2 flex items-center justify-between">
        <button
          className="rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground hover:border-primary hover:text-foreground"
          onClick={onPickFolder}
        >
          @ Attach
        </button>
        <button
          className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          onClick={onSubmit}
          disabled={busy || !text.trim()}
        >
          {busy ? "Sending…" : "Send"}
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
