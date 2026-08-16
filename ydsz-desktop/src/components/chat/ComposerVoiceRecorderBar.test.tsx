/**
 * @file ComposerVoiceRecorderBar.test.tsx
 * @description P1-8 语音下发动画核心单元测试
 *
 * 覆盖：
 * - isRecording/isTranscribing 反映到 data-state
 * - 录音中且未减少动画时打上 recorder-pulse class
 * - 转写中打上 recorder-conveyor class
 * - flyOutSignal 变化时，最后一段波形打上 recorder-flyout class + data-flyout-key
 * - 减少动画偏好下，所有动画 class 都不会被打上
 * - 录音中渲染红点呼吸指示器
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ComposerVoiceRecorderBar } from "./ComposerVoiceRecorderBar";
import { useReducedMotion } from "~/hooks/useReducedMotion";

vi.mock("~/hooks/useReducedMotion", () => ({
  useReducedMotion: vi.fn(),
}));

const useReducedMotionMock = vi.mocked(useReducedMotion);

describe("ComposerVoiceRecorderBar · P1-8 dispatch animations", () => {
  beforeEach(() => {
    useReducedMotionMock.mockReturnValue({
      reducedMotionMode: "off",
      setReducedMotionMode: vi.fn(),
      resetReducedMotionMode: vi.fn(),
      isReducedMotionEnabled: false,
      systemPrefersReducedMotion: false,
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("reflects idle state when not recording and not transcribing", () => {
    render(
      <ComposerVoiceRecorderBar
        durationLabel="0:00"
        isRecording={false}
        isTranscribing={false}
        waveformLevels={[]}
        onCancel={() => undefined}
        onSubmit={() => undefined}
      />,
    );
    const bar = screen.getByTestId("voice-recorder-bar");
    expect(bar.getAttribute("data-state")).toBe("idle");
  });

  it("reflects recording state and applies recorder-pulse class", () => {
    const { container } = render(
      <ComposerVoiceRecorderBar
        durationLabel="0:01"
        isRecording
        isTranscribing={false}
        waveformLevels={[0.3, 0.5, 0.7]}
        onCancel={() => undefined}
        onSubmit={() => undefined}
      />,
    );
    const bar = screen.getByTestId("voice-recorder-bar");
    expect(bar.getAttribute("data-state")).toBe("recording");
    expect(bar.className).toContain("recorder-pulse");
    expect(screen.getByTestId("voice-recorder-recording-dot")).toBeTruthy();
    expect(container.querySelector(".recorder-conveyor")).toBeNull();
  });

  it("reflects transcribing state and applies recorder-conveyor class", () => {
    const { container } = render(
      <ComposerVoiceRecorderBar
        durationLabel="0:03"
        isRecording={false}
        isTranscribing
        waveformLevels={[0.2, 0.4, 0.6, 0.8]}
        onCancel={() => undefined}
        onSubmit={() => undefined}
      />,
    );
    const bar = screen.getByTestId("voice-recorder-bar");
    expect(bar.getAttribute("data-state")).toBe("transcribing");
    expect(bar.className).not.toContain("recorder-pulse");
    expect(container.querySelector(".recorder-conveyor")).toBeTruthy();
    expect(screen.queryByTestId("voice-recorder-recording-dot")).toBeNull();
  });

  it("applies flyout class to the last waveform bar when flyOutSignal changes", () => {
    const { container, rerender } = render(
      <ComposerVoiceRecorderBar
        durationLabel="0:02"
        isRecording={false}
        isTranscribing={false}
        waveformLevels={[0.1, 0.2, 0.3, 0.4]}
        onCancel={() => undefined}
        onSubmit={() => undefined}
        flyOutSignal={1}
      />,
    );
    // 第一次渲染时只设置 signal, effect 会同步递增 activeFlyOutKey,
    // 重新检查 recorder-flyout 是否出现
    const firstFlyout = container.querySelector(".recorder-flyout");
    expect(firstFlyout).toBeTruthy();
    // signal 不变时不会重复触发
    rerender(
      <ComposerVoiceRecorderBar
        durationLabel="0:02"
        isRecording={false}
        isTranscribing={false}
        waveformLevels={[0.1, 0.2, 0.3, 0.4]}
        onCancel={() => undefined}
        onSubmit={() => undefined}
        flyOutSignal={1}
      />,
    );
    const stillFlyout = container.querySelectorAll(".recorder-flyout").length;
    // 多个 segment 共享同一 key,数量应保持稳定
    expect(stillFlyout).toBe(firstFlyout ? 1 : 0);
    // signal 改变后会更新 data-flyout-key
    rerender(
      <ComposerVoiceRecorderBar
        durationLabel="0:02"
        isRecording={false}
        isTranscribing={false}
        waveformLevels={[0.1, 0.2, 0.3, 0.4]}
        onCancel={() => undefined}
        onSubmit={() => undefined}
        flyOutSignal={2}
      />,
    );
    const flyoutEl = container.querySelector('[data-flyout-key]');
    expect(flyoutEl).toBeTruthy();
    expect(flyoutEl?.classList.contains("recorder-flyout")).toBe(true);
  });

  it("disables all animation classes when reduced motion is on", () => {
    useReducedMotionMock.mockReturnValue({
      reducedMotionMode: "on",
      setReducedMotionMode: vi.fn(),
      resetReducedMotionMode: vi.fn(),
      isReducedMotionEnabled: true,
      systemPrefersReducedMotion: true,
    });
    const { container } = render(
      <ComposerVoiceRecorderBar
        durationLabel="0:01"
        isRecording
        isTranscribing={false}
        waveformLevels={[0.3, 0.5, 0.7]}
        onCancel={() => undefined}
        onSubmit={() => undefined}
        flyOutSignal={1}
      />,
    );
    const bar = screen.getByTestId("voice-recorder-bar");
    expect(bar.className).not.toContain("recorder-pulse");
    expect(screen.queryByTestId("voice-recorder-recording-dot")).toBeNull();
    expect(container.querySelector(".recorder-flyout")).toBeNull();
  });
});
