/**
 * @file VoicePolishDiffPreview 组件冒烟测试
 *
 * 覆盖：
 * 1. 默认渲染: 显示 preview 标题 + diff 段 + 倒计时
 * 2. Revert 按钮: 点击触发 onRevert
 * 3. Dismiss 按钮: 点击触发 onDismiss
 * 4. 截断标记: 段数过多时显示 "(diff truncated)"
 * 5. 倒计时归零: 触发 onAccept
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { I18nProvider } from "../i18n/I18nContext";

import { VoicePolishDiffPreview } from "./VoicePolishDiffPreview";
import type { PolishDiffSegment, PolishDiffStats } from "../lib/voicePolishDiff";
import { VOICE_POLISH_PREVIEW_WINDOW_MS } from "../lib/voicePolishDiffPreviewLogic";

const sampleSegments: PolishDiffSegment[] = [
  { kind: "kept", text: "请帮我" },
  { kind: "removed", text: "嗯那个" },
  { kind: "added", text: "" },
  { kind: "kept", text: "写一个函数" },
];

const sampleStats: PolishDiffStats = {
  addedChars: 0,
  removedChars: 3,
  keptChars: 8,
  segmentCount: sampleSegments.length,
  changedChars: 3,
  changeRatio: 3 / 11,
};

const longSegments: PolishDiffSegment[] = Array.from({ length: 100 }, (_, i) => ({
  kind: i % 3 === 0 ? ("removed" as const) : ("kept" as const),
  text: `tok${i}`,
}));

const longStats: PolishDiffStats = {
  addedChars: 0,
  removedChars: 130,
  keptChars: 200,
  segmentCount: longSegments.length,
  changedChars: 130,
  changeRatio: 130 / 330,
};

function renderPreview(
  overrides: Partial<React.ComponentProps<typeof VoicePolishDiffPreview>> = {},
) {
  const onAccept = vi.fn();
  const onRevert = vi.fn();
  const onDismiss = vi.fn();
  const props: React.ComponentProps<typeof VoicePolishDiffPreview> = {
    original: "请帮我嗯那个写一个函数",
    polished: "请帮我写一个函数",
    segments: sampleSegments,
    stats: sampleStats,
    startedAt: Date.now(),
    onAccept,
    onRevert,
    onDismiss,
    ...overrides,
  };
  const utils = render(
    <I18nProvider language="zh">
      <VoicePolishDiffPreview {...props} />
    </I18nProvider>,
  );
  return { ...utils, onAccept, onRevert, onDismiss };
}

describe("VoicePolishDiffPreview", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("renders preview title, segments, and summary", () => {
    renderPreview();
    expect(screen.getByTestId("voice-polish-diff-preview")).toBeTruthy();
    expect(screen.getByTestId("voice-polish-diff-segments")).toBeTruthy();
    expect(screen.getByTestId("voice-polish-progress")).toBeTruthy();
  });

  it("renders all segments in normal mode", () => {
    renderPreview();
    const removedNodes = screen.getAllByTestId("voice-polish-diff-segments");
    expect(removedNodes.length).toBeGreaterThan(0);
  });

  it("triggers onRevert when revert button is clicked", () => {
    const { onRevert } = renderPreview();
    fireEvent.click(screen.getByTestId("voice-polish-revert"));
    expect(onRevert).toHaveBeenCalledTimes(1);
  });

  it("triggers onDismiss when dismiss button is clicked", () => {
    const { onDismiss } = renderPreview();
    fireEvent.click(screen.getByTestId("voice-polish-dismiss"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("shows truncation indicator when segments exceed max tokens", () => {
    renderPreview({ segments: longSegments, stats: longStats });
    expect(screen.getByTestId("voice-polish-diff-truncated")).toBeTruthy();
  });

  it("auto-accepts when window expires", () => {
    vi.useFakeTimers();
    try {
      const startedAt = Date.now();
      const { onAccept } = renderPreview({ startedAt });
      expect(onAccept).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(VOICE_POLISH_PREVIEW_WINDOW_MS + 1000);
      });
      expect(onAccept).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
