/**
 * @file ExecutionPermissionSwitcher — 4 态执行权限模式切换组件
 *
 * 与 ModeSwitcher 并列，提供 4 种执行权限级别的快速切换：
 *
 * - plan  只读建议模式 — Agent 只能读/分析/建议
 * - build 建议+构建模式 — 可执行 tsc/cargo/mvn 等构建命令
 * - edit  编辑模式 — 可读写文件、执行箱命令（危险操作需审批）
 * - yolo  完全自主模式 — 自动批准所有操作
 *
 * 危险选项 (yolo) 以红色/橙色视觉区分，提示用户谨慎使用。
 */

import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import type { ExecutionPermissionLevel } from "~/contracts";
import { useExecutionPermissionStore } from "~/executionPermissionStore";
import { GoEye, GoTools, GoPencil, GoFlame } from "react-icons/go";
import { cn } from "~/lib/utils";

/** 4 态执行权限配置 */
const PERMISSION_LEVELS: ReadonlyArray<{
  value: ExecutionPermissionLevel;
  label: string;
  shortLabel: string;
  description: string;
  /** 图标组件（size 由 className 控制） */
  Icon: React.ComponentType<{ className?: string }>;
  /** 是否标记为危险选项 */
  danger?: boolean;
}> = [
  {
    value: "plan",
    label: "只读建议",
    shortLabel: "Plan",
    description: "Agent 只读+建议，不能写入文件或执行命令",
    Icon: GoEye,
  },
  {
    value: "build",
    label: "建议+构建",
    shortLabel: "Build",
    description: "可执行构建命令（tsc/cargo/mvn），但不能修改源文件",
    Icon: GoTools,
  },
  {
    value: "edit",
    label: "编辑模式",
    shortLabel: "Edit",
    description: "可读写文件、执行箱命令，危险操作需审批",
    Icon: GoPencil,
  },
  {
    value: "yolo",
    label: "完全自主",
    shortLabel: "YOLO",
    description: "完全自主模式，自动批准所有操作（谨慎使用）",
    Icon: GoFlame,
    danger: true,
  },
];

interface ExecutionPermissionSwitcherProps {
  /** 当前选中的权限级别 */
  level: ExecutionPermissionLevel;
  /** 切换回调 */
  onLevelChange: (level: ExecutionPermissionLevel) => void;
  /** 是否显示标签文字（紧凑模式隐藏） */
  showLabels?: boolean;
}

export function ExecutionPermissionSwitcher({
  level,
  onLevelChange,
  showLabels = true,
}: ExecutionPermissionSwitcherProps) {
  return (
    <ToggleGroup
      value={[level]}
      onValueChange={(v) => v?.[0] && onLevelChange(v[0] as ExecutionPermissionLevel)}
      className="rounded-md border bg-muted/30 p-0.5"
    >
      {PERMISSION_LEVELS.map(({ value, shortLabel, description, Icon, danger }) => (
        <Tooltip key={value}>
          <TooltipTrigger
            render={
              <ToggleGroupItem
                value={value}
                aria-label={shortLabel}
                className={cn(
                  "h-6 px-2 text-xs gap-1",
                  danger && "data-[state=on]:bg-orange-500/15 data-[state=on]:text-orange-500 data-[state=on]:border-orange-500/40",
                  danger && value === level && "ring-1 ring-orange-500/30",
                )}
              >
                <Icon className="size-3 shrink-0" />
                {showLabels ? <span>{shortLabel}</span> : null}
              </ToggleGroupItem>
            }
          />
          <TooltipPopup side="bottom" className="max-w-48 text-xs">
            {description}
          </TooltipPopup>
        </Tooltip>
      ))}
    </ToggleGroup>
  );
}

/**
 * 自管理的 ExecutionPermissionSwitcher（联动 zustand store）
 *
 * 适合需要自动持久化到 store 的场景，无需外部手动传递 state。
 */
export function ConnectedExecutionPermissionSwitcher() {
  const level = useExecutionPermissionStore((s) => s.level);
  const setLevel = useExecutionPermissionStore((s) => s.setLevel);

  return <ExecutionPermissionSwitcher level={level} onLevelChange={setLevel} />;
}
