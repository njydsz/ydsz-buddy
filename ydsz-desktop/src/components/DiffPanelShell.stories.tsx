import type { Meta, StoryObj } from "@storybook/react";
import {
  DiffPanelShell,
  DiffPanelHeaderSkeleton,
  DiffPanelLoadingState,
  type DiffPanelMode,
} from "./DiffPanelShell";

/**
 * DiffPanel Stories
 *
 * 互联网大厂基线:
 *  - 5 个核心稳定 UI 件必须有 Storybook stories 落地(项目硬约束)
 *  - DiffPanel 主体依赖 router + react-query + 9+ zustand store,Storybook 下渲染不现实
 *  - 因此本 stories 覆盖外壳(DiffPanelShell)+ 加载态(DiffPanelLoadingState)+ 头部骨架
 *    (DiffPanelHeaderSkeleton)三个稳定子组件,确保容器视觉稳定
 *  - 真正的 diff 渲染回归走 Playwright E2E(e2e/tests/specs/smoke.spec.ts)
 *
 * 设计原则:
 *  - 三种模式:inline / sheet / sidebar 全覆盖
 *  - 暂停动画避免骨架屏闪烁
 *  - 桌面端 drag region 在 isDesktop=true 时启用(env 默认 false,故 stories 走 web 路径)
 */
const meta: Meta<typeof DiffPanelShell> = {
  title: "Diff/DiffPanelShell",
  component: DiffPanelShell,
  tags: ["autodocs"],
  argTypes: {
    mode: {
      control: "select",
      options: ["inline", "sheet", "sidebar"] as DiffPanelMode[],
    },
  },
  parameters: {
    chromatic: { pauseAnimationsAtEnd: true },
  },
};
export default meta;

type Story = StoryObj<typeof DiffPanelShell>;

/**
 * inline 模式 + 加载状态
 *
 * 适配 ChatView 右侧侧栏,宽 42vw / min 360px / max 560px
 */
export const InlineLoading: Story = {
  args: {
    mode: "inline",
    header: <DiffPanelHeaderSkeleton />,
    children: <DiffPanelLoadingState label="Loading checkpoint diff..." />,
  },
};

/**
 * sidebar 模式 + 加载状态
 *
 * 全宽,用于 PlanSidebar / 独立路由
 */
export const SidebarLoading: Story = {
  args: {
    mode: "sidebar",
    header: <DiffPanelHeaderSkeleton />,
    children: <DiffPanelLoadingState label="Loading working tree diff..." />,
  },
};

/**
 * sheet 模式 + 加载状态
 *
 * 用于弹出式 Diff 预览(不启用桌面 drag region)
 */
export const SheetLoading: Story = {
  args: {
    mode: "sheet",
    header: <DiffPanelHeaderSkeleton />,
    children: <DiffPanelLoadingState label="Loading PR diff..." />,
  },
};

/**
 * 自定义 header + 内容场景
 *
 * 验证外壳对自定义内容的容纳能力
 */
export const CustomContent: Story = {
  args: {
    mode: "sidebar",
    header: (
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Turn 3 · 2 files</span>
        <button
          type="button"
          className="ml-auto rounded-md border border-border px-2 py-1 text-xs"
        >
          Close
        </button>
      </div>
    ),
    children: (
      <div className="flex flex-1 items-center justify-center p-4 text-sm text-muted-foreground">
        No changes in this turn
      </div>
    ),
  },
};

/**
 * 仅头部骨架 — 单独展示
 */
export const HeaderSkeletonOnly: Story = {
  render: () => (
    <div className="w-full border-b border-border px-4 py-3">
      <DiffPanelHeaderSkeleton />
    </div>
  ),
};
