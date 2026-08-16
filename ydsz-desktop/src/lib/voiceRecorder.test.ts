/**
 * @file voiceRecorder 单元测试
 *
 * 覆盖纯函数 formatVoiceRecordingDuration 的格式化逻辑。
 *
 * useVoiceRecorder 钩子依赖浏览器 MediaDevices API、Web Audio API、FileReader 等
 * 真实运行时环境，不在 jsdom 中进行端到端测试（这些 API 的 mock 价值低，
 * 实际录音由 E2E 覆盖）。
 *
 * ## 关键覆盖
 *
 * 1. formatVoiceRecordingDuration
 *    - 0 ms 边界
 *    - 负数裁剪
 *    - 60s 边界(秒数 0-pad)
 *    - 分钟进位(>= 60s)
 *    - 大于 60 分钟
 *    - 浮点数截断
 */

import { describe, expect, it } from "vitest";

import { formatVoiceRecordingDuration } from "./voiceRecorder";

describe("voiceRecorder", () => {
  describe("formatVoiceRecordingDuration", () => {
    it("0 ms 返回 0:00", () => {
      expect(formatVoiceRecordingDuration(0)).toBe("0:00");
    });

    it("负数被裁剪为 0:00", () => {
      expect(formatVoiceRecordingDuration(-1000)).toBe("0:00");
      expect(formatVoiceRecordingDuration(-0.5)).toBe("0:00");
    });

    it("小于 1 秒的 ms 向下取整为 0:00", () => {
      expect(formatVoiceRecordingDuration(500)).toBe("0:00");
      expect(formatVoiceRecordingDuration(999)).toBe("0:00");
    });

    it("正好 1 秒显示为 0:01", () => {
      expect(formatVoiceRecordingDuration(1_000)).toBe("0:01");
    });

    it("秒数小于 10 自动前导 0", () => {
      expect(formatVoiceRecordingDuration(5_000)).toBe("0:05");
      expect(formatVoiceRecordingDuration(9_000)).toBe("0:09");
    });

    it("秒数 >= 10 时不需要前导 0", () => {
      expect(formatVoiceRecordingDuration(10_000)).toBe("0:10");
      expect(formatVoiceRecordingDuration(45_000)).toBe("0:45");
    });

    it("正好 60 秒显示为 1:00", () => {
      expect(formatVoiceRecordingDuration(60_000)).toBe("1:00");
    });

    it("1 分 5 秒显示为 1:05", () => {
      expect(formatVoiceRecordingDuration(65_000)).toBe("1:05");
    });

    it("59 分 59 秒显示为 59:59", () => {
      const ms = (59 * 60 + 59) * 1_000;
      expect(formatVoiceRecordingDuration(ms)).toBe("59:59");
    });

    it("60 分钟显示为 60:00", () => {
      const ms = 60 * 60 * 1_000;
      expect(formatVoiceRecordingDuration(ms)).toBe("60:00");
    });

    it("99 分钟", () => {
      const ms = 99 * 60 * 1_000;
      expect(formatVoiceRecordingDuration(ms)).toBe("99:00");
    });

    it("向下取整(1234 ms → 0:01)", () => {
      expect(formatVoiceRecordingDuration(1_234)).toBe("0:01");
    });

    it("小时场景(1h1m1s = 3661s)", () => {
      const ms = 3_661_000;
      // 实现: 总分钟数 61, 秒数 1
      expect(formatVoiceRecordingDuration(ms)).toBe("61:01");
    });
  });
});
