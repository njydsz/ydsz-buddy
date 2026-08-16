/**
 * @file ComposerInputFeedback 组件级单元测试
 *
 * 覆盖:
 *
 * 1. 字符计数展示（normal / warning / danger / exceeded）
 * 2. @提及加载指示器（show/hide 切换）
 * 3. 长文截断警告（show/hide + 截断/忽略交互）
 * 4. 草稿保存状态（saving / saved 切换）
 * 5. 完整组件：空状态隐藏 + 内容渲染
 * 6. CompactCharCount 紧凑型组件
 *
 * @module components/ComposerInputFeedback.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import {
  ComposerInputFeedback,
  CompactCharCount,
} from "./ComposerInputFeedback";
import {
  CHAR_LIMIT_SUGGESTED,
  CHAR_LIMIT_WARNING,
  LONG_TEXT_WARNING_THRESHOLD,
} from "../hooks/useSmartInputFeedback";
import { __resetAppearanceStorageBridgeForTest, useAppearanceStore } from "../shared/appearanceStore";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  useAppearanceStore.setState({ reducedMotionMode: "auto" });
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
  __resetAppearanceStorageBridgeForTest();
});

afterEach(() => {
  cleanup();
});

describe("ComposerInputFeedback - 字符计数展示", () => {
  it("normal 状态显示普通颜色", () => {
    render(
      <ComposerInputFeedback
        charCount={100}
        charCountStatus="normal"
        showMentionLoading={false}
        showTruncationWarning={false}
        prefersReducedMotion={false}
      />,
    );
    const counter = screen.getByLabelText(/字符数/);
    expect(counter).toBeTruthy();
    expect(counter.textContent).toContain("100");
  });

  it("warning 状态显示警告色 + 限制提示", () => {
    const { container } = render(
      <ComposerInputFeedback
        charCount={CHAR_LIMIT_WARNING}
        charCountStatus="warning"
        showMentionLoading={false}
        showTruncationWarning={false}
        prefersReducedMotion={false}
      />,
    );
    // 通过 aria-label 精准定位字符计数元素
    const counter = container.querySelector('[aria-label^="字符数"]');
    expect(counter).toBeTruthy();
    expect(counter?.textContent).toContain(CHAR_LIMIT_WARNING.toLocaleString());
    expect(counter?.textContent).toContain(CHAR_LIMIT_SUGGESTED.toLocaleString());
  });

  it("exceeded 状态显示限制 / 当前", () => {
    const count = CHAR_LIMIT_SUGGESTED + 100;
    const { container } = render(
      <ComposerInputFeedback
        charCount={count}
        charCountStatus="exceeded"
        showMentionLoading={false}
        showTruncationWarning={false}
        prefersReducedMotion={false}
      />,
    );
    const counter = container.querySelector('[aria-label^="字符数"]');
    expect(counter).toBeTruthy();
    expect(counter?.textContent).toContain(count.toLocaleString());
    expect(counter?.textContent).toContain(CHAR_LIMIT_SUGGESTED.toLocaleString());
  });
});

describe("ComposerInputFeedback - @提及加载指示器", () => {
  it("showMentionLoading=true 时显示搜索中提示", () => {
    render(
      <ComposerInputFeedback
        charCount={5}
        charCountStatus="normal"
        showMentionLoading={true}
        showTruncationWarning={false}
        prefersReducedMotion={false}
      />,
    );
    expect(screen.getByText("搜索提及...")).toBeTruthy();
  });

  it("showMentionLoading=false 时隐藏提示", () => {
    const { container } = render(
      <ComposerInputFeedback
        charCount={5}
        charCountStatus="normal"
        showMentionLoading={false}
        showTruncationWarning={false}
        prefersReducedMotion={false}
      />,
    );
    // 检查元素处于隐藏状态（opacity-0 + pointer-events-none）
    const indicator = container.querySelector('[aria-hidden="true"]');
    expect(indicator).toBeTruthy();
  });
});

describe("ComposerInputFeedback - 截断警告", () => {
  it("showTruncationWarning=true 时显示警告横幅", () => {
    render(
      <ComposerInputFeedback
        charCount={LONG_TEXT_WARNING_THRESHOLD + 100}
        charCountStatus="exceeded"
        showMentionLoading={false}
        showTruncationWarning={true}
        prefersReducedMotion={false}
        onTruncate={() => {}}
        onDismissTruncationWarning={() => {}}
      />,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText(/截断/)).toBeTruthy();
    expect(screen.getByText("忽略")).toBeTruthy();
  });

  it("点击截断按钮调用 onTruncate 回调", () => {
    const onTruncate = vi.fn();
    render(
      <ComposerInputFeedback
        charCount={LONG_TEXT_WARNING_THRESHOLD + 100}
        charCountStatus="exceeded"
        showMentionLoading={false}
        showTruncationWarning={true}
        prefersReducedMotion={false}
        onTruncate={onTruncate}
        onDismissTruncationWarning={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("截断"));
    expect(onTruncate).toHaveBeenCalledTimes(1);
  });

  it("点击忽略按钮调用 onDismissTruncationWarning 回调", () => {
    const onDismiss = vi.fn();
    render(
      <ComposerInputFeedback
        charCount={LONG_TEXT_WARNING_THRESHOLD + 100}
        charCountStatus="exceeded"
        showMentionLoading={false}
        showTruncationWarning={true}
        prefersReducedMotion={false}
        onTruncate={() => {}}
        onDismissTruncationWarning={onDismiss}
      />,
    );
    fireEvent.click(screen.getByText("忽略"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe("ComposerInputFeedback - 草稿保存状态", () => {
  it("isSaving=true 时显示保存中提示", () => {
    render(
      <ComposerInputFeedback
        charCount={5}
        charCountStatus="normal"
        showMentionLoading={false}
        showTruncationWarning={false}
        isSaving={true}
        prefersReducedMotion={false}
      />,
    );
    expect(screen.getByText("保存中...")).toBeTruthy();
  });

  it("lastSavedAt 设置后显示保存时间", () => {
    const savedAt = Date.now() - 5000;
    render(
      <ComposerInputFeedback
        charCount={5}
        charCountStatus="normal"
        showMentionLoading={false}
        showTruncationWarning={false}
        lastSavedAt={savedAt}
        isSaving={false}
        prefersReducedMotion={false}
      />,
    );
    expect(screen.getByText(/秒前保存/)).toBeTruthy();
  });
});

describe("ComposerInputFeedback - 整体行为", () => {
  it("无任何内容时组件整体不渲染（节省空间）", () => {
    const { container } = render(
      <ComposerInputFeedback
        charCount={0}
        charCountStatus="normal"
        showMentionLoading={false}
        showTruncationWarning={false}
        prefersReducedMotion={false}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("custom className 应用到根元素", () => {
    const { container } = render(
      <ComposerInputFeedback
        charCount={100}
        charCountStatus="normal"
        showMentionLoading={false}
        showTruncationWarning={false}
        prefersReducedMotion={false}
        className="custom-test-class"
      />,
    );
    const root = container.querySelector(".custom-test-class");
    expect(root).toBeTruthy();
  });

  it("role=status 提供 ARIA 状态提示", () => {
    render(
      <ComposerInputFeedback
        charCount={100}
        charCountStatus="normal"
        showMentionLoading={false}
        showTruncationWarning={false}
        prefersReducedMotion={false}
      />,
    );
    expect(screen.getByRole("status")).toBeTruthy();
  });
});

describe("CompactCharCount - 紧凑字符计数", () => {
  it("normal 状态仅显示数字", () => {
    render(<CompactCharCount charCount={100} charCountStatus="normal" />);
    expect(screen.getByText("100")).toBeTruthy();
  });

  it("warning 状态显示限制 / 当前", () => {
    const { container } = render(
      <CompactCharCount
        charCount={CHAR_LIMIT_WARNING}
        charCountStatus="warning"
        charLimit={CHAR_LIMIT_SUGGESTED}
      />,
    );
    expect(container.textContent).toContain(CHAR_LIMIT_SUGGESTED.toLocaleString());
  });

  it("custom className 应用", () => {
    const { container } = render(
      <CompactCharCount
        charCount={100}
        charCountStatus="normal"
        className="test-class"
      />,
    );
    expect(container.querySelector(".test-class")).toBeTruthy();
  });
});
