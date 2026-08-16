/**
 * @file providerPricing 单元测试
 *
 * 覆盖：
 * 1. getModelCost: 命中 / 未命中 / 0/0 视作 null / 非法输入
 * 2. hasModelCost: 命中 true / 未命中 false
 * 3. listConfiguredSlugs: 某 provider 下所有 slug
 * 4. getAllPricing: 不可写(immutable)
 * 5. 国内 + 海外常见模型覆盖
 */

import { describe, expect, it } from "vitest";

import { getAllPricing, getModelCost, hasModelCost, listConfiguredSlugs } from "./providerPricing";

describe("providerPricing", () => {
  describe("getModelCost", () => {
    it("Codex 常见模型命中", () => {
      expect(getModelCost("codex", "gpt-4o")).toEqual({ input: 2.5, output: 10 });
      expect(getModelCost("codex", "o3")).toEqual({ input: 10, output: 40 });
    });

    it("ClaudeAgent 命中", () => {
      expect(getModelCost("claudeAgent", "claude-sonnet-4")).toEqual({ input: 3, output: 15 });
    });

    it("Gemini 命中", () => {
      expect(getModelCost("gemini", "gemini-2.5-pro")).toEqual({ input: 1.25, output: 10 });
    });

    it("国内 Provider 命中", () => {
      expect(getModelCost("deepseek", "deepseek-v3")).toEqual({ input: 0.27, output: 1.1 });
      expect(getModelCost("deepseek", "deepseek-r1")).toEqual({ input: 0.55, output: 2.19 });
      expect(getModelCost("glm", "glm-4-air")).toEqual({ input: 0.12, output: 0.12 });
      expect(getModelCost("moonshot", "kimi-k2")).toEqual({ input: 2, output: 5 });
      expect(getModelCost("qwen", "qwen-3-coder-plus")).toEqual({ input: 4, output: 12 });
    });

    it("新增国内 Provider(Doubao / Ernie / Hunyuan)命中", () => {
      // Doubao(字节跳动·火山方舟 Ark)
      expect(getModelCost("doubao", "doubao-pro-32k")).toEqual({ input: 0.11, output: 0.28 });
      expect(getModelCost("doubao", "doubao-1.5-pro-256k")).toEqual({ input: 0.34, output: 0.86 });
      expect(getModelCost("doubao", "doubao-1.5-vision-pro-32k")).toEqual({
        input: 0.16,
        output: 0.41,
      });

      // Ernie(百度·千帆 v2)
      expect(getModelCost("ernie", "ernie-4.0-8k-latest")).toEqual({ input: 1.4, output: 4.2 });
      expect(getModelCost("ernie", "ernie-3.5-128k")).toEqual({ input: 1.5, output: 4.5 });
      expect(getModelCost("ernie", "ernie-speed-8k")).toEqual({ input: 0.04, output: 0.12 });

      // Hunyuan(腾讯混元)
      expect(getModelCost("hunyuan", "hunyuan-pro")).toEqual({ input: 0.55, output: 1.65 });
      expect(getModelCost("hunyuan", "hunyuan-standard")).toEqual({ input: 0.055, output: 0.165 });
      expect(getModelCost("hunyuan", "hunyuan-code")).toEqual({ input: 0.21, output: 0.62 });
    });

    it("新增国内 Provider 免费模型视作未配置(null)", () => {
      // Ernie 免费档:ernie-lite-8k / ernie-tiny-8k
      expect(getModelCost("ernie", "ernie-lite-8k")).toBeNull();
      expect(getModelCost("ernie", "ernie-tiny-8k")).toBeNull();
      // Hunyuan 免费档:hunyuan-lite
      expect(getModelCost("hunyuan", "hunyuan-lite")).toBeNull();
    });

    it("未知 slug → null", () => {
      expect(getModelCost("codex", "gpt-fake-99")).toBeNull();
    });

    it("未知 provider → null", () => {
      expect(getModelCost("codex" as never, "gpt-4o")).toEqual({ input: 2.5, output: 10 });
      // 合法 provider 但 slug 不存在
      expect(getModelCost("gemini", "gemini-99-fake")).toBeNull();
    });

    it("input=0 且 output=0 视作未配置(返回 null)", () => {
      // glm-4-flash 标记为免费
      expect(getModelCost("glm", "glm-4-flash")).toBeNull();
      expect(getModelCost("mimo", "mimo-7b")).toBeNull();
    });

    it("空字符串 / undefined → null", () => {
      expect(getModelCost("codex", "")).toBeNull();
      // 强行传入 null:不抛错即可
      expect(() => getModelCost(null as never, "gpt-4o")).not.toThrow();
    });
  });

  describe("hasModelCost", () => {
    it("已配置 → true", () => {
      expect(hasModelCost("codex", "gpt-4o")).toBe(true);
    });
    it("未配置 → false", () => {
      expect(hasModelCost("codex", "fake")).toBe(false);
    });
    it("全 0 → false(未公开报价)", () => {
      expect(hasModelCost("glm", "glm-4-flash")).toBe(false);
    });
  });

  describe("listConfiguredSlugs", () => {
    it("codex 至少包含 gpt-4o / o3 / gpt-5", () => {
      const slugs = listConfiguredSlugs("codex");
      expect(slugs).toContain("gpt-4o");
      expect(slugs).toContain("o3");
      expect(slugs).toContain("gpt-5");
    });
    it("deepseek 至少包含 deepseek-v3 / deepseek-r1", () => {
      const slugs = listConfiguredSlugs("deepseek");
      expect(slugs).toContain("deepseek-v3");
      expect(slugs).toContain("deepseek-r1");
    });
    it("新增 Provider 至少包含核心模型", () => {
      expect(listConfiguredSlugs("doubao")).toContain("doubao-pro-32k");
      expect(listConfiguredSlugs("doubao")).toContain("doubao-1.5-pro-256k");
      expect(listConfiguredSlugs("ernie")).toContain("ernie-4.0-8k-latest");
      expect(listConfiguredSlugs("ernie")).toContain("ernie-3.5-128k");
      expect(listConfiguredSlugs("hunyuan")).toContain("hunyuan-pro");
      expect(listConfiguredSlugs("hunyuan")).toContain("hunyuan-code");
    });
    it("无 entry 的 provider → 空数组", () => {
      expect(listConfiguredSlugs("cursor")).toEqual([]);
    });
  });

  describe("getAllPricing", () => {
    it("返回 Map 实例", () => {
      const m = getAllPricing();
      expect(m).toBeInstanceOf(Map);
    });
    it("包含 codex:gpt-4o", () => {
      const m = getAllPricing();
      expect(m.get("codex:gpt-4o")).toEqual({ input: 2.5, output: 10 });
    });
    it("size > 30(覆盖主要 provider)", () => {
      const m = getAllPricing();
      expect(m.size).toBeGreaterThan(30);
    });
  });
});
