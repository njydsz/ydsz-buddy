import type { Meta, StoryObj } from "@storybook/react";
import { Badge } from "./badge";

/**
 * Badge 徽章 Story
 *
 * 互联网大厂基线：
 * - 所有 variant 提供视觉基线
 * - 用于通知/状态展示，非交互元素
 */
const meta: Meta<typeof Badge> = {
  title: "Design System/Badge",
  component: Badge,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: [
        "default",
        "secondary",
        "destructive",
        "outline",
        "success",
        "warning",
        "info",
        "error",
      ],
    },
    size: {
      control: "select",
      options: ["sm", "default", "lg"],
    },
  },
};
export default meta;

type Story = StoryObj<typeof Badge>;

export const Default: Story = {
  args: { children: "默认" },
};

export const Success: Story = {
  args: { variant: "success", children: "已连接" },
};

export const Warning: Story = {
  args: { variant: "warning", children: "待审批" },
};

export const Destructive: Story = {
  args: { variant: "destructive", children: "失败" },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge>Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="success">Success</Badge>
      <Badge variant="warning">Warning</Badge>
      <Badge variant="destructive">Destructive</Badge>
      <Badge variant="info">Info</Badge>
      <Badge variant="outline">Outline</Badge>
    </div>
  ),
};
