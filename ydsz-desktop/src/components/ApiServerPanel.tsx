/**
 * @file API 访问配置面板（G2-P0）
 *
 * 提供 HTTP API 网关的启动/停止控制、端口配置、API Key 管理、请求计数器显示。
 */

import { memo, useCallback, useEffect, useState } from "react";
import { CopyIcon, Key, Loader2, Play, RefreshCw, Square, Zap } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Switch } from "./ui/switch";
import { Badge } from "./ui/badge";
import { toastManager } from "./ui/toast";
import { useMessages } from "../i18n";
import {
  apiServerStart,
  apiServerStop,
  apiServerStatus,
  apiServerRegenerateKey,
  type ApiServerStatus,
} from "../contracts/apiServer";

export const ApiServerPanel = memo(function ApiServerPanel() {
  const messages = useMessages();
  const [running, setRunning] = useState(false);
  const [port, setPort] = useState(18791);
  const [apiKey, setApiKey] = useState("");
  const [requestCount, setRequestCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [enabled, setEnabled] = useState(false);

  // 初始化时拉取状态
  useEffect(() => {
    if (typeof window === "undefined" || !(window as { __TAURI__?: unknown }).__TAURI__) {
      return;
    }
    apiServerStatus()
      .then((status: ApiServerStatus) => {
        setRunning(status.running);
        if (status.port > 0) setPort(status.port);
        setRequestCount(status.requestCount);
        setEnabled(status.running);
      })
      .catch(() => {
        // 未运行时忽略
      });
  }, []);

  const handleStart = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiServerStart({ port });
      setRunning(true);
      setEnabled(true);
      toastManager.success(result);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toastManager.error(`启动失败: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [port]);

  const handleStop = useCallback(async () => {
    setLoading(true);
    try {
      await apiServerStop();
      setRunning(false);
      setEnabled(false);
      toastManager.success("API 服务已停止");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toastManager.error(`停止失败: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRegenerateKey = useCallback(async () => {
    setLoading(true);
    try {
      const newKey = await apiServerRegenerateKey();
      setApiKey(newKey);
      toastManager.success("API Key 已重新生成");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toastManager.error(`生成失败: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCopyKey = useCallback(() => {
    if (apiKey) {
      navigator.clipboard.writeText(apiKey).then(() => {
        toastManager.success("已复制到剪贴板");
      });
    }
  }, [apiKey]);

  return (
    <div className="space-y-4">
      {/* 启用/启动控制 */}
      <div className="flex items-center justify-between rounded-md border border-border/60 p-3">
        <div className="flex items-center gap-2">
          <Zap className="size-4 text-primary" />
          <span className="text-sm font-medium">HTTP API 网关</span>
          {running ? (
            <Badge variant="default" className="bg-green-500/15 text-green-600">
              运行中
            </Badge>
          ) : (
            <Badge variant="secondary">已停止</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={enabled}
            onCheckedChange={(checked) => {
              if (checked) handleStart();
              else handleStop();
            }}
            disabled={loading}
          />
          {loading && <Loader2 className="size-4 animate-spin" />}
          {running ? (
            <Button size="xs" variant="destructive" onClick={handleStop} disabled={loading}>
              <Square className="size-3" />
              停止
            </Button>
          ) : (
            <Button size="xs" variant="default" onClick={handleStart} disabled={loading}>
              <Play className="size-3" />
              启动
            </Button>
          )}
        </div>
      </div>

      {/* 端口配置 */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">监听端口</label>
        <Input
          type="number"
          value={port}
          onChange={(e) => setPort(Number(e.target.value))}
          min={1024}
          max={65535}
          disabled={running}
          className="h-8 text-sm"
        />
      </div>

      {/* API Key 管理 */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          <Key className="mr-1 inline size-3" />
          API Key
        </label>
        <div className="flex items-center gap-2">
          <Input
            type="text"
            value={apiKey || "—"}
            readOnly
            placeholder="启动后自动生成，或点击重新生成"
            className="h-8 flex-1 font-mono text-xs"
          />
          <Button size="xs" variant="outline" onClick={handleCopyKey} disabled={!apiKey}>
            <CopyIcon className="size-3" />
            复制
          </Button>
          <Button size="xs" variant="outline" onClick={handleRegenerateKey} disabled={loading}>
            <RefreshCw className="size-3" />
            重新生成
          </Button>
        </div>
      </div>

      {/* 请求统计 */}
      <div className="flex items-center gap-4 rounded-md border border-border/40 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <span>已处理请求: <strong className="foreground">{requestCount}</strong></span>
        <span>速率限制: 60 req/min/IP</span>
        <span>端点: /v1/chat/completions</span>
      </div>
    </div>
  );
});
