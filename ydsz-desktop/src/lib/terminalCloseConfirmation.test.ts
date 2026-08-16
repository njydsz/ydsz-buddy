/**
 * @file terminalCloseConfirmation 单元测试
 *
 * 覆盖终端关闭确认的纯函数与集成路径:
 *
 * 1. resolveTerminalCloseTitle - 解析终端标题(覆盖 → 标签 → 默认值)
 * 2. buildTerminalCloseConfirmationMessage - 构建确认消息(含 thread 删除提示)
 * 3. confirmTerminalTabClose - 弹窗流程(enabled / api 校验)
 */

import { describe, expect, it, vi } from "vitest";

import {
  buildTerminalCloseConfirmationMessage,
  confirmTerminalTabClose,
  resolveTerminalCloseTitle,
} from "./terminalCloseConfirmation";

describe("terminalCloseConfirmation", () => {
  describe("resolveTerminalCloseTitle", () => {
    it("标题覆盖优先", () => {
      const result = resolveTerminalCloseTitle({
        terminalId: "t1",
        terminalLabelsById: { t1: "label-foo" },
        terminalTitleOverridesById: { t1: "override-foo" },
      });
      expect(result).toBe("override-foo");
    });

    it("无覆盖时使用标签", () => {
      const result = resolveTerminalCloseTitle({
        terminalId: "t1",
        terminalLabelsById: { t1: "label-foo" },
        terminalTitleOverridesById: {},
      });
      expect(result).toBe("label-foo");
    });

    it("都缺失时返回 'Terminal'", () => {
      const result = resolveTerminalCloseTitle({
        terminalId: "t1",
        terminalLabelsById: {},
        terminalTitleOverridesById: {},
      });
      expect(result).toBe("Terminal");
    });

    it("覆盖值为空白字符串时回退到标签", () => {
      const result = resolveTerminalCloseTitle({
        terminalId: "t1",
        terminalLabelsById: { t1: "label-foo" },
        terminalTitleOverridesById: { t1: "   " },
      });
      expect(result).toBe("label-foo");
    });

    it("覆盖值会 trim", () => {
      const result = resolveTerminalCloseTitle({
        terminalId: "t1",
        terminalLabelsById: {},
        terminalTitleOverridesById: { t1: "  spaced  " },
      });
      expect(result).toBe("spaced");
    });
  });

  describe("buildTerminalCloseConfirmationMessage", () => {
    it("带标题 + 不删除线程的简洁提示", () => {
      const message = buildTerminalCloseConfirmationMessage({
        terminalTitle: "build",
        willDeleteThread: false,
      });
      expect(message).toContain("Close terminal \"build\"?");
      expect(message).toContain("permanently clears");
      expect(message).not.toContain("deletes the empty terminal thread");
    });

    it("带标题 + 删除线程的完整提示", () => {
      const message = buildTerminalCloseConfirmationMessage({
        terminalTitle: "build",
        willDeleteThread: true,
      });
      expect(message).toContain("deletes the empty terminal thread");
    });

    it("无标题使用 'this terminal' 替代", () => {
      const message = buildTerminalCloseConfirmationMessage({
        terminalTitle: null,
        willDeleteThread: false,
      });
      expect(message).toContain("Close this terminal?");
    });

    it("空白标题使用 'this terminal' 替代", () => {
      const message = buildTerminalCloseConfirmationMessage({
        terminalTitle: "   ",
        willDeleteThread: false,
      });
      expect(message).toContain("Close this terminal?");
    });

    it("undefined 标题处理", () => {
      const message = buildTerminalCloseConfirmationMessage({
        terminalTitle: undefined,
        willDeleteThread: true,
      });
      expect(message).toContain("Close this terminal?");
      expect(message).toContain("deletes the empty terminal thread");
    });
  });

  describe("confirmTerminalTabClose", () => {
    it("disabled 时直接返回 true", async () => {
      const dialogs = { confirm: vi.fn() };
      const result = await confirmTerminalTabClose({
        api: { dialogs },
        enabled: false,
        terminalTitle: "t",
      });
      expect(result).toBe(true);
      expect(dialogs.confirm).not.toHaveBeenCalled();
    });

    it("api 缺失时直接返回 true", async () => {
      const result = await confirmTerminalTabClose({
        api: null,
        enabled: true,
        terminalTitle: "t",
      });
      expect(result).toBe(true);
    });

    it("api undefined 时直接返回 true", async () => {
      const result = await confirmTerminalTabClose({
        api: undefined,
        enabled: true,
        terminalTitle: "t",
      });
      expect(result).toBe(true);
    });

    it("正常流程调用 dialogs.confirm", async () => {
      const dialogs = { confirm: vi.fn().mockResolvedValue(true) };
      const result = await confirmTerminalTabClose({
        api: { dialogs },
        enabled: true,
        terminalTitle: "build",
        willDeleteThread: true,
      });
      expect(result).toBe(true);
      expect(dialogs.confirm).toHaveBeenCalledTimes(1);
      const message = dialogs.confirm.mock.calls[0]?.[0] as string;
      expect(message).toContain("build");
      expect(message).toContain("deletes");
    });

    it("用户取消时返回 false", async () => {
      const dialogs = { confirm: vi.fn().mockResolvedValue(false) };
      const result = await confirmTerminalTabClose({
        api: { dialogs },
        enabled: true,
        terminalTitle: "build",
      });
      expect(result).toBe(false);
    });

    it("willDeleteThread 默认 false", async () => {
      const dialogs = { confirm: vi.fn().mockResolvedValue(true) };
      await confirmTerminalTabClose({
        api: { dialogs },
        enabled: true,
        terminalTitle: "t",
      });
      const message = dialogs.confirm.mock.calls[0]?.[0] as string;
      expect(message).not.toContain("deletes");
    });
  });
});
