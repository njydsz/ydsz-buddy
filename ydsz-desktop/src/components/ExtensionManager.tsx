/**
 * @file Extension 管理器
 *
 * Extension 列表管理界面，支持：
 * - 列出所有已安装 Extension
 * - 按状态过滤（全部 / 已激活 / 已停用 / 错误）
 * - 搜索过滤
 * - 激活/停用/卸载操作
 * - 点击查看详情
 *
 * ## 使用场景
 *
 * - 设置页中的 Extension 管理面板
 * - 独立 Extension 管理路由
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ExtensionDetailPanel } from "./ExtensionDetailPanel";

type ExtensionState = "installed" | "activated" | "deactivated" | "error";

interface ExtensionEntry {
  manifest: {
    name: string;
    version: string;
    displayName: string;
    description: string;
    author: string;
    categories: string[];
  };
  installPath: string;
  state: ExtensionState;
  error?: string;
}

type FilterMode = "all" | "activated" | "deactivated" | "error";

export function ExtensionManager() {
  const [extensions, setExtensions] = useState<ExtensionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [selectedName, setSelectedName] = useState<string | null>(null);

  const loadExtensions = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<{ extensions: ExtensionEntry[] }>(
        "extension.list",
      );
      setExtensions(result.extensions);
    } catch (err) {
      console.error("加载 Extension 列表失败:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadExtensions();
  }, [loadExtensions]);

  // 过滤后的列表
  const filteredExtensions = useMemo(() => {
    let list = extensions;
    if (filter !== "all") {
      list = list.filter((e) => e.state === filter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.manifest.displayName.toLowerCase().includes(q) ||
          e.manifest.name.toLowerCase().includes(q) ||
          e.manifest.description.toLowerCase().includes(q),
      );
    }
    return list;
  }, [extensions, filter, search]);

  const handleStateChange = useCallback(
    (_name: string, _newState: ExtensionState) => {
      // 操作成功后刷新列表
      loadExtensions();
    },
    [loadExtensions],
  );

  const selectedExtension = selectedName
    ? extensions.find((e) => e.manifest.name === selectedName)
    : null;

  return (
    <div className="flex h-full">
      {/* Left: Extension List */}
      <div className="flex w-80 shrink-0 flex-col border-r border-border">
        {/* Search & Filter */}
        <div className="shrink-0 space-y-2 border-b border-border p-3">
          <input
            type="text"
            placeholder="搜索 Extension..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="flex gap-1">
            {(["all", "activated", "deactivated", "error"] as FilterMode[]).map(
              (mode) => (
                <button
                  key={mode}
                  onClick={() => setFilter(mode)}
                  className={`flex-1 rounded px-2 py-1 text-xs ${
                    filter === mode
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {filterLabel(mode)}
                </button>
              ),
            )}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="space-y-2 p-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-md bg-muted"
                />
              ))}
            </div>
          ) : filteredExtensions.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {search ? "未找到匹配的 Extension" : "暂无已安装的 Extension"}
            </div>
          ) : (
            <div className="space-y-1 p-2">
              {filteredExtensions.map((ext) => (
                <button
                  key={ext.manifest.name}
                  onClick={() => setSelectedName(ext.manifest.name)}
                  className={`w-full rounded-md px-3 py-2 text-left transition-colors ${
                    selectedName === ext.manifest.name
                      ? "bg-primary/10 ring-1 ring-primary"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {ext.manifest.displayName}
                    </span>
                    <StateDot state={ext.state} />
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {ext.manifest.description || ext.manifest.name}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground/60">
                    v{ext.manifest.version}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer Stats */}
        <div className="shrink-0 border-t border-border p-2 text-xs text-muted-foreground">
          共 {extensions.length} 个 ·{" "}
          {extensions.filter((e) => e.state === "activated").length} 个已激活
        </div>
      </div>

      {/* Right: Detail Panel */}
      <div className="flex-1">
        {selectedExtension ? (
          <ExtensionDetailPanel
            extensionName={selectedExtension.manifest.name}
            onStateChange={handleStateChange}
            onClose={() => setSelectedName(null)}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            选择一个 Extension 查看详情
          </div>
        )}
      </div>
    </div>
  );
}

/** 状态圆点 */
function StateDot({ state }: { state: ExtensionState }) {
  const colors: Record<ExtensionState, string> = {
    installed: "bg-muted-foreground",
    activated: "bg-green-500",
    deactivated: "bg-yellow-500",
    error: "bg-destructive",
  };

  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${colors[state]}`}
      title={state}
    />
  );
}

/** 过滤模式标签 */
function filterLabel(mode: FilterMode): string {
  const labels: Record<FilterMode, string> = {
    all: "全部",
    activated: "已激活",
    deactivated: "已停用",
    error: "错误",
  };
  return labels[mode];
}
