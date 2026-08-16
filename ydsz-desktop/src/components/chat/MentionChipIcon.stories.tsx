import type { Meta, StoryObj } from "@storybook/react";
import { MentionChipIcon } from "./MentionChipIcon";

/**
 * MentionChipIcon 提及芯片图标 Story
 *
 * 互联网大厂基线：
 * - 文件 / 文件夹 / 插件 / Wiki 四种形态的视觉基线
 * - light / dark 主题各一组基线
 */
const meta: Meta<typeof MentionChipIcon> = {
  title: "Chat/MentionChipIcon",
  component: MentionChipIcon,
  tags: ["autodocs"],
  argTypes: {
    path: { control: "text" },
    theme: { control: "select", options: ["light", "dark"] },
    kind: { control: "select", options: ["path", "plugin", "wiki"] },
  },
  decorators: [
    (Story) => (
      <div className="flex items-center gap-2 rounded border border-border bg-card p-2 text-xs">
        <span className="text-muted-foreground">@</span>
        <Story />
        <span>filename.ts</span>
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof MentionChipIcon>;

export const File: Story = {
  args: { path: "src/index.ts", theme: "light", kind: "path" },
};

export const Folder: Story = {
  args: { path: "src/components/", theme: "light", kind: "path" },
};

export const Plugin: Story = {
  args: { path: "plugin://github", theme: "light", kind: "plugin" },
};

export const Wiki: Story = {
  args: { path: "wiki://overview", theme: "light", kind: "wiki" },
};

export const FileDark: Story = {
  args: { path: "src/index.ts", theme: "dark", kind: "path" },
  decorators: [
    (Story) => (
      <div
        className="flex items-center gap-2 rounded border border-border p-2 text-xs"
        style={{ background: "#0e0e10", color: "#fafafa" }}
      >
        <span className="text-muted-foreground">@</span>
        <Story />
        <span>filename.ts</span>
      </div>
    ),
  ],
};
