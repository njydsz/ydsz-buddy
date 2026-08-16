/**
 * @file MCP 客户端配置面板
 *
 * 本组件提供 Model Context Protocol (MCP) 服务器的配置管理界面。
 *
 * ## 核心功能
 *
 * - **官方预设**：1-click 安装 filesystem / fetch / github / git / sqlite / postgres / playwright / memory
 * - **配置列表**：显示已配置的 MCP 服务器
 * - **添加配置**：手动配置 command / args / env
 * - **编辑配置**：修改服务器参数
 * - **删除配置**：移除不再使用的服务器
 * - **测试连接**：启动进程 → MCP 握手 → 拉取工具列表
 *
 * ## 后端契约
 *
 * 调用 Tauri 命令（specta 生成绑定）：
 * - `mcp_list_servers` / `mcp_add_server` / `mcp_update_server` / `mcp_remove_server`
 * - `mcp_test_connection` / `mcp_list_presets` / `mcp_list_tools`
 *
 * 配置持久化到工作区 `.ydsz/mcp.json`（见 ydsz-code/src/mcp/config.rs）。
 */

import { memo, useState, useEffect, useCallback } from "react";
import {
  PiPlus,
  PiTrash,
  PiPencil,
  PiPlug,
  PiCheck,
  PiX,
  PiLightning,
  PiDatabase,
  PiGitBranch,
  PiGlobe,
  PiBrain,
  PiFolderOpen,
  PiPlay,
  PiCaretDown,
  PiCaretUp,
  PiPower,
} from "react-icons/pi";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import { cn } from "~/lib/utils";
import { toastManager } from "./ui/toast";
import { invoke } from "@tauri-apps/api/core";

/** MCP 服务器状态（与后端 McpServerStatus 对齐，serde rename_all = "lowercase"） */
type McpServerStatus = "disconnected" | "connecting" | "connected" | "error";

/** MCP 传输类型 */
type McpTransportType = "stdio" | "sse";

/** MCP 服务器配置（与后端 ydsz-code/src/mcp/config.rs::McpServerConfig 对齐） */
export interface McpServerConfig {
  /** 唯一 ID */
  id: string;
  /** 显示名称 */
  name: string;
  /** 启动命令（stdio: 可执行文件名 / sse: SSE 端点 URL） */
  command: string;
  /** 命令参数 */
  args: string[];
  /** 附加环境变量 */
  env: Record<string, string>;
  /** 是否启用 */
  enabled: boolean;
  /** 使用的预设 ID（可选） */
  preset?: string;
  /** 传输类型（stdio / sse，默认 stdio） */
  transportType?: McpTransportType;
  /** 当前状态（运行时） */
  status: McpServerStatus;
  /** 错误信息 */
  error?: string;
  /** 最后连接时间戳（毫秒） */
  lastConnectedAt?: number;
}

/** MCP 服务器预设（与后端 ydsz-code/src/mcp/presets.rs::McpServerPreset 对齐） */
export interface McpServerPreset {
  /** 预设 ID（如 "filesystem"） */
  id: string;
  /** 显示名称 */
  name: string;
  /** 描述 */
  description: string;
  /** 启动命令 */
  command: string;
  /** 命令参数（占位符用 {path} / {token} 等表示） */
  args: string[];
  /** 是否需要工作区路径 */
  needsWorkspacePath: boolean;
  /** 需要的环境变量 key 列表 */
  envKeys: string[];
  /** 提示文本 */
  hint?: string;
  /** 标签 */
  tags: string[];
  /** 分类 */
  category: string;
}

/** 测试连接结果（与后端 McpTestResult 对齐） */
interface McpTestResult {
  serverName: string;
  serverVersion: string;
  protocolVersion: string;
  toolCount: number;
  toolNames: string[];
}

/** MCP 服务器工具信息 */
interface McpToolInfo {
  name: string;
  description?: string;
}

interface McpSettingsPanelProps {
  /** 工作区根目录 */
  workspaceRoot?: string;
}

/** 预设分类元数据（图标 + 显示名） */
const PRESET_CATEGORY_META: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; label: string }
> = {
  filesystem: { icon: PiFolderOpen, label: "文件系统" },
  database: { icon: PiDatabase, label: "数据库" },
  "version-control": { icon: PiGitBranch, label: "版本控制" },
  knowledge: { icon: PiBrain, label: "知识图谱" },
  web: { icon: PiGlobe, label: "网络" },
  browser: { icon: PiGlobe, label: "浏览器" },
};

/**
 * MCP 服务器配置项
 */
const McpServerItem = memo(function McpServerItem({
  server,
  onEdit,
  onDelete,
  onTest,
  onToggleEnabled,
  tools,
}: {
  server: McpServerConfig;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
  onToggleEnabled: () => void;
  tools: McpToolInfo[] | null;
}) {
  const [showTools, setShowTools] = useState(false);
  const statusConfig: Record<
    McpServerStatus,
    { icon: React.ComponentType<{ className?: string }>; label: string; className: string }
  > = {
    disconnected: { icon: PiPlug, label: "未连接", className: "text-gray-500" },
    connecting: { icon: PiPlug, label: "连接中", className: "text-blue-500 animate-pulse" },
    connected: { icon: PiCheck, label: "已连接", className: "text-green-500" },
    error: { icon: PiX, label: "错误", className: "text-red-500" },
  };

  const config = statusConfig[server.status];
  const StatusIcon = config.icon;
  const hasTools = tools && tools.length > 0;

  return (
    <div className="flex flex-col rounded-lg border border-border/50 bg-muted/30 p-3">
      <div className="flex items-start gap-3">
        <StatusIcon className={cn("mt-0.5 size-4 shrink-0", config.className)} />

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{server.name}</span>
            {server.preset && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {server.preset}
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {config.label}
            </Badge>
            {server.transportType === "sse" && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 text-blue-600">
                SSE
              </Badge>
            )}
            {!server.enabled && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                已禁用
              </Badge>
            )}
            {hasTools && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-green-600">
                {tools!.length} 工具
              </Badge>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground font-mono">
            {server.command} {server.args.join(" ")}
          </p>
          {server.error && <p className="text-xs text-red-500">{server.error}</p>}
          {server.lastConnectedAt && (
            <p className="text-[10px] text-muted-foreground">
              最后连接: {new Date(server.lastConnectedAt).toLocaleString("zh-CN")}
            </p>
          )}
          {hasTools && (
            <button
              type="button"
              onClick={() => setShowTools((v) => !v)}
              className="flex items-center gap-1 text-[10px] text-primary hover:underline"
            >
              {showTools ? <PiCaretUp className="size-2.5" /> : <PiCaretDown className="size-2.5" />}
              {showTools ? "收起工具列表" : "查看工具列表"}
            </button>
          )}
          {showTools && hasTools && (
            <div className="mt-1 space-y-1 rounded-md border border-border/30 bg-background/50 p-2">
              {tools!.map((tool) => (
                <div key={tool.name} className="flex flex-col gap-0.5">
                  <span className="font-mono text-[10px] font-medium text-foreground">{tool.name}</span>
                  {tool.description && (
                    <span className="text-[10px] text-muted-foreground line-clamp-2">
                      {tool.description}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onToggleEnabled}
            aria-label={server.enabled ? "禁用" : "启用"}
            title={server.enabled ? "禁用" : "启用"}
          >
            <PiPower className={cn("size-3", server.enabled ? "text-green-500" : "text-muted-foreground")} />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onTest}
            disabled={server.status === "connecting" || !server.enabled}
            aria-label="测试连接"
            title="测试连接"
          >
            <PiPlug className="size-3" />
          </Button>
          <Button variant="ghost" size="icon-xs" onClick={onEdit} aria-label="编辑" title="编辑">
            <PiPencil className="size-3" />
          </Button>
          <Button variant="ghost" size="icon-xs" onClick={onDelete} aria-label="删除" title="删除">
            <PiTrash className="size-3" />
          </Button>
        </div>
      </div>
    </div>
  );
});

/**
 * 预设卡片（1-click 安装）
 */
const PresetCard = memo(function PresetCard({
  preset,
  installed,
  installing,
  onInstall,
}: {
  preset: McpServerPreset;
  installed: boolean;
  installing: boolean;
  onInstall: () => void;
}) {
  const meta = PRESET_CATEGORY_META[preset.category] ?? {
    icon: PiLightning,
    label: preset.category,
  };
  const Icon = meta.icon;

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-3 transition-colors",
        installed
          ? "border-green-500/30 bg-green-500/5"
          : "border-border/50 bg-muted/30 hover:bg-muted/60",
      )}
    >
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{preset.name}</span>
            {installed && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-green-600">
                <PiCheck className="mr-0.5 size-2.5" />
                已安装
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2">{preset.description}</p>
        </div>
      </div>

      {preset.hint && (
        <p className="text-[10px] text-muted-foreground/80 italic">{preset.hint}</p>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {preset.tags.slice(0, 3).map((tag) => (
            <Badge key={tag} variant="secondary" className="text-[9px] px-1 py-0">
              {tag}
            </Badge>
          ))}
        </div>
        <Button
          size="sm"
          variant={installed ? "outline" : "default"}
          onClick={onInstall}
          disabled={installed || installing}
          className="h-7 px-2 text-xs"
        >
          {installed ? "已安装" : installing ? "安装中..." : "1-click 安装"}
        </Button>
      </div>
    </div>
  );
});

/**
 * MCP 客户端配置面板
 */
export const McpSettingsPanel = memo(function McpSettingsPanel({
  workspaceRoot,
}: McpSettingsPanelProps) {
  const [servers, setServers] = useState<McpServerConfig[]>([]);
  const [presets, setPresets] = useState<McpServerPreset[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingServer, setEditingServer] = useState<McpServerConfig | null>(null);
  const [installingPresetId, setInstallingPresetId] = useState<string | null>(null);
  const [serverTools, setServerTools] = useState<Record<string, McpToolInfo[]> | null>(null);
  const [testingAll, setTestingAll] = useState(false);

  // 加载已配置的服务器
  const loadServers = useCallback(async () => {
    if (!workspaceRoot) return;
    try {
      const result = await invoke<McpServerConfig[]>("mcp_list_servers", { workspaceRoot });
      setServers(result);
    } catch (error) {
      console.error("Failed to load MCP servers:", error);
      toastManager.add({
        type: "error",
        title: "加载 MCP 配置失败",
        description: error instanceof Error ? error.message : "未知错误",
      });
    }
  }, [workspaceRoot]);

  // 加载预设列表
  const loadPresets = useCallback(async () => {
    try {
      const result = await invoke<McpServerPreset[]>("mcp_list_presets");
      setPresets(result);
    } catch (error) {
      console.error("Failed to load MCP presets:", error);
      // 预设加载失败不弹 toast（非阻塞性）
    }
  }, []);

  useEffect(() => {
    loadServers();
    loadPresets();
  }, [loadServers, loadPresets]);

  const handleAdd = () => {
    setEditingServer(null);
    setShowAddDialog(true);
  };

  const handleEdit = (server: McpServerConfig) => {
    setEditingServer(server);
    setShowAddDialog(true);
  };

  const handleDelete = async (serverId: string) => {
    try {
      await invoke("mcp_remove_server", { workspaceRoot, serverId });
      setServers((prev) => prev.filter((s) => s.id !== serverId));
      toastManager.add({ type: "success", title: "已删除 MCP 服务器" });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "删除失败",
        description: error instanceof Error ? error.message : "未知错误",
      });
    }
  };

  const handleTest = async (serverId: string) => {
    setServers((prev) =>
      prev.map((s) =>
        s.id === serverId ? { ...s, status: "connecting" as const, error: undefined } : s,
      ),
    );

    try {
      const result = await invoke<McpTestResult>("mcp_test_connection", {
        workspaceRoot,
        serverId,
      });
      setServers((prev) =>
        prev.map((s) =>
          s.id === serverId
            ? { ...s, status: "connected" as const, lastConnectedAt: Date.now() }
            : s,
        ),
      );
      // 缓存工具列表
      setServerTools((prev) => ({
        ...prev,
        [serverId]: result.toolNames.map((name) => ({ name })),
      }));
      toastManager.add({
        type: "success",
        title: "连接测试成功",
        description: `${result.serverName} v${result.serverVersion} · ${result.toolCount} 个工具`,
      });
    } catch (error) {
      setServers((prev) =>
        prev.map((s) =>
          s.id === serverId
            ? {
                ...s,
                status: "error" as const,
                error: error instanceof Error ? error.message : "连接失败",
              }
            : s,
        ),
      );
      toastManager.add({
        type: "error",
        title: "连接测试失败",
        description: error instanceof Error ? error.message : "未知错误",
      });
    }
  };

  /** 批量测试所有已启用的服务器 */
  const handleTestAll = async () => {
    const enabledServers = servers.filter((s) => s.enabled);
    if (enabledServers.length === 0) {
      toastManager.add({ type: "info", title: "没有已启用的服务器可测试" });
      return;
    }
    setTestingAll(true);
    // 并行测试所有服务器
    await Promise.allSettled(enabledServers.map((s) => handleTest(s.id)));
    setTestingAll(false);
    toastManager.add({ type: "success", title: `已测试 ${enabledServers.length} 个服务器` });
  };

  /** 快速切换启用/禁用 */
  const handleToggleEnabled = async (serverId: string) => {
    const server = servers.find((s) => s.id === serverId);
    if (!server) return;
    const updated = { ...server, enabled: !server.enabled };
    try {
      await invoke("mcp_update_server", { workspaceRoot, config: updated });
      setServers((prev) => prev.map((s) => (s.id === serverId ? updated : s)));
      toastManager.add({
        type: "success",
        title: updated.enabled ? "已启用" : "已禁用",
        description: server.name,
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "操作失败",
        description: error instanceof Error ? error.message : "未知错误",
      });
    }
  };

  /** 1-click 安装预设 */
  const handleInstallPreset = async (preset: McpServerPreset) => {
    if (!workspaceRoot) {
      toastManager.add({ type: "error", title: "请先选择工作区" });
      return;
    }
    setInstallingPresetId(preset.id);

    try {
      // 解析占位符：{path} → workspaceRoot，env_keys 从系统环境变量读取
      const args = preset.args.map((a) => a.replace("{path}", workspaceRoot));
      const env: Record<string, string> = {};
      // env_keys 由后端在启动时从系统环境变量读取，前端只传空对象
      // （后端 resolve_preset 会合并系统 env + 用户 env）

      const config: McpServerConfig = {
        id: `${preset.id}-${Date.now()}`,
        name: preset.name,
        command: preset.command,
        args,
        env,
        enabled: true,
        preset: preset.id,
        status: "disconnected",
      };

      await invoke("mcp_add_server", { workspaceRoot, config });
      setServers((prev) => [...prev, config]);

      const needsEnv = preset.envKeys.length > 0;
      toastManager.add({
        type: "success",
        title: `已安装 ${preset.name}`,
        description: needsEnv
          ? `请在系统环境变量中配置 ${preset.envKeys.join(", ")}，然后点击"测试连接"`
          : '点击"测试连接"启动服务器',
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: `安装 ${preset.name} 失败`,
        description: error instanceof Error ? error.message : "未知错误",
      });
    } finally {
      setInstallingPresetId(null);
    }
  };

  const installedPresetIds = new Set(servers.map((s) => s.preset).filter(Boolean) as string[]);

  return (
    <div className="space-y-6">
      {/* 官方预设 */}
      {presets.length > 0 && (
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-medium flex items-center gap-1.5">
              <PiLightning className="size-3.5" />
              官方预设
            </h3>
            <p className="text-xs text-muted-foreground">
              1-click 安装 Model Context Protocol 官方服务器（需要 Node.js / Python 环境）
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {presets.map((preset) => (
              <PresetCard
                key={preset.id}
                preset={preset}
                installed={installedPresetIds.has(preset.id)}
                installing={installingPresetId === preset.id}
                onInstall={() => handleInstallPreset(preset)}
              />
            ))}
          </div>
        </div>
      )}

      {/* 已配置服务器 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium">已配置服务器</h3>
            <p className="text-xs text-muted-foreground">
              配置 Model Context Protocol 服务器以扩展 AI 能力
            </p>
          </div>
          <div className="flex items-center gap-2">
            {servers.some((s) => s.enabled) && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleTestAll}
                disabled={testingAll}
              >
                <PiPlay className="mr-1 size-3" />
                {testingAll ? "测试中..." : "全部测试"}
              </Button>
            )}
            <Button size="sm" onClick={handleAdd}>
              <PiPlus className="mr-1 size-3" />
              手动添加
            </Button>
          </div>
        </div>

        {servers.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/50 py-8 text-center">
            <PiPlug className="size-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              暂无 MCP 服务器配置，从上方官方预设开始
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-96">
            <div className="space-y-2">
              {servers.map((server) => (
                <McpServerItem
                  key={server.id}
                  server={server}
                  onEdit={() => handleEdit(server)}
                  onDelete={() => handleDelete(server.id)}
                  onTest={() => handleTest(server.id)}
                  onToggleEnabled={() => handleToggleEnabled(server.id)}
                  tools={serverTools?.[server.id] ?? null}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* 添加/编辑对话框 */}
      {showAddDialog && (
        <McpServerDialog
          server={editingServer}
          workspaceRoot={workspaceRoot}
          onClose={() => setShowAddDialog(false)}
          onSave={(server) => {
            if (editingServer) {
              setServers((prev) => prev.map((s) => (s.id === server.id ? server : s)));
            } else {
              setServers((prev) => [...prev, server]);
            }
            setShowAddDialog(false);
          }}
        />
      )}
    </div>
  );
});

/**
 * MCP 服务器添加/编辑对话框（手动配置 command / args / env）
 */
const McpServerDialog = memo(function McpServerDialog({
  server,
  workspaceRoot,
  onClose,
  onSave,
}: {
  server: McpServerConfig | null;
  workspaceRoot?: string;
  onClose: () => void;
  onSave: (server: McpServerConfig) => void;
}) {
  const [name, setName] = useState(server?.name ?? "");
  const [transportType, setTransportType] = useState<McpTransportType>(
    server?.transportType ?? "stdio",
  );
  const [command, setCommand] = useState(server?.command ?? "npx");
  const [argsText, setArgsText] = useState((server?.args ?? []).join(" "));
  const [envText, setEnvText] = useState(
    Object.entries(server?.env ?? {})
      .map(([k, v]) => `${k}=${v}`)
      .join("\n"),
  );
  const [enabled, setEnabled] = useState(server?.enabled ?? true);
  const [saving, setSaving] = useState(false);

  const isSse = transportType === "sse";

  const handleSave = async () => {
    if (!name.trim() || !command.trim()) {
      toastManager.add({ type: "error", title: "请填写名称和启动命令" });
      return;
    }

    setSaving(true);
    try {
      // 解析 args（空格分隔，支持引号）
      const args = parseArgs(argsText);
      // 解析 env（每行 KEY=VALUE）
      const env = parseEnv(envText);

      const config: McpServerConfig = {
        id: server?.id ?? `mcp-${Date.now()}`,
        name: name.trim(),
        command: command.trim(),
        args: isSse ? [] : args,
        env: isSse ? {} : env,
        enabled,
        preset: server?.preset,
        transportType,
        status: "disconnected",
      };

      if (server) {
        await invoke("mcp_update_server", { workspaceRoot, config });
      } else {
        await invoke("mcp_add_server", { workspaceRoot, config });
      }

      onSave(config);
      toastManager.add({
        type: "success",
        title: server ? "已更新 MCP 服务器" : "已添加 MCP 服务器",
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "保存失败",
        description: error instanceof Error ? error.message : "未知错误",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-lg">
        <h3 className="text-lg font-medium">
          {server ? "编辑 MCP 服务器" : "添加 MCP 服务器"}
        </h3>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-sm font-medium">服务器名称 *</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：Filesystem"
              className="mt-1"
            />
          </div>

          {/* 传输类型选择 */}
          <div>
            <label className="text-sm font-medium">传输类型</label>
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={() => setTransportType("stdio")}
                className={cn(
                  "flex-1 rounded-md border px-3 py-2 text-sm transition-colors",
                  !isSse
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted/50",
                )}
              >
                stdio（本地进程）
              </button>
              <button
                type="button"
                onClick={() => setTransportType("sse")}
                className={cn(
                  "flex-1 rounded-md border px-3 py-2 text-sm transition-colors",
                  isSse
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted/50",
                )}
              >
                SSE（远程 HTTP）
              </button>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">
              {isSse ? "SSE 端点 URL *" : "启动命令 *"}
            </label>
            <Input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder={
                isSse
                  ? "例如：http://localhost:3001/sse"
                  : "例如：npx"
              }
              className="mt-1 font-mono text-xs"
            />
          </div>

          {!isSse && (
            <>
              <div>
                <label className="text-sm font-medium">命令参数（空格分隔）</label>
                <Input
                  value={argsText}
                  onChange={(e) => setArgsText(e.target.value)}
                  placeholder='例如：-y @modelcontextprotocol/server-filesystem /tmp'
                  className="mt-1 font-mono text-xs"
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  支持引号包裹含空格的参数，如 `"path with space"`
                </p>
              </div>

              <div>
                <label className="text-sm font-medium">环境变量（每行 KEY=VALUE）</label>
                <textarea
                  value={envText}
                  onChange={(e) => setEnvText(e.target.value)}
                  placeholder={"GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxx\nPOSTGRES_CONNECTION_STRING=postgresql://..."}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs min-h-[80px] resize-y"
                />
              </div>
            </>
          )}

          {isSse && (
            <p className="text-[10px] text-muted-foreground">
              SSE 传输通过 HTTP 连接远程 MCP 服务器，无需本地进程。环境变量将在后续版本支持。
            </p>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="mcp-enabled"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="size-4"
            />
            <label htmlFor="mcp-enabled" className="text-sm">
              启用此服务器
            </label>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "保存中..." : "保存"}
          </Button>
        </div>
      </div>
    </div>
  );
});

/**
 * 解析命令参数字符串为数组（支持引号）
 */
function parseArgs(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  // 简单的 shell-like 分词：支持双引号包裹
  const args: string[] = [];
  let current = "";
  let inQuote = false;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === " " && !inQuote) {
      if (current) {
        args.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }
  if (current) args.push(current);
  return args;
}

/**
 * 解析环境变量文本为对象（每行 KEY=VALUE）
 */
function parseEnv(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (key) env[key] = value;
  }
  return env;
}
