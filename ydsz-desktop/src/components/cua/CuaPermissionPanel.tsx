/**
 * @file CuaPermissionPanel.tsx
 * @description CUA (Computer Use Agent) 权限面板组件。
 *
 * 功能：
 * - 权限状态指示（idle/active/denied）
 * - 屏幕录制权限控制开关
 * - 辅助功能权限（Accessibility）状态
 * - 操作风险提示（红色警告 YOLO 模式 vs 安全模式）
 * - 历史操作记录统计
 *
 * ## 核心导出
 *
 * - `CuaPermissionPanel`：主组件（memo 包裹）
 *
 * ## 使用场景
 *
 * - Composer 附近 CUA 触发入口的展开面板
 * - 用户在此管理 CUA 的各项权限与安全模式
 */

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  PiShieldCheck,
  PiShieldWarning,
  PiShieldSlash,
  PiMonitor,
  PiKeyboard,
  PiWarning,
  PiClockCounterClockwise,
  PiLightning,
  PiGear,
} from "react-icons/pi";
import { ChevronDownIcon, ChevronUpIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";
import type {
  CuaPermissionItem,
  CuaPermissionState,
  CuaMode,
  CuaHistoryStats,
} from "~/contracts";

// ============================================================================
// Tauri Invoke 动态加载 （与 SandboxPanel 模式一致）
// ============================================================================

interface TauriInvokeModule {
  invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
}

let tauriModulePromise: Promise<TauriInvokeModule | null> | null = null;

async function loadTauriInvoke(): Promise<TauriInvokeModule | null> {
  if (tauriModulePromise) return tauriModulePromise;
  tauriModulePromise = (async () => {
    try {
      const mod = await import("@tauri-apps/api/core");
      return mod as TauriInvokeModule;
    } catch {
      return null;
    }
  })();
  return tauriModulePromise;
}

// ============================================================================
// 辅助常量
// ============================================================================

/** 权限状态配置 */
const PERMISSION_STATE_CONFIG: Record<
  CuaPermissionState,
  { icon: typeof PiShieldCheck; color: string; bg: string; label: string }
> = {
  idle: {
    icon: PiShieldCheck,
    color: "text-muted-foreground",
    bg: "bg-muted/50",
    label: "未激活",
  },
  active: {
    icon: PiShieldCheck,
    color: "text-green-500",
    bg: "bg-green-500/15",
    label: "已激活",
  },
  denied: {
    icon: PiShieldSlash,
    color: "text-red-500",
    bg: "bg-red-500/15",
    label: "已拒绝",
  },
};

/** 默认权限项 */
function getDefaultPermissions(): CuaPermissionItem[] {
  return [
    {
      name: "screen_recording",
      description: "屏幕录制",
      granted: false,
      required: true,
      systemHint: "在系统设置中授权妙手屏幕录制权限",
    },
    {
      name: "accessibility",
      description: "辅助功能 (Accessibility)",
      granted: false,
      required: true,
      systemHint: "在系统设置 → 隐私 → 辅助功能中授权妙手",
    },
    {
      name: "input_simulation",
      description: "输入模拟（鼠标/键盘）",
      granted: false,
      required: false,
      systemHint: "需要辅助功能权限已授权",
    },
  ];
}

/** 默认历史统计 */
function getDefaultStats(): CuaHistoryStats {
  return { total: 0, succeeded: 0, failed: 0 };
}

// ============================================================================
// 子组件
// ============================================================================

/** 单个权限项开关 */
const PermissionSwitch = memo(function PermissionSwitch(props: {
  item: CuaPermissionItem;
  onToggle: (name: string, granted: boolean) => void;
}) {
  const { item, onToggle } = props;
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={cn(
            "w-2 h-2 shrink-0 rounded-full",
            item.granted ? "bg-green-500" : "bg-muted-foreground/40",
          )}
        />
        <div className="min-w-0">
          <div className="text-xs font-medium text-foreground truncate">
            {item.description}
            {item.required && (
              <span className="ml-1 text-[10px] text-orange-500">*</span>
            )}
          </div>
          {item.systemHint && (
            <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
              {item.systemHint}
            </div>
          )}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={item.granted}
        onClick={() => onToggle(item.name, !item.granted)}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
          item.granted ? "bg-green-500" : "bg-muted-foreground/30",
        )}
      >
        <span
          className={cn(
            "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
            item.granted ? "translate-x-4" : "translate-x-0",
          )}
        />
      </button>
    </div>
  );
});

/** 模式选择器 */
const ModeSelector = memo(function ModeSelector(props: {
  mode: CuaMode;
  onModeChange: (mode: CuaMode) => void;
}) {
  const { mode, onModeChange } = props;
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
        <PiLightning className="text-amber-500" />
        操作模式
      </div>
      <div className="grid grid-cols-2 gap-2">
        {/* 安全模式 */}
        <button
          onClick={() => onModeChange("safe")}
          className={cn(
            "p-2.5 rounded-md border text-left transition-colors",
            mode === "safe"
              ? "border-green-500/50 bg-green-500/10"
              : "border-border/40 bg-background/40 hover:bg-muted/50",
          )}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <PiShieldCheck
              className={cn(
                "text-sm",
                mode === "safe" ? "text-green-500" : "text-muted-foreground",
              )}
            />
            <span
              className={cn(
                "text-xs font-medium",
                mode === "safe" ? "text-green-500" : "text-foreground",
              )}
            >
              安全模式
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            每次操作前需用户确认
          </p>
        </button>

        {/* YOLO 模式 */}
        <button
          onClick={() => onModeChange("yolo")}
          className={cn(
            "p-2.5 rounded-md border text-left transition-colors",
            mode === "yolo"
              ? "border-red-500/50 bg-red-500/10"
              : "border-border/40 bg-background/40 hover:bg-muted/50",
          )}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <PiWarning
              className={cn(
                "text-sm",
                mode === "yolo" ? "text-red-500" : "text-muted-foreground",
              )}
            />
            <span
              className={cn(
                "text-xs font-medium",
                mode === "yolo" ? "text-red-500" : "text-foreground",
              )}
            >
              YOLO 模式
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            AI 自主执行所有操作
          </p>
        </button>
      </div>

      {/* YOLO 风险警告 */}
      {mode === "yolo" && (
        <div className="flex items-start gap-2 p-2 rounded-md bg-red-500/10 border border-red-500/20">
          <PiWarning className="text-red-500 text-sm shrink-0 mt-0.5" />
          <div className="text-[10px] text-red-400 leading-relaxed">
            <div className="font-medium mb-0.5">⚠ 高风险警告</div>
            <div>
              YOLO 模式下 AI 将自主执行所有点击、输入等操作，可能产生不可预期的后果。
              请仅在您完全理解风险时使用此模式。
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

/** 历史统计 */
const HistoryStats = memo(function HistoryStats(props: {
  stats: CuaHistoryStats;
}) {
  const { stats } = props;
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
        <PiClockCounterClockwise className="text-blue-500" />
        操作历史
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="text-center p-2 rounded-md bg-background/60 border border-border/30">
          <div className="text-sm font-semibold text-foreground">
            {stats.total}
          </div>
          <div className="text-[10px] text-muted-foreground">总执行</div>
        </div>
        <div className="text-center p-2 rounded-md bg-background/60 border border-border/30">
          <div className="text-sm font-semibold text-green-500">
            {stats.succeeded}
          </div>
          <div className="text-[10px] text-muted-foreground">成功</div>
        </div>
        <div className="text-center p-2 rounded-md bg-background/60 border border-border/30">
          <div className="text-sm font-semibold text-red-500">
            {stats.failed}
          </div>
          <div className="text-[10px] text-muted-foreground">失败</div>
        </div>
      </div>
    </div>
  );
});

// ============================================================================
// CuaPermissionPanel 主组件
// ============================================================================

function CuaPermissionPanelInner() {
  const [expanded, setExpanded] = useState(true);
  const [permissionState, setPermissionState] =
    useState<CuaPermissionState>("idle");
  const [permissions, setPermissions] = useState<CuaPermissionItem[]>(
    getDefaultPermissions,
  );
  const [mode, setMode] = useState<CuaMode>("safe");
  const [stats] = useState<CuaHistoryStats>(getDefaultStats);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 根据权限项更新权限状态
  useEffect(() => {
    const requiredItems = permissions.filter((p) => p.required);
    const allRequiredGranted = requiredItems.every((p) => p.granted);

    if (allRequiredGranted) {
      setPermissionState("active");
    } else {
      setPermissionState("idle");
    }
  }, [permissions]);

  // 切换权限
  const handleTogglePermission = useCallback(
    async (name: string, granted: boolean) => {
      // 乐观更新 UI
      setPermissions((prev) =>
        prev.map((p) => (p.name === name ? { ...p, granted } : p)),
      );

      // 尝试调用后端命令
      setLoading(true);
      setError(null);
      const tauri = await loadTauriInvoke();
      if (!tauri) {
        setLoading(false);
        return; // 非 Tauri 环境静默忽略
      }
      try {
        await tauri.invoke("cua_toggle_permission", { name, granted });
      } catch {
        // stub: 后端未实现时回滚
        setPermissions((prev) =>
          prev.map((p) => (p.name === name ? { ...p, granted: !granted } : p)),
        );
        setError("权限切换功能尚未实现（后端 stub）");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // 切换模式
  const handleModeChange = useCallback(
    async (newMode: CuaMode) => {
      setMode(newMode);
      const tauri = await loadTauriInvoke();
      if (!tauri) return;
      try {
        await tauri.invoke("cua_set_mode", { mode: newMode });
      } catch {
        // stub: 静默忽略
      }
    },
    [],
  );

  const statusConfig = PERMISSION_STATE_CONFIG[permissionState];
  const StatusIcon = statusConfig.icon;

  // 检查是否所有必需权限都已授予
  const allRequiredGranted = useMemo(
    () =>_permissions.filter((p) => p.required).every((p) => p.granted),
    [permissions],
  );

  return (
    <div className="rounded-lg border border-border/60 bg-card/80 backdrop-blur shadow-sm">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <StatusIcon className={cn("text-lg", statusConfig.color)} />
          <span className="text-sm font-semibold text-foreground">
            Computer Use
          </span>
          <span
            className={cn(
              "text-xs px-1.5 py-0.5 rounded-md font-medium",
              statusConfig.bg,
              statusConfig.color,
            )}
          >
            {statusConfig.label}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {mode === "yolo" && (
            <PiWarning className="text-xs text-red-500" />
          )}
          {expanded ? (
            <ChevronUpIcon className="text-muted-foreground" />
          ) : (
            <ChevronDownIcon className="text-muted-foreground" />
          )}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* 权限检查区域 */}
          <div className="space-y-1">
            <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <PiGear className="text-muted-foreground" />
              权限管理
            </div>
            <div className="pl-1 border-l border-border/30 ml-1">
              {permissions.map((item) => (
                <PermissionSwitch
                  key={item.name}
                  item={item}
                  onToggle={handleTogglePermission}
                />
              ))}
            </div>
          </div>

          {/* 屏幕录制权限 */}
          <div className="flex items-center gap-2 p-2.5 rounded-md bg-background/50 border border-border/30">
            <PiMonitor className="text-sm text-blue-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-foreground">
                屏幕录制权限
              </div>
              <div className="text-[10px] text-muted-foreground">
                {permissions.find((p) => p.name === "screen_recording")
                  ?.granted
                  ? "已授权 - 可以截取和分析屏幕内容"
                  : "需要在系统设置中手动授权"}
              </div>
            </div>
          </div>

          {/* 辅助功能权限 */}
          <div className="flex items-center gap-2 p-2.5 rounded-md bg-background/50 border border-border/30">
            <PiKeyboard className="text-sm text-purple-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-foreground">
                辅助功能权限
              </div>
              <div className="text-[10px] text-muted-foreground">
                {permissions.find((p) => p.name === "accessibility")
                  ?.granted
                  ? "已授权 - 可以模拟鼠标和键盘操作"
                  : "需要在系统设置 → 隐私 中授权"}
              </div>
            </div>
          </div>

          {/* 分隔线 */}
          <div className="border-t border-border/20" />

          {/* 操作模式 */}
          <ModeSelector mode={mode} onModeChange={handleModeChange} />

          {/* 分隔线 */}
          <div className="border-t border-border/20" />

          {/* 历史统计 */}
          <HistoryStats stats={stats} />

          {/* 未完全授权提示 */}
          {!allRequiredGranted && (
            <div className="px-3 py-2 text-xs text-amber-500 bg-amber-500/10 rounded-md border border-amber-500/20">
              <span className="font-medium">
                部分必需权限尚未授权，CUA 功能可能无法正常使用。
              </span>
            </div>
          )}

          {/* 错误 */}
          {error && (
            <div className="px-3 py-2 text-xs text-red-500 bg-red-500/10 rounded-md">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const CuaPermissionPanel = memo(CuaPermissionPanelInner);
