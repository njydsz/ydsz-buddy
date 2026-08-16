import type { Meta, StoryObj } from "@storybook/react";
import { Suspense } from "react";
import ChatMarkdown from "./ChatMarkdown";

/**
 * ChatMarkdown Stories
 *
 * 互联网大厂基线:
 *  - 5 个核心稳定 UI 件必须有 Storybook stories 落地(项目硬约束)
 *  - 像素级视觉回归走 Chromatic CI(.github/workflows/chromatic.yml)
 *  - 结构级回归走 src/components/visual-regression.test.tsx
 *
 * 设计原则:
 *  - 暂停动画避免帧漂移
 *  - dark / light 两个背景都拍快照
 *  - 同时覆盖纯文本、代码块、表格、数学公式、Review 引用等核心场景
 */
const meta: Meta<typeof ChatMarkdown> = {
  title: "Chat/ChatMarkdown",
  component: ChatMarkdown,
  tags: ["autodocs"],
  parameters: {
    chromatic: { pauseAnimationsAtEnd: true },
  },
  decorators: [
    (Story) => (
      <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
        <Story />
      </Suspense>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof ChatMarkdown>;

/**
 * 最简单的纯文本场景,验证基础段落渲染
 */
export const PlainText: Story = {
  args: {
    text: "这是一段普通文本,展示 ChatMarkdown 的基础段落渲染能力。",
    cwd: undefined,
  },
};

/**
 * 富文本场景:加粗、斜体、行内代码、链接、列表、引用、标题
 */
export const RichText: Story = {
  args: {
    cwd: "/Users/demo/repo",
    text: `# 标题一

这是一段正文,包含 **加粗**、*斜体*、\`行内代码\`、[链接](https://example.com)。

## 子标题

- 项目一
- 项目二
  - 嵌套项

> 引用块内容

1. 有序列表第一项
2. 有序列表第二项
`,
  },
};

/**
 * 代码块场景:TypeScript 语法高亮
 */
export const CodeBlock: Story = {
  args: {
    cwd: "/Users/demo/repo",
    text: `\`\`\`typescript
interface User {
  id: string;
  name: string;
}

const greet = (u: User): string => \`Hello, \${u.name}\`;
\`\`\``,
  },
};

/**
 * 表格场景:GFM 表格
 */
export const Table: Story = {
  args: {
    cwd: undefined,
    text: `| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 唯一标识 |
| name | string | 用户名 |
| age | number | 年龄 |
`,
  },
};

/**
 * 数学公式场景:行内 + 块级 KaTeX
 */
export const MathFormula: Story = {
  args: {
    cwd: undefined,
    text: `行内公式:$E = mc^2$。

块级公式:

$$\\int_0^1 x^2 \\, dx = \\frac{1}{3}$$
`,
  },
};

/**
 * Review 模式:启用 path:line 行级引用渲染
 */
export const ReviewMode: Story = {
  args: {
    cwd: "/Users/demo/repo",
    isReviewMode: true,
    text: `建议修改 src/components/Sidebar.tsx:1062 处的 YdszBuddyWordmark 组件,以及 src/hooks/useTheme.ts:42 处的 STORAGE_KEY 常量。`,
  },
};
