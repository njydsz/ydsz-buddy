/**
 * @file Preset 选择器
 *
 * 提供 Agent Preset 的选择和管理功能：
 * - 列出所有可用预设（内置 + 自定义）
 * - 快速切换 Preset
 * - 创建/编辑/删除自定义 Preset
 *
 * ## 使用场景
 *
 * - 对话页面顶部的模式切换器
 * - 设置页中的 Preset 管理面板
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

// ==================== 类型 ====================

type PermissionLevel = "read_only" | "standard" | "full" | "sandboxed";

interface CompressionStrategy {
  triggerThresholdPercent: number;
  keepRecentMessages: number;
  maxSummaryLength: number;
  hierarchical: boolean;
  keepToolResults: boolean;
}

interface AgentPreset {
  id: string;
  name: string;
  description: string;
  builtin: boolean;
  systemPromptTemplate: string;
  toolAllowlist: string[];
  toolBlocklist: string[];
  permissionLevel: PermissionLevel;
  compression: CompressionStrategy;
  createdAt: string;
  updatedAt: string;
}

export interface PresetSelectorProps {
  /** 当前选中的 Preset ID */
  currentPresetId?: string;
  /** 切换 Preset 回调 */
  onSelect?: (presetId: string, preset: AgentPreset) => void;
  /** 是否显示管理按钮 */
  showManage?: boolean;
}

export function PresetSelector({
  currentPresetId,
  onSelect,
  showManage = true,
}: PresetSelectorProps) {
  const [presets, setPresets] = useState<AgentPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | undefined>(currentPresetId);

  const loadPresets = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<{ presets: AgentPreset[] }>("preset.list");
      setPresets(result.presets);
      if (!selectedId && result.presets.length > 0) {
        setSelectedId(result.presets[0].id);
      }
    } catch (err) {
      console.error("加载 Preset 列表失败:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    loadPresets();
  }, [loadPresets]);

  const handleSelect = useCallback(
    (preset: AgentPreset) => {
      setSelectedId(preset.id);
      onSelect?.(preset.id, preset);
    },
    [onSelect],
  );

  const builtinPresets = useMemo(
    () => presets.filter((p) => p.builtin),
    [presets],
  );
  const customPresets = useMemo(
    () => presets.filter((p) => !p.builtin),
    [presets],
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <div className="h-2 w-2 animate-pulse rounded-full bg-muted-foreground/40" />
        加载预设...
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* 快速选择器 */}
      <div className="flex flex-wrap gap-1.5">
        {presets.map((preset) => (
          <button
            key={preset.id}
            onClick={() => handleSelect(preset)}
            className={`rounded-full px-3 py-1 text-xs transition-colors ${
              selectedId === preset.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
            title={preset.description}
          >
            {preset.name}
          </button>
        ))}
      </div>

      {/* 选中 Preset 描述 */}
      {selectedId && (
        <SelectedPresetInfo presetId={selectedId} presets={presets} />
      )}
    </div>
  );
}

function SelectedPresetInfo({
  presetId,
  presets,
}: {
  presetId: string;
  presets: AgentPreset[];
}) {
  const preset = presets.find((p) => p.id === presetId);
  if (!preset) return null;

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{preset.name}</span>
        {preset.builtin && (
          <span className="text-xs text-muted-foreground">内置</span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{preset.description}</p>
      <div className="mt-2 flex gap-2 text-xs text-muted-foreground">
        <span>权限: {permissionLabel(preset.permissionLevel)}</span>
        <span>压缩阈值: {preset.compression.triggerThresholdPercent}%</span>
        {preset.toolAllowlist.length > 0 && (
          <span>工具白名单: {preset.toolAllowlist.length} 个</span>
        )}
      </div>
    </div>
  );
}

function permissionLabel(level: PermissionLevel): string {
  const labels: Record<PermissionLevel, string> = {
    read_only: "只读",
    standard: "标准",
    full: "完全",
    sandboxed: "沙箱",
  };
  return labels[level] ?? level;
}
