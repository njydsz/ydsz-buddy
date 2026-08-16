/**
 * @file ChatView.logic.test.ts
 * @description ChatView 纯逻辑工具的单元测试
 *
 * 覆盖：
 * - resolveReviewModeDiffAutoOpen 的三种分支（open / noop / skip）
 * - diffIsOpen 兼容 panelState 与 URL 搜索两种来源
 * - 切换离开 review 模式时不做任何面板动作
 * - 重复点击同一模式时不做动作
 * - 所有 ProviderInteractionMode 枚举值都能被正确处理
 */

import { describe, expect, it } from "vitest";
import { resolveReviewModeDiffAutoOpen } from "./ChatView.logic";

describe("resolveReviewModeDiffAutoOpen", () => {
  describe("进入 review 模式（diff 未打开）", () => {
    it("nextMode=review & currentMode=chat & diff=false → open", () => {
      const action = resolveReviewModeDiffAutoOpen({
        nextMode: "review",
        currentMode: "chat",
        diffIsOpen: false,
      });
      expect(action).toEqual({ kind: "open" });
    });

    it("nextMode=review & currentMode=plan & diff=false → open", () => {
      const action = resolveReviewModeDiffAutoOpen({
        nextMode: "review",
        currentMode: "plan",
        diffIsOpen: false,
      });
      expect(action).toEqual({ kind: "open" });
    });

    it("nextMode=review & currentMode=agent & diff=false → open", () => {
      const action = resolveReviewModeDiffAutoOpen({
        nextMode: "review",
        currentMode: "agent",
        diffIsOpen: false,
      });
      expect(action).toEqual({ kind: "open" });
    });

    it("nextMode=review & currentMode=task & diff=false → open", () => {
      const action = resolveReviewModeDiffAutoOpen({
        nextMode: "review",
        currentMode: "task",
        diffIsOpen: false,
      });
      expect(action).toEqual({ kind: "open" });
    });
  });

  describe("进入 review 模式（diff 已打开）", () => {
    it("nextMode=review & diff=true → noop（避免重复 toggle 关闭）", () => {
      // 关键回归保护：panelState 路径下 resolvedDiffOpen=true 时不再触发 toggle
      const action = resolveReviewModeDiffAutoOpen({
        nextMode: "review",
        currentMode: "chat",
        diffIsOpen: true,
      });
      expect(action).toEqual({ kind: "noop" });
    });

    it("nextMode=review & diff=true & currentMode=plan → noop", () => {
      const action = resolveReviewModeDiffAutoOpen({
        nextMode: "review",
        currentMode: "plan",
        diffIsOpen: true,
      });
      expect(action).toEqual({ kind: "noop" });
    });
  });

  describe("离开 review 模式", () => {
    it("nextMode=chat & currentMode=review → skip（不做面板动作）", () => {
      const action = resolveReviewModeDiffAutoOpen({
        nextMode: "chat",
        currentMode: "review",
        diffIsOpen: false,
      });
      expect(action).toEqual({ kind: "skip" });
    });

    it("nextMode=plan & currentMode=review → skip", () => {
      const action = resolveReviewModeDiffAutoOpen({
        nextMode: "plan",
        currentMode: "review",
        diffIsOpen: true,
      });
      expect(action).toEqual({ kind: "skip" });
    });

    it("nextMode=agent & currentMode=review → skip", () => {
      const action = resolveReviewModeDiffAutoOpen({
        nextMode: "agent",
        currentMode: "review",
        diffIsOpen: true,
      });
      expect(action).toEqual({ kind: "skip" });
    });

    it("nextMode=task & currentMode=review → skip", () => {
      const action = resolveReviewModeDiffAutoOpen({
        nextMode: "task",
        currentMode: "review",
        diffIsOpen: false,
      });
      expect(action).toEqual({ kind: "skip" });
    });
  });

  describe("切换到非 review 模式", () => {
    it("nextMode=chat & currentMode=plan → skip", () => {
      const action = resolveReviewModeDiffAutoOpen({
        nextMode: "chat",
        currentMode: "plan",
        diffIsOpen: true,
      });
      expect(action).toEqual({ kind: "skip" });
    });

    it("nextMode=agent & currentMode=chat → skip", () => {
      const action = resolveReviewModeDiffAutoOpen({
        nextMode: "agent",
        currentMode: "chat",
        diffIsOpen: false,
      });
      expect(action).toEqual({ kind: "skip" });
    });
  });

  describe("同模式重复点击（no-op 提前返回）", () => {
    it("nextMode=review & currentMode=review & diff=false → skip（避免 toggle 关闭）", () => {
      // 极端场景：同 mode 重复触发也走 skip 短路
      const action = resolveReviewModeDiffAutoOpen({
        nextMode: "review",
        currentMode: "review",
        diffIsOpen: false,
      });
      expect(action).toEqual({ kind: "skip" });
    });

    it("nextMode=chat & currentMode=chat → skip", () => {
      const action = resolveReviewModeDiffAutoOpen({
        nextMode: "chat",
        currentMode: "chat",
        diffIsOpen: true,
      });
      expect(action).toEqual({ kind: "skip" });
    });
  });

  describe("短路顺序回归", () => {
    it("currentMode 短路先于 nextMode 判定", () => {
      // 即便 nextMode=review 且 diffIsOpen=false，
      // 如果 nextMode === currentMode 应直接 skip 而非 open
      const action = resolveReviewModeDiffAutoOpen({
        nextMode: "review",
        currentMode: "review",
        diffIsOpen: false,
      });
      expect(action.kind).toBe("skip");
    });

    it("nextMode 非 review 短路优先于 diffIsOpen 判定", () => {
      // 即便 diffIsOpen=false，只要 nextMode 不是 review 就不打开 diff
      const action = resolveReviewModeDiffAutoOpen({
        nextMode: "plan",
        currentMode: "chat",
        diffIsOpen: false,
      });
      expect(action.kind).toBe("skip");
    });
  });
});
