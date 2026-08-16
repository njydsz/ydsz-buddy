import type { Meta, StoryObj } from "@storybook/react";
import { ThreadRunningSpinner } from "./ThreadRunningSpinner";

/**
 * ThreadRunningSpinner 线程运行指示器 Story
 *
 * 互联网大厂基线：
 * - 两种展示形态（overlay / inline）建立视觉基线
 * - 动画在 Chromatic 中可通过 `chromatic.pauseAnimations()` 控制
 * - aria-hidden 父级承担语义
 */
const meta: Meta<typeof ThreadRunningSpinner> = {
  title: "Sidebar/ThreadRunningSpinner",
  component: ThreadRunningSpinner,
  tags: ["autodocs"],
  argTypes: {
    presentation: {
      control: "select",
      options: ["overlay", "inline"],
    },
  },
  parameters: {
    // 动画在视觉回归中需暂停
    chromatic: { pauseAnimationsAtEnd: true },
  },
};
export default meta;

type Story = StoryObj<typeof ThreadRunningSpinner>;

export const Inline: Story = {
  args: { presentation: "inline" },
  decorators: [
    (Story) => (
      <div className="flex items-center gap-2 p-2">
        <Story />
        <span>运行中…</span>
      </div>
    ),
  ],
};

export const Overlay: Story = {
  args: { presentation: "overlay" },
  decorators: [
    (Story) => (
      <div className="relative h-10 w-32 rounded border border-border p-2">
        <span className="text-sm">侧边栏线程行</span>
        <Story />
      </div>
    ),
  ],
};
