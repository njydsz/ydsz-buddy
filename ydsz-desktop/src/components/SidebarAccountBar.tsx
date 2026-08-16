/**
 * @file 侧栏底部用户行
 *
 * 仿照 ZCode / Trae 等桌面端 AI 客户端的"单行账户栏"模式：
 * 把设置入口、设备入口、用户名融合到同一行，最大限度压缩侧栏底部高度：
 *
 * ```
 * ┌───────────────────────────────────────────────────────┐
 * │  [头像] 用户名1888                  📱  ⚙             │
 * └───────────────────────────────────────────────────────┘
 * ```
 *
 * - **结构**：`h-11` 单行 + `gap-1.5` 内距，左侧 avatar + 名称、右侧 icon 按钮
 * - **数据**：当前通过 `useMessages().accountBar.guest` 作为兜底用户名；
 *   真实账号接入时只需把 `displayName` 替换为 store/hook 的派生值
 * - **行为**：
 *   - 设置按钮：跳转到 `/_chat/settings`
 *   - 设备按钮：暂作"查看当前设备"占位
 *   - 用户菜单（点击 avatar / 名称）：预留 popover hook
 *
 * ## 核心导出
 *
 * - `SidebarAccountBar`：主组件
 *
 * ## 使用场景
 *
 * - 侧栏 `SidebarFooter` 顶部
 * - 任何需要"用户名 + 设置 + 设备"单行布局的紧凑 UI
 *
 * ## 注意事项
 *
 * - 图标按钮均为 `icon-xs` 风格，与侧栏其他入口保持一致
 * - 名称过长时通过 `truncate` + `min-w-0` 防止溢出
 */
import { type FC, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";

import { DeviceMobileIcon, SettingsIcon } from "~/lib/icons";
import { useMessages } from "~/i18n/I18nContext";
import { cn } from "~/lib/utils";

interface SidebarAccountBarProps {
  /** Optional user display name. When absent we fall back to `accountBar.guest`. */
  displayName?: string | null;
  /** Optional avatar URL / image source. When absent we render the placeholder avatar. */
  avatarUrl?: string | null;
  /** Optional plan / tier label rendered after the username (e.g. "Free"). */
  planLabel?: string | null;
  /** Optional click handler for the avatar / name area (account menu trigger). */
  onOpenAccountMenu?: () => void;
  /** Optional click handler for the device icon. Defaults to noop. */
  onOpenDevicePanel?: () => void;
  className?: string;
}

const placeholderAvatar = "data:image/svg+xml;utf8," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2399a0a8'>" +
      "<circle cx='12' cy='8' r='4' />" +
      "<path d='M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8' />" +
    "</svg>",
  );

export const SidebarAccountBar: FC<SidebarAccountBarProps> = ({
  displayName,
  avatarUrl,
  planLabel,
  onOpenAccountMenu,
  onOpenDevicePanel,
  className,
}) => {
  const messages = useMessages();
  const navigate = useNavigate();

  const handleOpenSettings = useCallback(() => {
    void navigate({ to: "/settings" });
  }, [navigate]);

  const resolvedName = displayName?.trim() || messages.accountBar.guest;
  const resolvedAvatar = avatarUrl ?? placeholderAvatar;

  return (
    <div
      data-testid="sidebar-account-bar"
      className={cn(
        "flex h-11 items-center gap-2 rounded-lg px-1.5 text-(length:--app-font-size-ui,12px) hover:bg-(--sidebar-accent)/60",
        className,
      )}
    >
      <button
        type="button"
        onClick={onOpenAccountMenu}
        title={messages.accountBar.userMenuTooltip}
        aria-label={messages.accountBar.userMenuTooltip}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-1 py-1 text-left text-foreground/90 transition-colors hover:bg-(--sidebar-accent)"
      >
        <span className="inline-flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted-foreground/25 text-background">
          <img
            alt=""
            draggable={false}
            src={resolvedAvatar}
            className="size-7 object-cover"
          />
        </span>
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate font-medium text-foreground/90">
            {resolvedName}
          </span>
          {planLabel ? (
            <span className="truncate text-[10px] text-muted-foreground/65">
              {planLabel}
            </span>
          ) : null}
        </span>
      </button>

      <button
        type="button"
        onClick={onOpenDevicePanel}
        title={messages.accountBar.deviceTooltip}
        aria-label={messages.accountBar.deviceTooltip}
        className="sidebar-icon-button inline-flex size-7 shrink-0 items-center justify-center"
      >
        <DeviceMobileIcon className="size-[15px]" />
      </button>
      <button
        type="button"
        onClick={handleOpenSettings}
        title={messages.accountBar.settingsTooltip}
        aria-label={messages.accountBar.settingsTooltip}
        className="sidebar-icon-button inline-flex size-7 shrink-0 items-center justify-center"
      >
        <SettingsIcon className="size-[15px]" />
      </button>
    </div>
  );
};
