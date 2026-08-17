/**
 * @file 落地页模式切换器组件
 *
 * 顶部 chrome 栏中的分段控件模式切换器，参考 WorkBuddy 风格：
 *
 * - **紧凑药丸外观**：圆角容器 + 滑动高亮指示当前模式
 * - **双标签**：办公（Work）/ 编码（Code）
 * - **受控模式**：由父组件传入当前模式，切换时回调导航
 *
 * ## 核心导出
 *
 * - `LandingModeSwitcher`：主组件
 *
 * ## 使用场景
 *
 * - 默认聊天落地页（_chat.index）顶部标题位
 * - 工作区空态页（_chat.workspace.index）顶部标题位
 */
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { cn } from "~/lib/utils";
import type { LandingPageMode } from "./UnifiedLandingPage";

interface LandingModeSwitcherProps {
  /** 当前激活的模式 */
  mode: LandingPageMode;
  /** 切换模式时的回调（可选，覆盖默认导航行为） */
  onModeChange?: (mode: LandingPageMode) => void;
  className?: string;
}

/**
 * 紧凑分段控件落地页模式切换器。
 *
 * 默认行为：点击「办公」导航到 /_chat/，点击「编码」导航到 /_chat/workspace/。
 * 传入 `onModeChange` 可覆盖默认导航逻辑。
 */
export function LandingModeSwitcher({ mode, onModeChange, className }: LandingModeSwitcherProps) {
  const navigate = useNavigate();

  const handleValueChange = useCallback(
    (value: string) => {
      const nextMode = value as LandingPageMode;
      if (nextMode === mode) {
        return;
      }
      if (onModeChange) {
        onModeChange(nextMode);
        return;
      }
      if (nextMode === "code") {
        void navigate({ to: "/workspace", replace: true });
      } else {
        void navigate({ to: "/", replace: true });
      }
    },
    [mode, navigate, onModeChange],
  );

  return (
    <Tabs
      value={mode}
      onValueChange={handleValueChange}
      className={cn("w-auto", className)}
    >
      <TabsList className="h-7 gap-0.5 rounded-full bg-muted/60 p-0.5">
        <TabsTrigger
          value="work"
          className="h-6 rounded-full px-2.5 text-[12px] font-medium data-[selected]:bg-background data-[selected]:shadow-sm"
        >
          办公
        </TabsTrigger>
        <TabsTrigger
          value="code"
          className="h-6 rounded-full px-2.5 text-[12px] font-medium data-[selected]:bg-background data-[selected]:shadow-sm"
        >
          编码
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
