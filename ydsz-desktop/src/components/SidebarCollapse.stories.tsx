import type { Meta, StoryObj } from "@storybook/react";
import { YdszBuddyWordmark } from "./Sidebar";
import { ThreadRunningSpinner } from "./ThreadRunningSpinner";

/**
 * Sidebar Collapse Stories
 *
 * 互联网大厂基线:
 *  - 5 个核心稳定 UI 件必须有 Storybook stories 落地(项目硬约束)
 *  - Sidebar 主体无 props 且依赖 9+ zustand store + router + react-query,
 *    在 Storybook 下渲染会触发一连串副作用,因此本 stories 覆盖:
 *    1. YdszBuddyWordmark 品牌标识(展开/折叠两态)
 *    2. ThreadRunningSpinner 在侧栏行内的展示(已存在 stories)
 *    3. 模拟折叠态的迷你 sidebar(只显示图标列)
 *  - 真正的 sidebar 折叠交互回归走 Playwright E2E(e2e/tests/specs/smoke.spec.ts)
 *
 * 设计原则:
 *  - 暂停动画避免 spinner 帧漂移
 *  - 验证折叠态尺寸(64px)与展开态(280px)的视觉稳定
 *  - 验证品牌标识在两种尺寸下的居中
 */
const meta: Meta = {
  title: "Sidebar/CollapseStates",
  tags: ["autodocs"],
  parameters: {
    chromatic: { pauseAnimationsAtEnd: true },
  },
};
export default meta;

type Story = StoryObj;

/**
 * 展开态(280px)的 sidebar 顶部品牌区
 *
 * 模拟 sidebar 完全展开,显示 Wordmark + 应用名 + 折叠按钮
 */
export const Expanded: Story = {
  render: () => (
    <div className="flex h-14 w-[280px] items-center gap-2 border-b border-border bg-background px-4">
      <YdszBuddyWordmark />
      <span className="text-sm font-semibold text-foreground">ydsz-buddy</span>
      <button
        type="button"
        aria-label="Collapse sidebar"
        className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-muted"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
    </div>
  ),
};

/**
 * 折叠态(64px)的 sidebar 顶部品牌区
 *
 * 模拟 sidebar 折叠后只显示 Wordmark,点击展开
 */
export const Collapsed: Story = {
  render: () => (
    <div className="flex h-14 w-16 items-center justify-center border-b border-border bg-background">
      <button
        type="button"
        aria-label="Expand sidebar"
        className="rounded-md p-1 hover:bg-muted"
      >
        <YdszBuddyWordmark />
      </button>
    </div>
  ),
};

/**
 * 折叠态下的线程运行指示
 *
 * 在折叠态 sidebar 中,ThreadRunningSpinner 显示为 inline overlay
 */
export const CollapsedWithRunningThread: Story = {
  render: () => (
    <div className="flex w-16 flex-col items-center gap-2 border-r border-border bg-background py-4">
      <YdszBuddyWordmark />
      <div className="relative flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-muted-foreground"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <ThreadRunningSpinner presentation="overlay" />
      </div>
      <div className="relative flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-muted-foreground"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </div>
    </div>
  ),
};

/**
 * 展开态 + 单线程行(运行中)
 *
 * 验证 ThreadRunningSpinner 在 sidebar 行内的视觉位置
 */
export const ExpandedWithRunningThread: Story = {
  render: () => (
    <div className="flex w-[280px] flex-col gap-1 border-r border-border bg-background p-2">
      <div className="mb-2 flex h-10 items-center gap-2 px-2">
        <YdszBuddyWordmark />
        <span className="text-sm font-semibold">ydsz-buddy</span>
      </div>
      <div className="relative flex h-9 items-center gap-2 rounded-md bg-muted/50 px-2">
        <ThreadRunningSpinner presentation="inline" />
        <span className="text-sm text-foreground">Refactor Sidebar</span>
      </div>
      <div className="flex h-9 items-center gap-2 rounded-md px-2 hover:bg-muted/50">
        <span className="size-2 rounded-full bg-muted-foreground/40" />
        <span className="text-sm text-muted-foreground">Add OAuth flow</span>
      </div>
    </div>
  ),
};
