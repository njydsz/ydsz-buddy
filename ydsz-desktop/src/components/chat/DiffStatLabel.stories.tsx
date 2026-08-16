import type { Meta, StoryObj } from "@storybook/react";
import { DiffStatLabel, hasNonZeroStat } from "./DiffStatLabel";

/**
 * DiffStatLabel 差异统计标签 Story
 *
 * 互联网大厂基线：
 * - 覆盖 0 变更 / 单边变更 / 双边变更 三种基础态
 * - 覆盖千分位 / k/M 大数字格式
 * - 覆盖带括号形态（嵌入句子）
 */
const meta: Meta<typeof DiffStatLabel> = {
  title: "Chat/DiffStatLabel",
  component: DiffStatLabel,
  tags: ["autodocs"],
  argTypes: {
    additions: { control: { type: "number", min: 0, max: 100000 } },
    deletions: { control: { type: "number", min: 0, max: 100000 } },
    showParentheses: { control: "boolean" },
  },
};
export default meta;

type Story = StoryObj<typeof DiffStatLabel>;

export const BothSides: Story = {
  args: { additions: 12, deletions: 4 },
};

export const AdditionsOnly: Story = {
  args: { additions: 30, deletions: 0 },
};

export const DeletionsOnly: Story = {
  args: { additions: 0, deletions: 9 },
};

export const LargeNumbers: Story = {
  args: { additions: 12345, deletions: 6789 },
};

export const InSentence: Story = {
  args: { additions: 12, deletions: 4, showParentheses: true },
};

export const ZeroStatHiddenHelper: Story = {
  name: "hasNonZeroStat (helper, no render)",
  render: () => {
    return (
      <div className="text-xs text-muted-foreground">
        hasNonZeroStat:{" "}
        {String(hasNonZeroStat({ additions: 0, deletions: 0 }))}
      </div>
    );
  },
};
