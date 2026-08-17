/**
 * @file ModeSwitcher — 运行时模式切换组件
 *
 * 提供 Work / Code 两种运行时模式之间的切换能力。
 */

import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import type { ProviderInteractionMode, RuntimeMode } from "~/contracts";

interface ModeSwitcherProps {
  runtimeMode: RuntimeMode;
  interactionMode: ProviderInteractionMode;
  onRuntimeModeChange: (mode: RuntimeMode) => void;
  onInteractionModeChange: (mode: ProviderInteractionMode) => void;
}

/**
 * 生成运行时模式的徽标标签
 *
 * @param runtimeMode - 运行时模式 ("work" | "code")
 * @param interactionMode - 交互模式
 * @returns 格式为 "Work · Agent" 或 "Code · Plan" 的标签字符串
 */
export function getModeBadgeLabel(
  runtimeMode: string,
  interactionMode: string,
): string {
  const modeLabel = runtimeMode === "work" ? "Work" : "Code";
  const interactionLabel =
    interactionMode.charAt(0).toUpperCase() + interactionMode.slice(1);
  return `${modeLabel} · ${interactionLabel}`;
}

const INTERACTION_MODES: ReadonlyArray<{
  value: ProviderInteractionMode;
  label: string;
}> = [
  { value: "agent", label: "Agent" },
  { value: "chat", label: "Chat" },
  { value: "plan", label: "Plan" },
  { value: "review", label: "Review" },
  { value: "task", label: "Task" },
];

export function ModeSwitcher({
  runtimeMode,
  interactionMode,
  onRuntimeModeChange,
  onInteractionModeChange,
}: ModeSwitcherProps) {
  return (
    <div className="flex items-center gap-1">
      <ToggleGroup
        value={[runtimeMode]}
        onValueChange={(v) => v?.[0] && onRuntimeModeChange(v[0] as RuntimeMode)}
        className="rounded-md border bg-muted/30 p-0.5"
      >
        <ToggleGroupItem value="work" size="xs" className="h-6 px-2 text-xs">
          Work
        </ToggleGroupItem>
        <ToggleGroupItem value="code" size="xs" className="h-6 px-2 text-xs">
          Code
        </ToggleGroupItem>
      </ToggleGroup>
      <ToggleGroup
        value={[interactionMode]}
        onValueChange={(v) => v?.[0] && onInteractionModeChange(v[0] as ProviderInteractionMode)}
        className="rounded-md border bg-muted/30 p-0.5"
      >
        {INTERACTION_MODES.map((mode) => (
          <ToggleGroupItem
            key={mode.value}
            value={mode.value}
            size="xs"
            className="h-6 px-2 text-xs"
          >
            {mode.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
