/**
 * @file DraftRecoveryNotice
 * @description 离线草稿恢复提示
 *
 * 当用户重新上线时，如果有保存的离线草稿，会在 ChatView 顶部展示一条
 * 短横条提示用户恢复。点击「恢复」按钮将草稿内容写回 Composer。
 */

import { memo, useEffect, useState } from "react";
import { useNetworkStatus } from "~/hooks/useNetworkStatus";
import { useComposerOfflineDrafts } from "~/hooks/useComposerOfflineDrafts";
import { useMessages } from "~/i18n/I18nContext";
import type { ThreadId } from "~/contracts";

interface DraftRecoveryNoticeProps {
  threadId: ThreadId | null;
  onRestore: (content: string) => void;
}

export const DraftRecoveryNotice = memo(function DraftRecoveryNotice({
  threadId,
  onRestore,
}: DraftRecoveryNoticeProps) {
  const messages = useMessages();
  const t = messages.chat;
  const { isOffline, status } = useNetworkStatus();
  const { drafts, removeDraft, totalCount } = useComposerOfflineDrafts(threadId);
  const [wasOffline, setWasOffline] = useState(false);

  // 跟踪离线→在线的恢复
  useEffect(() => {
    if (isOffline) {
      setWasOffline(true);
    } else if (wasOffline && status === "online") {
      // 离线后恢复：保持 wasOffline=true 让提示横幅展示
      // 用户点击恢复或关闭后重置
    }
  }, [isOffline, status, wasOffline]);

  // 没有草稿 / 没有离线经历 → 不展示
  if (drafts.length === 0 || !wasOffline) return null;
  if (isOffline) return null; // 离线时不展示恢复条，只展示顶栏离线徽章

  const mostRecent = drafts[0];

  return (
    <div
      role="region"
      aria-label="Offline draft recovery"
      className="flex items-center gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-200"
    >
      <div className="min-w-0 flex-1 truncate">
        <span className="font-semibold">
          {t.offline.draftsRestoredToastTitle.replace("{count}", String(drafts.length))}
        </span>
        <span className="ml-2 text-amber-700/80 dark:text-amber-200/80">
          {t.offline.draftsRestoredToastDescription}
        </span>
        {totalCount > 1 && (
          <span className="ml-2 rounded-full bg-amber-500/20 px-1.5 text-[10px] tabular-nums">
            {totalCount}
          </span>
        )}
      </div>
      <button
        type="button"
        className="rounded bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-700 transition hover:bg-amber-500/30 dark:text-amber-200"
        onClick={() => {
          onRestore(mostRecent.content);
          removeDraft(mostRecent.id);
        }}
      >
        恢复
      </button>
      <button
        type="button"
        className="text-xs text-amber-700/70 hover:text-amber-700 dark:text-amber-200/70 dark:hover:text-amber-200"
        onClick={() => {
          drafts.forEach((d) => removeDraft(d.id));
          setWasOffline(false);
        }}
        aria-label="Dismiss"
      >
        忽略
      </button>
    </div>
  );
});
