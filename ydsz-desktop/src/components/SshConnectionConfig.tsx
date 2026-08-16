/**
 * @file SSH 远程连接配置组件
 * @description 提供 SSH 远程连接的配置界面，支持密码和密钥两种认证方式
 * @layer 组件层
 */

import { useCallback, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { toastManager } from "./ui/toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Server, Key, Lock, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import type { SshConnectionStatusView } from "@/contracts/ssh";

/** SSH 认证方式（UI 表单状态） */
export type SshAuthType = "password" | "key";

/** SSH 连接配置（UI 表单状态，非 wire format） */
export interface SshConnectionConfig {
  /** 主机地址 */
  host: string;
  /** 端口 */
  port: number;
  /** 用户名 */
  username: string;
  /** 认证方式 */
  authType: SshAuthType;
  /** 密码（密码认证时） */
  password?: string;
  /** 私钥路径（密钥认证时） */
  keyPath?: string;
  /** 密码短语（可选） */
  passphrase?: string;
  /** 是否启用自动重连 */
  autoReconnect: boolean;
}

/** SSH 连接状态（来自后端 `ssh_connect` 响应，契约类型） */
export type SshConnectionStatus = SshConnectionStatusView;

interface SshConnectionConfigProps {
  /** 是否显示 */
  visible?: boolean;
  /** 关闭回调 */
  onClose?: () => void;
  /** 连接成功回调 */
  onConnected?: (connectionId: string) => void;
}

/**
 * SSH 远程连接配置组件
 *
 * 提供 SSH 连接的配置界面，支持密码和密钥两种认证方式
 */
export function SshConnectionConfig({
  visible = false,
  onClose,
  onConnected,
}: SshConnectionConfigProps) {
  const [config, setConfig] = useState<SshConnectionConfig>({
    host: "",
    port: 22,
    username: "",
    authType: "password",
    password: "",
    keyPath: "",
    passphrase: "",
    autoReconnect: true,
  });

  const [connectionStatus, setConnectionStatus] = useState<SshConnectionStatus | null>(null);

  // 建立 SSH 连接
  const connectMutation = useMutation({
    mutationFn: async (config: SshConnectionConfig) => {
      const auth =
        config.authType === "password"
          ? { type: "password", password: config.password || "" }
          : {
              type: "key",
              keyPath: config.keyPath || "",
              passphrase: config.passphrase ?? null,
            };

      return invoke<SshConnectionStatus>("ssh_connect", {
        host: config.host,
        port: config.port,
        username: config.username,
        auth,
        autoReconnect: config.autoReconnect,
      });
    },
    onSuccess: (status) => {
      setConnectionStatus(status);
      toastManager.add({
        type: "success",
        title: "SSH 连接成功",
        description: `已连接到 ${status.host}:${status.port}`,
        timeout: 3000,
      });
      if (status.connectionId && onConnected) {
        onConnected(status.connectionId);
      }
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: "SSH 连接失败",
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  // 断开连接
  const disconnectMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      return invoke<void>("ssh_disconnect", { connectionId });
    },
    onSuccess: () => {
      setConnectionStatus(null);
      toastManager.add({
        type: "success",
        title: "已断开连接",
        timeout: 2000,
      });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: "断开连接失败",
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  const handleConnect = useCallback(() => {
    if (!config.host.trim()) {
      toastManager.add({
        type: "warning",
        title: "请输入主机地址",
        timeout: 2000,
      });
      return;
    }

    if (!config.username.trim()) {
      toastManager.add({
        type: "warning",
        title: "请输入用户名",
        timeout: 2000,
      });
      return;
    }

    if (config.authType === "password" && !config.password) {
      toastManager.add({
        type: "warning",
        title: "请输入密码",
        timeout: 2000,
      });
      return;
    }

    if (config.authType === "key" && !config.keyPath) {
      toastManager.add({
        type: "warning",
        title: "请输入私钥路径",
        timeout: 2000,
      });
      return;
    }

    connectMutation.mutate(config);
  }, [config, connectMutation]);

  const handleDisconnect = useCallback(() => {
    if (connectionStatus?.connectionId) {
      disconnectMutation.mutate(connectionStatus.connectionId);
    }
  }, [connectionStatus, disconnectMutation]);

  if (!visible) return null;

  const isConnected = connectionStatus?.state === "Connected";

  return (
    <div className="flex h-full flex-col border-l bg-background">
      {/* 头部 */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Server className="size-5 text-primary" />
          <h2 className="text-sm font-semibold">SSH 远程连接</h2>
          {isConnected && (
            <Badge variant="secondary" className="text-xs">
              <CheckCircle2 className="mr-1 size-3" />
              已连接
            </Badge>
          )}
        </div>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose} className="size-8 p-0">
            <XCircle className="size-4" />
          </Button>
        )}
      </div>

      {/* 配置表单 */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* 连接状态提示 */}
        {isConnected && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950/20">
            <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
              <CheckCircle2 className="size-4" />
              <span>
                已连接到 {connectionStatus.username}@{connectionStatus.host}:
                {connectionStatus.port}
              </span>
            </div>
          </div>
        )}

        {/* 主机地址 */}
        <div className="space-y-2">
          <Label htmlFor="ssh-host">主机地址</Label>
          <Input
            id="ssh-host"
            placeholder="example.com 或 192.168.1.100"
            value={config.host}
            onChange={(e) => setConfig({ ...config, host: e.target.value })}
            disabled={connectMutation.isPending || isConnected}
          />
        </div>

        {/* 端口 */}
        <div className="space-y-2">
          <Label htmlFor="ssh-port">端口</Label>
          <Input
            id="ssh-port"
            type="number"
            placeholder="22"
            value={config.port}
            onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value) || 22 })}
            disabled={connectMutation.isPending || isConnected}
          />
        </div>

        {/* 用户名 */}
        <div className="space-y-2">
          <Label htmlFor="ssh-username">用户名</Label>
          <Input
            id="ssh-username"
            placeholder="root"
            value={config.username}
            onChange={(e) => setConfig({ ...config, username: e.target.value })}
            disabled={connectMutation.isPending || isConnected}
          />
        </div>

        {/* 认证方式 */}
        <div className="space-y-2">
          <Label>认证方式</Label>
          <Select
            value={config.authType}
            onValueChange={(value) => {
              if (value === "key" || value === "password") {
                setConfig({ ...config, authType: value });
              }
            }}
            disabled={connectMutation.isPending || isConnected}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="password">
                <div className="flex items-center gap-2">
                  <Lock className="size-4" />
                  <span>密码认证</span>
                </div>
              </SelectItem>
              <SelectItem value="key">
                <div className="flex items-center gap-2">
                  <Key className="size-4" />
                  <span>密钥认证</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 密码或密钥路径 */}
        {config.authType === "password" ? (
          <div className="space-y-2">
            <Label htmlFor="ssh-password">密码</Label>
            <Input
              id="ssh-password"
              type="password"
              placeholder="输入密码"
              value={config.password}
              onChange={(e) => setConfig({ ...config, password: e.target.value })}
              disabled={connectMutation.isPending || isConnected}
            />
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="ssh-key-path">私钥路径</Label>
              <Input
                id="ssh-key-path"
                placeholder="~/.ssh/id_rsa"
                value={config.keyPath}
                onChange={(e) => setConfig({ ...config, keyPath: e.target.value })}
                disabled={connectMutation.isPending || isConnected}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ssh-passphrase">密码短语（可选）</Label>
              <Input
                id="ssh-passphrase"
                type="password"
                placeholder="如果私钥有密码保护"
                value={config.passphrase}
                onChange={(e) => setConfig({ ...config, passphrase: e.target.value })}
                disabled={connectMutation.isPending || isConnected}
              />
            </div>
          </>
        )}

        {/* 自动重连 */}
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="ssh-auto-reconnect"
            checked={config.autoReconnect}
            onChange={(e) => setConfig({ ...config, autoReconnect: e.target.checked })}
            disabled={connectMutation.isPending || isConnected}
            className="size-4"
          />
          <Label htmlFor="ssh-auto-reconnect" className="text-sm font-normal">
            启用自动重连
          </Label>
        </div>
      </div>

      {/* 底部操作按钮 */}
      <div className="border-t p-4">
        {isConnected ? (
          <Button
            onClick={handleDisconnect}
            disabled={disconnectMutation.isPending}
            variant="destructive"
            className="w-full"
          >
            {disconnectMutation.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                断开中...
              </>
            ) : (
              <>
                <XCircle className="mr-2 size-4" />
                断开连接
              </>
            )}
          </Button>
        ) : (
          <Button
            onClick={handleConnect}
            disabled={connectMutation.isPending}
            className="w-full"
          >
            {connectMutation.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                连接中...
              </>
            ) : (
              <>
                <Server className="mr-2 size-4" />
                建立连接
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
