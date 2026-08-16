/**
 * @file providerAvailability 单元测试
 *
 * 覆盖 Provider 可用性归一化、可用判断和不可用原因描述。
 *
 * 关键覆盖：
 *
 * 1. normalizeCustomBinaryPath - 自定义二进制路径规范化
 * 2. normalizeProviderStatusForLocalConfig - 本地配置覆盖逻辑
 *    - 缺失状态返回 null
 *    - 有 customBinaryPath 且 authStatus=unknown 时转换为 warning
 *    - customBinaryPath 与 confirmedCustomBinaryPath 一致时升级为 ready
 *    - available=true 时不应用 customBinaryPath 覆盖
 *    - authStatus 已知时也不应用 customBinaryPath 覆盖
 * 3. isProviderUsable - 可用判断
 * 4. providerUnavailableReason - 不可用原因描述
 */

import { describe, expect, it } from "vitest";

import { PROVIDER_DISPLAY_NAMES, type ServerProviderStatus } from "~/contracts";

import {
  isProviderUsable,
  normalizeCustomBinaryPath,
  normalizeProviderStatusForLocalConfig,
  providerUnavailableReason,
} from "./providerAvailability";

function makeStatus(overrides: Partial<ServerProviderStatus> = {}): ServerProviderStatus {
  return {
    provider: "codex",
    status: "ready",
    available: true,
    authStatus: "authenticated",
    checkedAt: "2026-06-25T10:00:00.000Z",
    ...overrides,
  };
}

describe("providerAvailability", () => {
  describe("normalizeCustomBinaryPath", () => {
    it("null / undefined 输入返回 null", () => {
      expect(normalizeCustomBinaryPath(null)).toBeNull();
      expect(normalizeCustomBinaryPath(undefined)).toBeNull();
    });

    it("非字符串输入返回 null", () => {
      // @ts-expect-error 故意传入非字符串
      expect(normalizeCustomBinaryPath(42)).toBeNull();
      // @ts-expect-error 故意传入非字符串
      expect(normalizeCustomBinaryPath({})).toBeNull();
    });

    it("空字符串返回 null", () => {
      expect(normalizeCustomBinaryPath("")).toBeNull();
    });

    it("纯空白字符串返回 null", () => {
      expect(normalizeCustomBinaryPath("   ")).toBeNull();
      expect(normalizeCustomBinaryPath("\t\n  ")).toBeNull();
    });

    it("正常路径去除首尾空白后返回", () => {
      expect(normalizeCustomBinaryPath("  /usr/local/bin/codex  ")).toBe(
        "/usr/local/bin/codex",
      );
      expect(normalizeCustomBinaryPath("/usr/bin/claude")).toBe("/usr/bin/claude");
    });
  });

  describe("normalizeProviderStatusForLocalConfig", () => {
    it("status 为 null 时返回 null", () => {
      expect(
        normalizeProviderStatusForLocalConfig({
          provider: "codex",
          status: null,
        }),
      ).toBeNull();
    });

    it("status 为 undefined 时返回 null", () => {
      expect(
        normalizeProviderStatusForLocalConfig({
          provider: "codex",
          status: undefined,
        }),
      ).toBeNull();
    });

    it("无 customBinaryPath 时原样返回 status", () => {
      const status = makeStatus();
      expect(
        normalizeProviderStatusForLocalConfig({
          provider: "codex",
          status,
        }),
      ).toBe(status);
    });

    it("customBinaryPath 为空白字符串时按无配置处理", () => {
      const status = makeStatus();
      expect(
        normalizeProviderStatusForLocalConfig({
          provider: "codex",
          status,
          customBinaryPath: "   ",
        }),
      ).toBe(status);
    });

    it("available=true 时不应用 customBinaryPath 覆盖", () => {
      const status = makeStatus({ available: true });
      expect(
        normalizeProviderStatusForLocalConfig({
          provider: "codex",
          status,
          customBinaryPath: "/custom/bin",
        }),
      ).toBe(status);
    });

    it("authStatus=authenticated 时不应用 customBinaryPath 覆盖", () => {
      const status = makeStatus({ authStatus: "authenticated" });
      expect(
        normalizeProviderStatusForLocalConfig({
          provider: "codex",
          status,
          customBinaryPath: "/custom/bin",
        }),
      ).toBe(status);
    });

    it("authStatus=unauthenticated 时不应用 customBinaryPath 覆盖(有显式认证状态)", () => {
      const status = makeStatus({ authStatus: "unauthenticated" });
      expect(
        normalizeProviderStatusForLocalConfig({
          provider: "codex",
          status,
          customBinaryPath: "/custom/bin",
        }),
      ).toBe(status);
    });

    it("customBinaryPath 存在但 confirmedCustomBinaryPath 不匹配时降级为 warning", () => {
      const status = makeStatus({
        available: false,
        authStatus: "unknown",
      });
      const result = normalizeProviderStatusForLocalConfig({
        provider: "codex",
        status,
        customBinaryPath: "/custom/bin",
        confirmedCustomBinaryPath: "/different/bin",
      });
      expect(result).not.toBeNull();
      expect(result?.available).toBe(true);
      expect(result?.status).toBe("warning");
      expect(result?.message).toContain(PROVIDER_DISPLAY_NAMES.codex);
      expect(result?.message).toContain("custom local binary path");
    });

    it("customBinaryPath 与 confirmedCustomBinaryPath 完全一致时升级为 ready", () => {
      const status = makeStatus({
        available: false,
        authStatus: "unknown",
        authType: "api-key",
        authLabel: "Codex API",
        voiceTranscriptionAvailable: true,
      });
      const result = normalizeProviderStatusForLocalConfig({
        provider: "codex",
        status,
        customBinaryPath: "/custom/bin",
        confirmedCustomBinaryPath: "/custom/bin",
      });
      expect(result).not.toBeNull();
      expect(result?.available).toBe(true);
      expect(result?.status).toBe("ready");
      expect(result?.authType).toBe("api-key");
      expect(result?.authLabel).toBe("Codex API");
      expect(result?.voiceTranscriptionAvailable).toBe(true);
      expect(result?.message).toBeUndefined();
    });

    it("customBinaryPath 前后空白会被规范化后再比较", () => {
      const status = makeStatus({
        available: false,
        authStatus: "unknown",
      });
      const result = normalizeProviderStatusForLocalConfig({
        provider: "codex",
        status,
        customBinaryPath: "  /custom/bin  ",
        confirmedCustomBinaryPath: "/custom/bin",
      });
      expect(result?.status).toBe("ready");
    });

    it("confirmedCustomBinaryPath 空白字符串时按未确认处理", () => {
      const status = makeStatus({
        available: false,
        authStatus: "unknown",
      });
      const result = normalizeProviderStatusForLocalConfig({
        provider: "codex",
        status,
        customBinaryPath: "/custom/bin",
        confirmedCustomBinaryPath: "   ",
      });
      expect(result?.status).toBe("warning");
    });

    it("warning 状态保留 status 中的可选字段(message 会被覆盖)", () => {
      const status = makeStatus({
        available: false,
        authStatus: "unknown",
        message: "Original message",
      });
      const result = normalizeProviderStatusForLocalConfig({
        provider: "claudeAgent",
        status,
        customBinaryPath: "/custom/claude",
      });
      expect(result?.message).not.toBe("Original message");
      expect(result?.message).toContain(PROVIDER_DISPLAY_NAMES.claudeAgent);
    });

    it("ready 升级时不会保留原 status.message", () => {
      const status = makeStatus({
        available: false,
        authStatus: "unknown",
        message: "Should be cleared",
      });
      const result = normalizeProviderStatusForLocalConfig({
        provider: "codex",
        status,
        customBinaryPath: "/custom/bin",
        confirmedCustomBinaryPath: "/custom/bin",
      });
      expect(result?.message).toBeUndefined();
    });
  });

  describe("isProviderUsable", () => {
    it("null / undefined 返回 false", () => {
      expect(isProviderUsable(null)).toBe(false);
      expect(isProviderUsable(undefined)).toBe(false);
    });

    it("available=true + authenticated 返回 true", () => {
      expect(isProviderUsable(makeStatus())).toBe(true);
    });

    it("available=false 返回 false", () => {
      expect(isProviderUsable(makeStatus({ available: false }))).toBe(false);
    });

    it("authStatus=unauthenticated 返回 false", () => {
      expect(isProviderUsable(makeStatus({ authStatus: "unauthenticated" }))).toBe(false);
    });

    it("available=true + unknown auth 返回 true(只需要 available)", () => {
      expect(isProviderUsable(makeStatus({ authStatus: "unknown" }))).toBe(true);
    });
  });

  describe("providerUnavailableReason", () => {
    it("null 状态返回 loading 文案", () => {
      expect(providerUnavailableReason(null)).toContain("loading");
      expect(providerUnavailableReason(undefined)).toContain("loading");
    });

    it("authStatus=unauthenticated 返回认证提示", () => {
      const status = makeStatus({
        available: true,
        authStatus: "unauthenticated",
      });
      const reason = providerUnavailableReason(status);
      expect(reason).toContain(PROVIDER_DISPLAY_NAMES.codex);
      expect(reason.toLowerCase()).toContain("authenticated");
    });

    it("available=false 时返回 status.message 或默认文案", () => {
      const withMessage = makeStatus({
        available: false,
        authStatus: "unknown",
        message: "Binary not found",
      });
      expect(providerUnavailableReason(withMessage)).toBe("Binary not found");

      const withoutMessage = makeStatus({
        available: false,
        authStatus: "unknown",
      });
      const reason = providerUnavailableReason(withoutMessage);
      expect(reason).toContain(PROVIDER_DISPLAY_NAMES.codex);
      expect(reason.toLowerCase()).toContain("unavailable");
    });

    it("available=true + authStatus=authenticated 时若 status 有 message 则返回 message", () => {
      const status = makeStatus({
        available: true,
        authStatus: "authenticated",
        message: "Limited availability",
      });
      expect(providerUnavailableReason(status)).toBe("Limited availability");
    });

    it("available=true + 无 message 时返回 limited 文案", () => {
      const status = makeStatus({
        available: true,
        authStatus: "authenticated",
      });
      const reason = providerUnavailableReason(status);
      expect(reason).toContain("limited");
    });

    it("未知 provider 标识时使用 providerId 作为标签", () => {
      // 模拟 contracts 中 PROVIDER_DISPLAY_NAMES 不存在的 provider
      const status = {
        ...makeStatus(),
        // @ts-expect-error 故意测试未在联合中的 provider
        provider: "custom-provider",
      };
      const reason = providerUnavailableReason(status);
      expect(reason).toContain("custom-provider");
    });
  });
});
