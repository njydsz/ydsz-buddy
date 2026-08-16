import type { Meta, StoryObj } from "@storybook/react";
import { useEffect } from "react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { ChatMarkdown } from "./ChatMarkdown";

/**
 * Theme Switching Stories
 *
 * 互联网大厂基线:
 *  - 5 个核心稳定 UI 件必须有 Storybook stories 落地(项目硬约束)
 *  - 验证主题切换(light ↔ dark)在视觉层稳定
 *  - 检测切换瞬间的 layout shift / 颜色断点 / 文字对比度
 *
 * 设计原则:
 *  - 用 effect 在挂载时切换 documentElement class,模拟 useTheme 切换
 *  - Chromatic 在每个 story 上拍两张快照(初始 + 切换后)
 *  - 暂停动画避免过渡期帧漂移
 */
const meta: Meta = {
  title: "Theme/ThemeSwitching",
  tags: ["autodocs"],
  parameters: {
    chromatic: { pauseAnimationsAtEnd: true },
  },
};
export default meta;

type Story = StoryObj;

/**
 * 在挂载时强制 dark 模式,卸载时还原
 */
function ForceDarkMode({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const hadDark = document.documentElement.classList.contains("dark");
    document.documentElement.classList.add("dark");
    return () => {
      if (!hadDark) document.documentElement.classList.remove("dark");
    };
  }, []);
  return <div className="space-y-4 p-4">{children}</div>;
}

/**
 * 在挂载时强制 light 模式,卸载时还原
 */
function ForceLightMode({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const hadDark = document.documentElement.classList.contains("dark");
    document.documentElement.classList.remove("dark");
    return () => {
      if (hadDark) document.documentElement.classList.add("dark");
    };
  }, []);
  return <div className="space-y-4 p-4">{children}</div>;
}

/**
 * Dark 模式下的基础 UI 件组合
 */
export const DarkMode: Story = {
  render: () => (
    <ForceDarkMode>
      <h2 className="text-lg font-semibold text-foreground">Dark Mode Preview</h2>
      <div className="flex flex-wrap gap-2">
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="outline">Outline</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge>Default</Badge>
        <Badge variant="secondary">Secondary</Badge>
        <Badge variant="destructive">Error</Badge>
        <Badge variant="outline">Outline</Badge>
      </div>
      <div className="rounded-md border border-border bg-card p-4 text-card-foreground">
        Card content with foreground text.
      </div>
    </ForceDarkMode>
  ),
};

/**
 * Light 模式下的基础 UI 件组合
 */
export const LightMode: Story = {
  render: () => (
    <ForceLightMode>
      <h2 className="text-lg font-semibold text-foreground">Light Mode Preview</h2>
      <div className="flex flex-wrap gap-2">
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="outline">Outline</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge>Default</Badge>
        <Badge variant="secondary">Secondary</Badge>
        <Badge variant="destructive">Error</Badge>
        <Badge variant="outline">Outline</Badge>
      </div>
      <div className="rounded-md border border-border bg-card p-4 text-card-foreground">
        Card content with foreground text.
      </div>
    </ForceLightMode>
  ),
};

/**
 * ChatMarkdown 在 dark 模式下的渲染
 *
 * 验证代码块高亮在 dark 主题下的颜色
 */
export const ChatMarkdownDark: Story = {
  render: () => (
    <ForceDarkMode>
      <ChatMarkdown
        cwd="/Users/demo/repo"
        text={`# Dark Mode 渲染

\`\`\`typescript
const x: number = 42;
function add(a: number, b: number) {
  return a + b;
}
\`\`\`

> 引用块在 dark 主题下的样式`}
      />
    </ForceDarkMode>
  ),
};

/**
 * ChatMarkdown 在 light 模式下的渲染
 */
export const ChatMarkdownLight: Story = {
  render: () => (
    <ForceLightMode>
      <ChatMarkdown
        cwd="/Users/demo/repo"
        text={`# Light Mode 渲染

\`\`\`typescript
const x: number = 42;
function add(a: number, b: number) {
  return a + b;
}
\`\`\`

> 引用块在 light 主题下的样式`}
      />
    </ForceLightMode>
  ),
};
