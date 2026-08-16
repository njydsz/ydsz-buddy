/**
 * @file 模型能力徽章 + 过滤 chip 单元测试
 * @description 验证:
 *   - listEnabledCapabilities / filterModelsByCapabilities 过滤逻辑
 *   - formatContextWindow / formatModelCost 展示格式
 *   - toggleCapability / clearCapabilityFilter 状态机
 */

import { describe, it, expect } from "vitest";
import {
  CAPABILITY_KEYS_BY_ORDER,
  CAPABILITY_META,
  clearCapabilityFilter,
  emptyCapabilityFilter,
  filterModelsByCapabilities,
  formatContextWindow,
  formatModelCost,
  listEnabledCapabilities,
  toggleCapability,
  type ModelCapabilityKey,
} from "./modelCapabilities";
import type { ProviderModelOption } from "../providerModelOptions";

function makeModel(overrides: Partial<ProviderModelOption> = {}): ProviderModelOption {
  return {
    slug: "m",
    name: "M",
    ...overrides,
  };
}

describe("modelCapabilities - listEnabledCapabilities", () => {
  it("caps=undefined 返回空", () => {
    expect(listEnabledCapabilities(undefined)).toEqual([]);
  });

  it("caps={} 返回空", () => {
    expect(listEnabledCapabilities({})).toEqual([]);
  });

  it("只列 caps[k]===true 的项, 按 CAPABILITY_KEYS_BY_ORDER 排序", () => {
    expect(
      listEnabledCapabilities({ reasoning: true, imageInput: true, toolUse: false }),
    ).toEqual(["imageInput", "reasoning"]);
  });

  it("caps.streaming=true 不出现在列表(不在 4 个核心能力里)", () => {
    expect(listEnabledCapabilities({ streaming: true })).toEqual([]);
  });

  it("全能力开启时返回完整 4 项", () => {
    expect(
      listEnabledCapabilities({
        imageInput: true,
        toolUse: true,
        reasoning: true,
        attachment: true,
      }),
    ).toEqual(["imageInput", "toolUse", "reasoning", "attachment"]);
  });
});

describe("modelCapabilities - filterModelsByCapabilities", () => {
  const models: ProviderModelOption[] = [
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
    makeModel({ slug: "unknown", name: "Unknown" }),
  ];

  it("空 required 不过滤", () => {
    const out = filterModelsByCapabilities(models, new Set());
    expect(out.length).toBe(4);
  });

  it("required={imageInput} 只保留 gpt-4o", () => {
    const out = filterModelsByCapabilities(models, new Set<ModelCapabilityKey>(["imageInput"]));
    expect(out.map((m) => m.slug)).toEqual(["gpt-4o"]);
  });

  it("required={toolUse} 保留 gpt-4o / o1 / haiku", () => {
    const out = filterModelsByCapabilities(models, new Set<ModelCapabilityKey>(["toolUse"]));
    expect(out.map((m) => m.slug).sort()).toEqual(["gpt-4o", "haiku", "o1"]);
  });

  it("required={imageInput, toolUse} AND 语义, 只命中 gpt-4o", () => {
    const out = filterModelsByCapabilities(
      models,
      new Set<ModelCapabilityKey>(["imageInput", "toolUse"]),
    );
    expect(out.map((m) => m.slug)).toEqual(["gpt-4o"]);
  });

  it("缺数据模型(无 capabilities)被过滤掉", () => {
    const out = filterModelsByCapabilities(models, new Set<ModelCapabilityKey>(["toolUse"]));
    expect(out.find((m) => m.slug === "unknown")).toBeUndefined();
  });
});

describe("modelCapabilities - formatContextWindow", () => {
  it("undefined / 空 → null", () => {
    expect(formatContextWindow(undefined)).toBeNull();
    expect(formatContextWindow("")).toBeNull();
    expect(formatContextWindow("   ")).toBeNull();
  });

  it("带 K 后缀 → 原样大写", () => {
    expect(formatContextWindow("128K")).toBe("128K");
    expect(formatContextWindow("200k")).toBe("200K");
  });

  it("带 M 后缀 → 原样大写", () => {
    expect(formatContextWindow("1M")).toBe("1M");
  });

  it("纯数字 → 转 K/M", () => {
    expect(formatContextWindow("128000")).toBe("128K");
    expect(formatContextWindow("1000000")).toBe("1M");
    expect(formatContextWindow("1500000")).toBe("1.5M");
    expect(formatContextWindow("1000")).toBe("1K");
  });

  it("非法数字 → 原样返回", () => {
    expect(formatContextWindow("huge")).toBe("huge");
  });

  it("0 / 负数 → 原样返回", () => {
    expect(formatContextWindow("0")).toBe("0");
  });
});

describe("modelCapabilities - formatModelCost", () => {
  it("undefined → null", () => {
    expect(formatModelCost(undefined)).toBeNull();
  });

  it("只有 input", () => {
    expect(formatModelCost({ input: 3 })).toBe("$3");
  });

  it("只有 output", () => {
    expect(formatModelCost({ output: 15 })).toBe("$15");
  });

  it("input + output → '$3 / $15'", () => {
    expect(formatModelCost({ input: 3, output: 15 })).toBe("$3 / $15");
  });

  it("小数定价", () => {
    expect(formatModelCost({ input: 0.075, output: 0.3 })).toBe("$0.075 / $0.3");
  });
});

describe("modelCapabilities - filter state", () => {
  it("emptyCapabilityFilter 返回空 required", () => {
    const s = emptyCapabilityFilter();
    expect(s.required.size).toBe(0);
  });

  it("clearCapabilityFilter 等价 emptyCapabilityFilter", () => {
    const s = clearCapabilityFilter();
    expect(s.required.size).toBe(0);
  });

  it("toggleCapability 命中则移除", () => {
    const s0 = { required: new Set<ModelCapabilityKey>(["imageInput"]) };
    const s1 = toggleCapability(s0, "imageInput");
    expect(s1.required.has("imageInput")).toBe(false);
  });

  it("toggleCapability 未命中则加入", () => {
    const s0 = emptyCapabilityFilter();
    const s1 = toggleCapability(s0, "toolUse");
    expect(s1.required.has("toolUse")).toBe(true);
  });

  it("toggleCapability 不修改原 state(不可变)", () => {
    const s0 = emptyCapabilityFilter();
    toggleCapability(s0, "toolUse");
    expect(s0.required.size).toBe(0);
  });
});

describe("modelCapabilities - CAPABILITY_META 完整性", () => {
  it("4 个核心能力都存在", () => {
    expect(Object.keys(CAPABILITY_META).sort()).toEqual(
      ["attachment", "imageInput", "reasoning", "toolUse"].sort(),
    );
  });

  it("CAPABILITY_KEYS_BY_ORDER 长度与 META 一致", () => {
    expect(CAPABILITY_KEYS_BY_ORDER.length).toBe(4);
  });

  it("每个 meta 都有非空 label / glyph / order", () => {
    for (const meta of Object.values(CAPABILITY_META)) {
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.glyph.length).toBeGreaterThan(0);
      expect(Number.isFinite(meta.order)).toBe(true);
    }
  });
});
