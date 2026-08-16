/**
 * @file projectScriptKeybindings 单元测试
 *
 * 覆盖项目脚本快捷键绑定的核心函数:
 *
 * 1. decodeProjectScriptKeybindingRule - 解码快捷键规则
 * 2. keybindingValueForCommand - 倒序查找命令对应的快捷键字符串
 */

import { describe, expect, it } from "vitest";

import type { KeybindingCommand, ResolvedKeybindingsConfig } from "@ydsz-buddy/contracts";

import {
  decodeProjectScriptKeybindingRule,
  keybindingValueForCommand,
  PROJECT_SCRIPT_KEYBINDING_INVALID_MESSAGE,
} from "./projectScriptKeybindings";

describe("projectScriptKeybindings", () => {
  describe("decodeProjectScriptKeybindingRule", () => {
    it("正常输入返回规则", () => {
      const result = decodeProjectScriptKeybindingRule({
        keybinding: "mod+shift+p",
        command: "chat.new" as KeybindingCommand,
      });
      expect(result).toEqual({
        key: "mod+shift+p",
        command: "chat.new",
      });
    });

    it("会 trim 快捷键", () => {
      const result = decodeProjectScriptKeybindingRule({
        keybinding: "  mod+k  ",
        command: "chat.new" as KeybindingCommand,
      });
      expect(result?.key).toBe("mod+k");
    });

    it("空字符串返回 null", () => {
      expect(
        decodeProjectScriptKeybindingRule({
          keybinding: "",
          command: "chat.new" as KeybindingCommand,
        }),
      ).toBeNull();
    });

    it("纯空白返回 null", () => {
      expect(
        decodeProjectScriptKeybindingRule({
          keybinding: "   ",
          command: "chat.new" as KeybindingCommand,
        }),
      ).toBeNull();
    });

    it("null keybinding 返回 null", () => {
      expect(
        decodeProjectScriptKeybindingRule({
          keybinding: null,
          command: "chat.new" as KeybindingCommand,
        }),
      ).toBeNull();
    });

    it("undefined keybinding 返回 null", () => {
      expect(
        decodeProjectScriptKeybindingRule({
          keybinding: undefined,
          command: "chat.new" as KeybindingCommand,
        }),
      ).toBeNull();
    });

    it("空 command 抛错", () => {
      expect(() =>
        decodeProjectScriptKeybindingRule({
          keybinding: "mod+k",
          command: "" as KeybindingCommand,
        }),
      ).toThrow(PROJECT_SCRIPT_KEYBINDING_INVALID_MESSAGE);
    });

    it("非字符串 command 抛错", () => {
      expect(() =>
        decodeProjectScriptKeybindingRule({
          keybinding: "mod+k",
          command: 123 as unknown as KeybindingCommand,
        }),
      ).toThrow(PROJECT_SCRIPT_KEYBINDING_INVALID_MESSAGE);
    });
  });

  describe("keybindingValueForCommand", () => {
    function makeBinding(
      command: KeybindingCommand,
      key: string,
      mods: Partial<{ modKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {},
    ) {
      return {
        command,
        shortcut: {
          key,
          metaKey: false,
          ctrlKey: false,
          modKey: false,
          altKey: false,
          shiftKey: false,
          ...mods,
        },
      };
    }

    it("简单按键", () => {
      const config: ResolvedKeybindingsConfig = [
        makeBinding("chat.new", "p"),
      ];
      expect(keybindingValueForCommand(config, "chat.new")).toBe("p");
    });

    it("mod+key 组合", () => {
      const config: ResolvedKeybindingsConfig = [
        makeBinding("chat.new", "p", { modKey: true }),
      ];
      expect(keybindingValueForCommand(config, "chat.new")).toBe("mod+p");
    });

    it("多 modifier 组合", () => {
      const config: ResolvedKeybindingsConfig = [
        makeBinding("chat.new", "p", { modKey: true, shiftKey: true, altKey: true }),
      ];
      expect(keybindingValueForCommand(config, "chat.new")).toBe("mod+alt+shift+p");
    });

    it("space 键归一化为 'space'", () => {
      const config: ResolvedKeybindingsConfig = [
        makeBinding("chat.new", " "),
      ];
      expect(keybindingValueForCommand(config, "chat.new")).toBe("space");
    });

    it("escape 键归一化为 'esc'", () => {
      const config: ResolvedKeybindingsConfig = [
        makeBinding("chat.new", "escape"),
      ];
      expect(keybindingValueForCommand(config, "chat.new")).toBe("esc");
    });

    it("未找到返回 null", () => {
      const config: ResolvedKeybindingsConfig = [
        makeBinding("chat.new", "p"),
      ];
      expect(keybindingValueForCommand(config, "terminal.toggle")).toBeNull();
    });

    it("倒序查找(后定义覆盖前定义)", () => {
      const config: ResolvedKeybindingsConfig = [
        makeBinding("chat.new", "k", { modKey: true }),
        makeBinding("chat.new", "p", { modKey: true, shiftKey: true }),
      ];
      // 倒序查找,先找到后面定义的 "p"
      expect(keybindingValueForCommand(config, "chat.new")).toBe("mod+shift+p");
    });

    it("空配置返回 null", () => {
      expect(keybindingValueForCommand([], "chat.new")).toBeNull();
    });

    it("ctrl / meta / alt / shift 全部 modifier 组合", () => {
      const config: ResolvedKeybindingsConfig = [
        makeBinding("chat.new", "k", {
          modKey: true,
          ctrlKey: true,
          metaKey: true,
          altKey: true,
          shiftKey: true,
        }),
      ];
      expect(keybindingValueForCommand(config, "chat.new")).toBe(
        "mod+ctrl+meta+alt+shift+k",
      );
    });
  });
});
