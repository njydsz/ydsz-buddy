/**
 * @file WorkspaceMigrationHint.tsx
 * @description v2 → v3 升级后的引导横幅
 *
 * 当用户从 v2 storage 升级上来时,`migrationHintDismissed` 默认 false,
 * 此时如果还有 workspace 页面没有 cwd,就显示这条横幅提醒用户重新选目录。
 *
 * 用户 dismiss 后状态持久化,后续不再展示。
 * 用户选完所有目录后 selector 自动返回 false,横幅也消失。
 *
 * 横幅采用低调的 info 风格(蓝色边框 + 简短文案),不打断主流程。
 */
import { useCallback } from "react";
import { InfoIcon, XIcon } from "~/lib/icons";
import { useMessages } from "~/i18n/I18nContext";
import {
  selectIsMigrationHintPending,
  selectUnsetCwdWorkspaceCount,
  useWorkspaceStore,
} from "~/workspaceStore";
import { cn } from "~/lib/utils";

export function WorkspaceMigrationHint() {
  const messages = useMessages();
  const isPending = useWorkspaceStore(selectIsMigrationHintPending);
  const unsetCount = useWorkspaceStore(selectUnsetCwdWorkspaceCount);
  const dismissMigrationHint = useWorkspaceStore((state) => state.dismissMigrationHint);

  const handleDismiss = useCallback(() => {
    dismissMigrationHint();
  }, [dismissMigrationHint]);

  if (!isPending) {
    return null;
  }

  return (
    <div
      data-testid="workspace-migration-hint"
      role="status"
      aria-live="polite"
      className={cn(
        "flex w-full items-start gap-2 rounded-lg border border-sky-500/30 bg-sky-500/8 px-3 py-2 text-[12px]",
      )}
    >
      <InfoIcon className="mt-0.5 size-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground/90">
          {messages.workspaceMigrationHint.title}
        </p>
        <p className="mt-0.5 text-muted-foreground/85">
          {messages.workspaceMigrationHint.description(unsetCount)}
        </p>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label={messages.workspaceMigrationHint.dismiss}
        data-testid="workspace-migration-hint-dismiss"
        className={cn(
          "inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-sky-500/30 px-2 text-[11px] font-medium text-sky-700 transition-colors",
          "hover:bg-sky-500/15 hover:text-sky-800",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30",
          "dark:text-sky-300 dark:hover:text-sky-100",
        )}
      >
        <XIcon className="size-3" />
        {messages.workspaceMigrationHint.dismiss}
      </button>
    </div>
  );
}

export default WorkspaceMigrationHint;
