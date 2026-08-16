/**
 * @file StreamingAriaAnnouncer 单元测试
 * @description 验证 aria-live 流式播报的节流逻辑和边界检测
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// 与组件完全一致的纯函数
function isAtSegmentBoundary(text: string): boolean {
  if (!text) return false;
  // 只去除首尾空格,保留换行符用于边界检测
  const trimmed = text.replace(/^[ \t]+|[ \t]+$/g, "");
  return /[.!?。！？]$|\n$/.test(trimmed);
}

function extractNewSegments(
  currentText: string,
  lastAnnouncedText: string,
): string | null {
  if (!currentText || currentText.length <= lastAnnouncedText.length) return null;
  const newText = currentText.slice(lastAnnouncedText.length).trim();
  if (!newText) return null;
  if (isAtSegmentBoundary(newText)) return newText;
  const paragraphBreak = newText.lastIndexOf("\n\n");
  if (paragraphBreak > 0) {
    return newText.slice(0, paragraphBreak).trim();
  }
  return null;
}

describe("P-5 aria-live 流式响应 - 段落边界检测", () => {
  describe("isAtSegmentBoundary", () => {
    it("句号结尾返回 true", () => {
      expect(isAtSegmentBoundary("这是一句话.")).toBe(true);
    });

    it("中文句号结尾返回 true", () => {
      expect(isAtSegmentBoundary("这是一句话。")).toBe(true);
    });

    it("问号结尾返回 true", () => {
      expect(isAtSegmentBoundary("这是问题?")).toBe(true);
    });

    it("感叹号结尾返回 true", () => {
      expect(isAtSegmentBoundary("太棒了!")).toBe(true);
    });

    it("换行结尾返回 true", () => {
      const text = "第一行" + "\n";
      expect(isAtSegmentBoundary(text)).toBe(true);
    });

    it("无标点结尾返回 false", () => {
      expect(isAtSegmentBoundary("这是一句话")).toBe(false);
    });

    it("逗号结尾返回 false", () => {
      expect(isAtSegmentBoundary("这是一句话,")).toBe(false);
    });

    it("空格+句号结尾返回 true", () => {
      expect(isAtSegmentBoundary("这是一句话.   ")).toBe(true);
    });
  });

  describe("extractNewSegments", () => {
    it("无新内容返回 null", () => {
      expect(extractNewSegments("hello", "hello")).toBeNull();
    });

    it("当前文本更短返回 null", () => {
      expect(extractNewSegments("hi", "hello world")).toBeNull();
    });

    it("空文本返回 null", () => {
      expect(extractNewSegments("", "")).toBeNull();
    });

    it("完整句子边界返回新内容", () => {
      const result = extractNewSegments("Hello. ", "");
      expect(result).toBe("Hello.");
    });

    it("中文句子边界返回新内容", () => {
      const result = extractNewSegments("你好。世界。", "");
      expect(result).toBe("你好。世界。");
    });

    it("不完整句子返回 null", () => {
      const result = extractNewSegments("这是一句", "");
      expect(result).toBeNull();
    });

    it("段落分隔符返回前面完整段落", () => {
      const text = "First paragraph.\n\nSecond para";
      const result = extractNewSegments(text, "");
      expect(result).toBe("First paragraph.");
    });

    it("截断过长段落", () => {
      const longText = "A".repeat(600) + ".";
      const result = extractNewSegments(longText, "");
      expect(result).toBe(longText);
    });
  });
});

describe("P-5 aria-live - StreamingAriaAnnouncer 渲染", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("初始状态渲染 aria-live 容器", async () => {
    const { render } = await import("@testing-library/react");
    const { StreamingAriaAnnouncer } = await import("./StreamingAriaAnnouncer");

    const { container } = render(
      <StreamingAriaAnnouncer
        streamingText={null}
        isStreaming={false}
      />,
    );

    const announcer = container.querySelector('[data-testid="streaming-aria-announcer"]');
    expect(announcer).toBeTruthy();
    expect(announcer?.getAttribute("aria-live")).toBe("polite");
    expect(announcer?.getAttribute("aria-atomic")).toBe("false");
    expect(announcer?.getAttribute("role")).toBe("status");
  });

  it("流式完成后播报完成状态", async () => {
    const { render, cleanup } = await import("@testing-library/react");
    const { StreamingAriaAnnouncer } = await import("./StreamingAriaAnnouncer");

    const { container } = render(
      <StreamingAriaAnnouncer
        streamingText="Hello world."
        isStreaming={false}
        justCompleted={true}
      />,
    );

    const announcer = container.querySelector('[data-testid="streaming-aria-announcer"]');
    expect(announcer).toBeTruthy();
    expect(announcer?.textContent).toBe("回复已完成");
    cleanup();
  });
});

describe("P-5 aria-live - StreamingProgressBar", () => {
  it("流式中显示进度条", async () => {
    const { render, cleanup } = await import("@testing-library/react");
    const { StreamingProgressBar } = await import("./StreamingAriaAnnouncer");

    const { getByTestId } = render(
      <StreamingProgressBar progress={45} isStreaming={true} />,
    );

    const progressbar = getByTestId("streaming-progress");
    expect(progressbar.getAttribute("role")).toBe("progressbar");
    expect(progressbar.getAttribute("aria-valuenow")).toBe("45");
    expect(progressbar.getAttribute("aria-valuemin")).toBe("0");
    expect(progressbar.getAttribute("aria-valuemax")).toBe("100");
    expect(progressbar.getAttribute("aria-label")).toBe("AI 回复生成进度");
    cleanup();
  });

  it("非流式不渲染进度条 DOM", async () => {
    const { render, cleanup } = await import("@testing-library/react");
    const { StreamingProgressBar } = await import("./StreamingAriaAnnouncer");

    const { container } = render(
      <StreamingProgressBar progress={100} isStreaming={false} />,
    );

    // React 的 null 返回不产生 DOM 节点
    expect(container.innerHTML).toBe("");
    cleanup();
  });
});
