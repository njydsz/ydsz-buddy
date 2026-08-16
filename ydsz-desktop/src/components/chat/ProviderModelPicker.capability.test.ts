/**
 * @file ProviderModelPicker capability 过滤单元测试
 * @description P3-8: 验证 provider picker 集成了 modelCapabilities 过滤
 *
 * 关注点(纯逻辑,不渲染完整菜单):
 *  - 搜索过滤后应用能力 chip 过滤
 *  - 多个 chip 勾选时 AND 语义
 *  - 切换 provider 时 chip state 互相独立
 */

import { describe, expect, it } from "vitest";
import {
  emptyCapabilityFilter,
  filterModelsByCapabilities,
  toggleCapability,
  type ModelCapabilityKey,
} from "~/lib/modelCapabilities";
import type { ProviderModelOption } from "~/providerModelOptions";

function makeModel(overrides: Partial<ProviderModelOption> = {}): ProviderModelOption {
  return {
    slug: "m",
    name: "M",
    ...overrides,
  };
}

describe("ProviderModelPicker capability 过滤集成 (P3-8)", () => {
  const MODELS: ProviderModelOption[] = [
    makeModel({
      slug: "gpt-4o",
      name: "GPT-4o",
      capabilities: { imageInput: true, toolUse: true },
    }),
    makeModel({
      slug: "o1",
      name: "o1",
      capabilities: { reasoning: true, toolUse: true },
    }),
    makeModel({
      slug: "haiku",
      name: "Haiku",
      capabilities: { toolUse: true },
    }),
    makeModel({
      slug: "opus",
      name: "Opus",
      capabilities: { imageInput: true, toolUse: true, reasoning: true, attachment: true },
    }),
    makeModel({ slug: "unknown", name: "Unknown" }),
  ];

  it("能力 chip 不过滤(空 required) → 保留全部 5 个", () => {
    const out = filterModelsByCapabilities(MODELS, emptyCapabilityFilter().required);
    expect(out).toHaveLength(MODELS.length);
  });

  it("勾选 imageInput → 只保留 GPT-4o 和 Opus", () => {
    const state = toggleCapability(emptyCapabilityFilter(), "imageInput");
    const out = filterModelsByCapabilities(MODELS, state.required);
    expect(out.map((m) => m.slug).sort()).toEqual(["gpt-4o", "opus"]);
  });

  it("勾选 imageInput + reasoning → 只有 Opus 满足 AND", () => {
    let state = toggleCapability(emptyCapabilityFilter(), "imageInput");
    state = toggleCapability(state, "reasoning");
    const out = filterModelsByCapabilities(MODELS, state.required);
    expect(out.map((m) => m.slug)).toEqual(["opus"]);
  });

  it("勾选 attachment → 只 Opus 命中", () => {
    const state = toggleCapability(emptyCapabilityFilter(), "attachment");
    const out = filterModelsByCapabilities(MODELS, state.required);
    expect(out.map((m) => m.slug)).toEqual(["opus"]);
  });

  it("缺 caps 数据的模型(Unknown)始终被过滤", () => {
    const state = toggleCapability(emptyCapabilityFilter(), "toolUse");
    const out = filterModelsByCapabilities(MODELS, state.required);
    expect(out.find((m) => m.slug === "unknown")).toBeUndefined();
  });

  it("chip 集合不可变(toggle 后原 state 保持空)", () => {
    const s0 = emptyCapabilityFilter();
    toggleCapability(s0, "toolUse");
    expect(s0.required.size).toBe(0);
  });

  it("模拟 provider 切换:不同 provider 用不同 chip 状态", () => {
    // 模拟 picker 内 capabilityFilterByProvider 状态
    const byProvider: Record<string, { required: Set<ModelCapabilityKey> }> = {};
    byProvider["opencode"] = toggleCapability(emptyCapabilityFilter(), "reasoning");
    byProvider["kilo"] = toggleCapability(emptyCapabilityFilter(), "imageInput");

    // 验证 opencode 过滤后只剩 o1 + opus
    const opencodeFiltered = filterModelsByCapabilities(MODELS, byProvider["opencode"]!.required);
    expect(opencodeFiltered.map((m) => m.slug).sort()).toEqual(["o1", "opus"]);

    // 验证 kilo 过滤后只剩 gpt-4o + opus
    const kiloFiltered = filterModelsByCapabilities(MODELS, byProvider["kilo"]!.required);
    expect(kiloFiltered.map((m) => m.slug).sort()).toEqual(["gpt-4o", "opus"]);

    // 互相独立
    expect(byProvider["opencode"]!.required.has("imageInput")).toBe(false);
    expect(byProvider["kilo"]!.required.has("reasoning")).toBe(false);
  });

  it("搜索过滤后再叠加能力过滤(模拟 picker 主流程)", () => {
    // 模拟 user 输入 "o" 搜索
    const searchFiltered = MODELS.filter((m) => m.name.toLowerCase().includes("o"));
    // searchFiltered = GPT-4o, o1, Opus (Unknown / Haiku 不含 o)

    // 勾选 reasoning 后,只有 o1 + Opus
    const state = toggleCapability(emptyCapabilityFilter(), "reasoning");
    const out = filterModelsByCapabilities(searchFiltered, state.required);
    expect(out.map((m) => m.slug).sort()).toEqual(["o1", "opus"]);
  });
});
