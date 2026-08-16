import type { Meta, StoryObj } from "@storybook/react";
import { UrlPreviewCard } from "./UrlPreviewCard";

/**
 * UrlPreviewCard Stories
 *
 * 互联网大厂基线:
 *  - 5 个核心稳定 UI 件必须有 Storybook stories 落地(项目硬约束)
 *  - 4 种状态:loading / error / embed / link 全覆盖
 *  - 当前 fetchUrlMetadata 是 stub(前端模拟),后续接后端 API 后 stories 自动适配
 *
 * 设计原则:
 *  - 暂停动画避免帧漂移
 *  - 模拟网络延迟走 chromatic delay
 *  - 真实 GitHub / 文档链接场景
 */
const meta: Meta<typeof UrlPreviewCard> = {
  title: "Chat/UrlPreviewCard",
  component: UrlPreviewCard,
  tags: ["autodocs"],
  parameters: {
    chromatic: { pauseAnimationsAtEnd: true },
  },
};
export default meta;

type Story = StoryObj<typeof UrlPreviewCard>;

/**
 * 嵌入模式 — GitHub 链接(默认模式)
 *
 * 500ms 延迟后会显示 EmbedCard;Chromatic 默认会等待网络请求完成
 */
export const EmbedMode: Story = {
  args: {
    url: "https://github.com/ydsz-org/2. 环境变量 YDSZ_BOOTSTRAP_TOKEN",
    mode: "embed",
  },
};

/**
 * 链接模式 — 文档链接
 */
export const LinkMode: Story = {
  args: {
    url: "https://react.dev/learn",
    mode: "link",
  },
};

/**
 * 无效 URL — 触发 ErrorCard 状态
 */
export const InvalidUrl: Story = {
  args: {
    url: "https://this-domain-does-not-exist-12345.com/page",
    mode: "embed",
  },
};

/**
 * 切换到 GitHub Issue 链接,验证不同站点元数据
 */
export const GitHubIssue: Story = {
  args: {
    url: "https://github.com/ydsz-org/ydsz-buddy/issues/42",
    mode: "embed",
  },
};

/**
 * 文档链接 — MDN
 */
export const MdnDocs: Story = {
  args: {
    url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
    mode: "link",
  },
};
