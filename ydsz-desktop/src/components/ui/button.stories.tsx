import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./button";

/**
 * Button 组件 Story（设计系统核心原子）
 *
 * 互联网大厂基线：
 * - 所有 variant + size 组合都建立视觉基线
 * - 默认开启 a11y 校验（color-contrast / label）
 * - 提供 iconOnly / loading / disabled 等状态
 */
const meta: Meta<typeof Button> = {
  title: "Design System/Button",
  component: Button,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: [
        "default",
        "primary",
        "secondary",
        "ghost",
        "destructive",
        "outline",
        "link",
      ],
    },
    size: {
      control: "select",
      options: ["default", "sm", "md", "lg", "icon"],
    },
    disabled: { control: "boolean" },
    loading: { control: "boolean" },
  },
};
export default meta;

type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: {
    variant: "primary",
    children: "保存",
  },
};

export const Secondary: Story = {
  args: {
    variant: "secondary",
    children: "取消",
  },
};

export const Destructive: Story = {
  args: {
    variant: "destructive",
    children: "删除项目",
  },
};

export const Disabled: Story = {
  args: {
    variant: "primary",
    disabled: true,
    children: "已禁用",
  },
};

export const IconOnly: Story = {
  args: {
    variant: "ghost",
    size: "icon",
    children: "★",
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="link">Link</Button>
    </div>
  ),
};
