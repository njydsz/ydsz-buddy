/**
 * @file Extension 详情面板
 *
 * 展示单个 Extension 的完整信息，包括：
 * - 基本信息（名称、版本、作者、描述）
 * - 状态管理（激活/停用/卸载）
 * - 贡献点展示（Commands / Menus / Settings / Providers / Languages）
 * - 依赖关系
 *
 * ## 使用场景
 *
 * - Extension 管理页面中点击某个 Extension 后的详情视图
 * - 设置页中的 Extension 管理面板
 */

import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/** Extension 状态类型（与后端 ExtensionState 对齐） */
type ExtensionState = "installed" | "activated" | "deactivated" | "error";

/** Extension 条目结构 */
interface ExtensionEntry {
  manifest: {
    name: string;
    version: string;
    displayName: string;
    description: string;
    author: string;
    categories: string[];
    main?: string;
    contributes: ExtensionContribution;
    extensionDependencies: string[];
    activationEvents: ActivationEvent[];
  };
  installPath: string;
  state: ExtensionState;
  error?: string;
}

/** Extension 贡献点 */
interface ExtensionContribution {
  commands?: CommandContribution[];
  menus?: MenuContribution[];
  settings?: SettingContribution[];
  providers?: ProviderContribution[];
  languages?: LanguageContribution[];
}

interface CommandContribution {
  id: string;
  title: string;
  keybinding?: string;
  icon?: string;
  category?: string;
}

interface MenuContribution {
  menuId: string;
  command: string;
  group?: string;
  order: number;
}

interface SettingContribution {
  key: string;
  default: unknown;
  settingType: string;
  description: string;
}

interface ProviderContribution {
  displayName: string;
  protocol: string;
  endpoint?: string;
}

interface LanguageContribution {
  id: string;
  extensions: string[];
  aliases?: string[];
}

type ActivationEvent =
  | { kind: "onStartup" }
  | { kind: "onCommand"; commandId: string }
  | { kind: "onLanguage"; language: string };

export interface ExtensionDetailPanelProps {
  /** Extension 名称 */
  extensionName: string;
  /** 状态变更回调 */
  onStateChange?: (name: string, newState: ExtensionState) => void;
  /** 关闭面板回调 */
  onClose?: () => void;
}

export function ExtensionDetailPanel({
  extensionName,
  onStateChange,
  onClose,
}: ExtensionDetailPanelProps) {
  const [entry, setEntry] = useState<ExtensionEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState(false);

  // 加载 Extension 详情
  const loadDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<ExtensionEntry>("extension.get", {
        name: extensionName,
      });
      setEntry(result);
    } catch (err) {
      setError(typeof err === "string" ? err : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  // 激活 Extension
  const handleActivate = async () => {
    setActionInProgress(true);
    try {
      await invoke("extension.activate", { name: extensionName });
      setEntry((prev) => prev ? { ...prev, state: "activated" } : prev);
      onStateChange?.(extensionName, "activated");
    } catch (err) {
      console.error("激活失败:", err);
    } finally {
      setActionInProgress(false);
    }
  };

  // 停用 Extension
  const handleDeactivate = async () => {
    setActionInProgress(true);
    try {
      await invoke("extension.deactivate", { name: extensionName });
      setEntry((prev) => prev ? { ...prev, state: "deactivated" } : prev);
      onStateChange?.(extensionName, "deactivated");
    } catch (err) {
      console.error("停用失败:", err);
    } finally {
      setActionInProgress(false);
    }
  };

  // 卸载 Extension
  const handleUninstall = async () => {
    setActionInProgress(true);
    try {
      await invoke("extension.uninstall", { name: extensionName });
      onStateChange?.(extensionName, "installed");
    } catch (err) {
      console.error("卸载失败:", err);
    } finally {
      setActionInProgress(false);
    }
  };

  // 初始加载
  useState(() => {
    loadDetail();
  });

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-sm text-muted-foreground">加载中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
        <div className="text-sm text-destructive">{error}</div>
        <button
          onClick={loadDetail}
          className="text-sm text-primary hover:underline"
        >
          重试
        </button>
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-sm text-muted-foreground">Extension 未找到</div>
      </div>
    );
  }

  const { manifest, state } = entry;
  const contributes = manifest.contributes;
  const hasContributes =
    (contributes.commands?.length ?? 0) > 0 ||
    (contributes.menus?.length ?? 0) > 0 ||
    (contributes.settings?.length ?? 0) > 0 ||
    (contributes.providers?.length ?? 0) > 0 ||
    (contributes.languages?.length ?? 0) > 0;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="shrink-0 border-b border-border p-6">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-foreground">
              {manifest.displayName}
            </h2>
            <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <span>v{manifest.version}</span>
              {manifest.author && (
                <>
                  <span>·</span>
                  <span>{manifest.author}</span>
                </>
              )}
              <span>·</span>
              <StateBadge state={state} />
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          )}
        </div>

        {manifest.description && (
          <p className="mt-3 text-sm text-muted-foreground">
            {manifest.description}
          </p>
        )}

        {/* Actions */}
        <div className="mt-4 flex gap-2">
          {state === "activated" ? (
            <button
              onClick={handleDeactivate}
              disabled={actionInProgress}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
            >
              停用
            </button>
          ) : (
            <button
              onClick={handleActivate}
              disabled={actionInProgress}
              className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
            >
              激活
            </button>
          )}
          <button
            onClick={handleUninstall}
            disabled={actionInProgress}
            className="rounded-md border border-destructive/30 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
          >
            卸载
          </button>
        </div>

        {entry.error && (
          <div className="mt-3 rounded-md bg-destructive/10 p-2 text-sm text-destructive">
            {entry.error}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 p-6 space-y-6">
        {/* Categories */}
        {manifest.categories.length > 0 && (
          <Section title="分类">
            <div className="flex flex-wrap gap-1.5">
              {manifest.categories.map((cat) => (
                <span
                  key={cat}
                  className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
                >
                  {cat}
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* Commands */}
        {contributes.commands && contributes.commands.length > 0 && (
          <Section title={`命令 (${contributes.commands.length})`}>
            <div className="space-y-1.5">
              {contributes.commands.map((cmd) => (
                <div
                  key={cmd.id}
                  className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2"
                >
                  <div>
                    <div className="text-sm font-medium">{cmd.title}</div>
                    <div className="text-xs text-muted-foreground">{cmd.id}</div>
                  </div>
                  {cmd.keybinding && (
                    <kbd className="rounded border border-border bg-background px-1.5 py-0.5 text-xs">
                      {cmd.keybinding}
                    </kbd>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Settings */}
        {contributes.settings && contributes.settings.length > 0 && (
          <Section title={`设置项 (${contributes.settings.length})`}>
            <div className="space-y-1.5">
              {contributes.settings.map((setting) => (
                <div
                  key={setting.key}
                  className="rounded-md bg-muted/50 px-3 py-2"
                >
                  <div className="text-sm font-medium">{setting.key}</div>
                  {setting.description && (
                    <div className="text-xs text-muted-foreground">
                      {setting.description}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Providers */}
        {contributes.providers && contributes.providers.length > 0 && (
          <Section title={` Provider 贡献 (${contributes.providers.length})`}>
            <div className="space-y-1.5">
              {contributes.providers.map((provider) => (
                <div
                  key={provider.displayName}
                  className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2"
                >
                  <div className="text-sm font-medium">
                    {provider.displayName}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {provider.protocol}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Dependencies */}
        {manifest.extensionDependencies.length > 0 && (
          <Section title={`依赖 (${manifest.extensionDependencies.length})`}>
            <div className="flex flex-wrap gap-1.5">
              {manifest.extensionDependencies.map((dep) => (
                <span
                  key={dep}
                  className="rounded-md bg-muted px-2 py-0.5 text-xs"
                >
                  {dep}
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* Activation Events */}
        {manifest.activationEvents.length > 0 && (
          <Section title="激活事件">
            <div className="flex flex-wrap gap-1.5">
              {manifest.activationEvents.map((event, i) => (
                <span
                  key={i}
                  className="rounded-md bg-muted px-2 py-0.5 text-xs"
                >
                  {formatActivationEvent(event)}
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* Empty State */}
        {!hasContributes && (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            此 Extension 未声明任何贡献点
          </div>
        )}
      </div>
    </div>
  );
}

/** 章节组件 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-foreground">{title}</h3>
      {children}
    </div>
  );
}

/** 状态徽标 */
function StateBadge({ state }: { state: ExtensionState }) {
  const styles: Record<ExtensionState, string> = {
    installed: "bg-muted text-muted-foreground",
    activated: "bg-green-500/10 text-green-600",
    deactivated: "bg-yellow-500/10 text-yellow-600",
    error: "bg-destructive/10 text-destructive",
  };

  const labels: Record<ExtensionState, string> = {
    installed: "已安装",
    activated: "已激活",
    deactivated: "已停用",
    error: "错误",
  };

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${styles[state]}`}>
      {labels[state]}
    </span>
  );
}

/** 格式化激活事件 */
function formatActivationEvent(event: ActivationEvent): string {
  switch (event.kind) {
    case "onStartup":
      return "启动时";
    case "onCommand":
      return `命令: ${event.commandId}`;
    case "onLanguage":
      return `语言: ${event.language}`;
    default:
      return JSON.stringify(event);
  }
}
