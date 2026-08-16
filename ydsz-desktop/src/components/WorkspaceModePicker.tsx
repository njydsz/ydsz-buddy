/**
 * @file WorkspaceModePicker.tsx
 * @description Trae 风格的工作区模式/目录选择器：左 [模式▾] + 右 [选择文件夹/当前路径]
 *
 * 取代了之前依赖 server welcome 事件自动注入 homeDir 的方案，
 * 改为由用户在 landing 页面显式选择项目目录。
 *
 * 三种模式：
 * - local: 本地目录(默认)
 * - worktree: 基于本地目录创建 git worktree
 * - cloud: 云端开发环境(占位,UI 暂时禁用,显示「敬请期待」提示)
 */
import { useCallback, useState } from "react";
import {
  ChevronDownIcon,
  CloudUploadIcon,
  DeviceLaptopIcon,
  FolderIcon,
  GlobeIcon,
  WorktreeIcon,
} from "~/lib/icons";
import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";
import { useMessages } from "~/i18n/I18nContext";
import { useWorkspaceStore, type WorkspaceMode } from "~/workspaceStore";
import { useWorkspaceFolderPicker } from "~/hooks/useWorkspaceFolderPicker";
import { cn } from "~/lib/utils";

interface WorkspaceModePickerProps {
  workspaceId: string;
  /** 用户已选的目录(per-workspace) */
  cwd: string | null;
  /** 当前 workspace 的运行模式 */
  mode: WorkspaceMode;
  /** 当用户点击「选择文件夹」调起系统 picker 之前,父组件可同步设置其他状态(例如 loading) */
  onBeforePick?: () => void;
}

const MODE_OPTIONS: ReadonlyArray<{
  id: WorkspaceMode;
  icon: typeof DeviceLaptopIcon;
  available: boolean;
}> = [
  { id: "local", icon: DeviceLaptopIcon, available: true },
  { id: "worktree", icon: WorktreeIcon, available: true },
  { id: "ssh", icon: GlobeIcon, available: true },
  { id: "cloud", icon: CloudUploadIcon, available: false },
];

/**
 * 截取路径尾段,用于在 pill 上展示。
 * Windows / POSIX 都按分隔符切。
 */
function pathBasename(cwd: string): string {
  const segments = cwd.split(/[/\\]/).filter(Boolean);
  return segments[segments.length - 1] ?? cwd;
}

export function WorkspaceModePicker({
  workspaceId,
  cwd,
  mode,
  onBeforePick,
}: WorkspaceModePickerProps) {
  const messages = useMessages();
  const setWorkspaceMode = useWorkspaceStore((state) => state.setWorkspaceMode);
  const { pickWorkspaceFolder } = useWorkspaceFolderPicker();
  const [isPicking, setIsPicking] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);

  const handlePickFolder = useCallback(async () => {
    if (isPicking) {
      return;
    }
    onBeforePick?.();
    setIsPicking(true);
    setPickerError(null);
    try {
      await pickWorkspaceFolder({ workspaceId, mode });
    } catch (error) {
      setPickerError(
        error instanceof Error ? error.message : messages.workspaceModePicker.pickFolderError,
      );
    } finally {
      setIsPicking(false);
    }
  }, [isPicking, messages, mode, onBeforePick, pickWorkspaceFolder, workspaceId]);

  const currentMode = MODE_OPTIONS.find((option) => option.id === mode) ?? MODE_OPTIONS[0]!;
  const CurrentModeIcon = currentMode.icon;
  const modeLabel = messages.workspaceModePicker.modes[mode];
  const placeholder = messages.workspaceModePicker.chooseFolder;

  return (
    <div className="flex w-full flex-col items-start gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* 模式选择 */}
        <Popover>
          <PopoverTrigger
            aria-label={messages.workspaceModePicker.modeLabel}
            data-testid="workspace-mode-trigger"
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-lg border border-border/60 bg-background/80 px-3 text-[13px] text-foreground/80 transition-colors",
              "hover:border-border hover:bg-muted/40 hover:text-foreground",
              "data-[popup-open]:border-border data-[popup-open]:bg-muted/50",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
            )}
          >
            <CurrentModeIcon className="size-3.5 text-foreground/70" />
            <span>{modeLabel}</span>
            <ChevronDownIcon className="size-3 opacity-60" />
          </PopoverTrigger>
          <PopoverPopup side="bottom" align="start" sideOffset={6} className="w-56 p-1">
            <div
              role="menu"
              aria-label={messages.workspaceModePicker.modeLabel}
              className="flex flex-col gap-0.5"
            >
              {MODE_OPTIONS.map((option) => {
                const Icon = option.icon;
                const label = messages.workspaceModePicker.modes[option.id];
                const hint = option.available
                  ? null
                  : messages.workspaceModePicker.comingSoonHint;
                const active = option.id === mode;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    aria-disabled={!option.available}
                    data-testid={`workspace-mode-option-${option.id}`}
                    disabled={!option.available}
                    onClick={() => {
                      if (!option.available) {
                        return;
                      }
                      setWorkspaceMode(workspaceId, option.id);
                    }}
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors",
                      option.available
                        ? "hover:bg-muted/50"
                        : "cursor-not-allowed opacity-55",
                      active && "bg-muted/40",
                    )}
                  >
                    <Icon className="mt-0.5 size-3.5 shrink-0 text-foreground/70" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-medium text-foreground/90">{label}</span>
                      {hint ? (
                        <span className="mt-0.5 text-[11px] text-muted-foreground/70">
                          {hint}
                        </span>
                      ) : null}
                    </span>
                    {active ? (
                      <span className="mt-1 size-1.5 shrink-0 rounded-full bg-sky-500" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </PopoverPopup>
        </Popover>

        {/* 文件夹选择 */}
        <button
          type="button"
          onClick={() => void handlePickFolder()}
          disabled={isPicking}
          data-testid="workspace-folder-picker"
          aria-label={
            cwd
              ? messages.workspaceModePicker.changeFolder
              : messages.workspaceModePicker.chooseFolder
          }
          title={cwd ?? undefined}
          className={cn(
            "inline-flex h-9 max-w-[min(60vw,28rem)] items-center gap-2 rounded-lg border border-border/60 bg-background/80 px-3 text-[13px] transition-colors",
            cwd
              ? "text-foreground/90 hover:border-border hover:bg-muted/40"
              : "text-muted-foreground hover:border-border hover:bg-muted/40 hover:text-foreground/90",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
            isPicking && "cursor-wait opacity-70",
          )}
        >
          <FolderIcon className="size-3.5 shrink-0 text-foreground/70" />
          <span className="truncate">
            {isPicking
              ? messages.workspaceModePicker.openingPicker
              : cwd
                ? pathBasename(cwd)
                : placeholder}
          </span>
        </button>
      </div>

      {cwd ? (
        <p
          className="max-w-full truncate text-[11px] text-muted-foreground/65"
          data-testid="workspace-folder-path"
        >
          {cwd}
        </p>
      ) : null}

      {pickerError ? (
        <p className="text-[12px] text-rose-500" role="alert">
          {pickerError}
        </p>
      ) : null}
    </div>
  );
}

export default WorkspaceModePicker;
