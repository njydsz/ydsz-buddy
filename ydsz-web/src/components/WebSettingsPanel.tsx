/**
 * @file Web 设置面板组件
 * @description 连接配置 + 主题切换 + WebSocket 重连控制
 */

import { useCallback, useState } from "react";
import { X, Wifi, WifiOff, Moon, Sun, Monitor, RotateCcw } from "lucide-react";
import { useAppStore } from "~/store/appStore";
import { cn } from "~/lib/utils";
import type { ConnectionStatus } from "~/store/appStore";
import { getSharedWsClient, disposeSharedWsClient } from "~/adapters/wsClient";

interface WebSettingsPanelProps {
  /** 是否可见 */
  isOpen: boolean;
  /** 关闭面板回调 */
  onClose: () => void;
}

/** 连接状态指示器 */
function ConnectionIndicator({ status }: { status: ConnectionStatus }) {
  const statusMap: Record<
    ConnectionStatus,
    { color: string; label: string; icon: typeof Wifi }
  > = {
    connecting: { color: "text-yellow-500", label: "连接中...", icon: Wifi },
    connected: { color: "text-green-500", label: "已连接", icon: Wifi },
    disconnected: { color: "text-muted-foreground", label: "未连接", icon: WifiOff },
    error: { color: "text-red-500", label: "连接错误", icon: WifiOff },
  };

  const { color, label, icon: Icon } = statusMap[status];

  return (
    <div className={cn("flex items-center gap-2", color)}>
      <Icon size={14} />
      <span className="text-xs">{label}</span>
    </div>
  );
}

export function WebSettingsPanel({ isOpen, onClose }: WebSettingsPanelProps) {
  const { isDark, connectionStatus, setConnectionStatus } =
    useAppStore();
  const [wsUrl, setWsUrl] = useState(
    () => localStorage.getItem("ydsz_ws_url") ?? "",
  );

  // 保存配置
  const handleSave = useCallback(() => {
    if (wsUrl.trim()) {
      localStorage.setItem("ydsz_ws_url", wsUrl.trim());
    } else {
      localStorage.removeItem("ydsz_ws_url");
    }
    onClose();
  }, [wsUrl, onClose]);

  // 手动重连：销毁旧客户端并用新 URL 重建
  const handleReconnect = useCallback(() => {
    setConnectionStatus("connecting");

    // 销毁旧客户端
    disposeSharedWsClient();

    // 创建新客户端并连接
    const newUrl = wsUrl.trim() || undefined;
    const client = getSharedWsClient({
      url: newUrl,
      onConnected: () => setConnectionStatus("connected"),
      onDisconnected: () => setConnectionStatus("disconnected"),
      onError: () => setConnectionStatus("error"),
    });
    client.connect();
  }, [wsUrl, setConnectionStatus]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 面板内容 */}
      <div className="relative z-10 w-full max-w-md rounded-lg border bg-card p-6 shadow-xl">
        {/* 标题栏 */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium">设置</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>

        {/* 设置项 */}
        <div className="space-y-4">
          {/* 连接状态 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">连接状态</label>
            <div className="flex items-center justify-between rounded-md border p-3">
              <ConnectionIndicator status={connectionStatus} />
              <button
                type="button"
                onClick={handleReconnect}
                disabled={connectionStatus === "connecting"}
                className={cn(
                  "flex items-center gap-1 text-xs text-primary hover:underline",
                  connectionStatus === "connecting" && "opacity-50 cursor-not-allowed",
                )}
              >
                <RotateCcw size={12} />
                重连
              </button>
            </div>
          </div>

          {/* WebSocket URL */}
          <div className="space-y-2">
            <label htmlFor="ws-url" className="text-sm font-medium">
              WebSocket URL
            </label>
            <input
              id="ws-url"
              type="text"
              value={wsUrl}
              onChange={(e) => setWsUrl(e.target.value)}
              placeholder="ws://localhost:7777/ws"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              默认通过 Vite 代理连接 /ws，填写后将直连指定地址
            </p>
          </div>

          {/* 主题切换 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">外观主题</label>
            <div className="grid grid-cols-3 gap-2">
              <ThemeButton
                active={!isDark && !window.matchMedia("(prefers-color-scheme: dark)").matches}
                onClick={() => useAppStore.getState().setDark(false)}
                icon={<Sun size={14} />}
                label="浅色"
              />
              <ThemeButton
                active={isDark}
                onClick={() => useAppStore.getState().setDark(true)}
                icon={<Moon size={14} />}
                label="深色"
              />
              <ThemeButton
                active={false}
                onClick={() => {
                  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
                  useAppStore.getState().setDark(systemDark);
                }}
                icon={<Monitor size={14} />}
                label="跟随系统"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              当前: {isDark ? "深色模式" : "浅色模式"}
            </p>
          </div>
        </div>

        {/* 底部操作 */}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:bg-accent"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

/** 主题切换按钮 */
function ThemeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 rounded-md border p-2 text-xs transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
