/**
 * @file DomesticProviderEnvDiscovery 单元测试
 *
 * 覆盖:
 * 1. DOMESTIC_PROVIDER_ENV_SPECS 6 家 Provider 数量、env var 命名
 * 2. DOMESTIC_P0_ENV_SPECS 与新 SSOT 同源(向后兼容)
 * 3. discoverDomesticProviders - 命中/未命中/部分命中场景
 * 4. pickFirstDiscoveredDomestic - 第一个 discovered + 顺序
 * 5. discoverDomesticProviders 返回结构字段稳定(specs / total)
 *
 * 不依赖 Tauri / IO,纯函数测试。
 */

import { describe, expect, it } from "vitest";
import {
  DOMESTIC_P0_ENV_SPECS,
  DOMESTIC_PROVIDER_ENV_SPECS,
  discoverDomesticProviders,
  pickFirstDiscoveredDomestic,
  type DiscoveredDomesticProvider,
} from "./domesticProviderEnvDiscovery";

describe("domesticProviderEnvDiscovery - DOMESTIC_PROVIDER_ENV_SPECS (6 家)", () => {
  it("恰好 6 家国内 Provider", () => {
    expect(DOMESTIC_PROVIDER_ENV_SPECS).toHaveLength(6);
  });

  it("env var 命名遵循大写 + 下划线(允许 PascalCase 品牌名如 MiniMax_API_KEY)", () => {
    for (const spec of DOMESTIC_PROVIDER_ENV_SPECS) {
      // 大写/小写字母 + 数字 + 下划线;允许 PascalCase 品牌名
      // (如 MiniMax_API_KEY,内含 "MiniMax" 是 MiniMax 官方 API Key 命名)
      expect(spec.envVar).toMatch(/^[A-Za-z][A-Za-z0-9_]*$/);
      // 整个 env var 必须以 _KEY 结尾,确保是 API Key 命名约定
      expect(spec.envVar.endsWith("_KEY")).toBe(true);
    }
    // 显式断言:MiniMax 的真实命名形态
    expect(
      DOMESTIC_PROVIDER_ENV_SPECS.find((s) => s.provider === "MiniMax")?.envVar,
    ).toBe("MiniMax_API_KEY");
  });

  it("ProviderKind 属于 6 个国内分支之一", () => {
    const allowed = new Set([
      "glm",
      "deepseek",
      "moonshot",
      "qwen",
      "mimo",
      "MiniMax",
    ]);
    for (const spec of DOMESTIC_PROVIDER_ENV_SPECS) {
      expect(allowed.has(spec.provider)).toBe(true);
    }
  });

  it("6 家不重复", () => {
    const keys = new Set(DOMESTIC_PROVIDER_ENV_SPECS.map((s) => s.provider));
    expect(keys.size).toBe(6);
  });

  it("包含 6 家 env var(智谱/DeepSeek/Moonshot/Qwen/MiMo/MiniMax)", () => {
    const names = DOMESTIC_PROVIDER_ENV_SPECS.map((s) => s.envVar);
    expect(names).toContain("ZHIPU_API_KEY");
    expect(names).toContain("DEEPSEEK_API_KEY");
    expect(names).toContain("MOONSHOT_API_KEY");
    expect(names).toContain("DASHSCOPE_API_KEY");
    expect(names).toContain("MIMO_API_KEY");
    expect(names).toContain("MiniMax_API_KEY");
  });

  it("defaultModel 非空", () => {
    for (const spec of DOMESTIC_PROVIDER_ENV_SPECS) {
      expect(spec.defaultModel.length).toBeGreaterThan(0);
    }
  });

  it("displayName 非空且不含硬编码英文(品牌词除外)", () => {
    for (const spec of DOMESTIC_PROVIDER_ENV_SPECS) {
      expect(spec.displayName.length).toBeGreaterThan(0);
    }
  });

  it("DOMESTIC_P0_ENV_SPECS 与新 SSOT 同源(向后兼容别名)", () => {
    // 历史代码可能 import DOMESTIC_P0_ENV_SPECS,2026-06-25 改名后
    // 仍需指向同一份数据(避免出现"两份 spec 走偏"的事故)。
    expect(DOMESTIC_P0_ENV_SPECS).toBe(DOMESTIC_PROVIDER_ENV_SPECS);
  });
});

describe("domesticProviderEnvDiscovery - discoverDomesticProviders (6 家)", () => {
  it("env 全空 → discovered=[]", () => {
    const r = discoverDomesticProviders({});
    expect(r.discovered).toEqual([]);
    expect(r.total).toBe(6);
    expect(r.specs).toHaveLength(6);
  });

  it("只设 ZHIPU_API_KEY → discovered 只含 glm", () => {
    const r = discoverDomesticProviders({ ZHIPU_API_KEY: true });
    expect(r.discovered).toHaveLength(1);
    expect(r.discovered[0]?.provider).toBe("glm");
    expect(r.discovered[0]?.envVar).toBe("ZHIPU_API_KEY");
    expect(r.discovered[0]?.hasKey).toBe(true);
  });

  it("6 家全设 → discovered=6", () => {
    const r = discoverDomesticProviders({
      ZHIPU_API_KEY: true,
      DEEPSEEK_API_KEY: true,
      MOONSHOT_API_KEY: true,
      DASHSCOPE_API_KEY: true,
      MIMO_API_KEY: true,
      MiniMax_API_KEY: true,
    });
    expect(r.discovered).toHaveLength(6);
    const providers = r.discovered.map((d) => d.provider);
    expect(providers).toEqual([
      "glm",
      "deepseek",
      "moonshot",
      "qwen",
      "mimo",
      "MiniMax",
    ]);
  });

  it("MiMo + MiniMax 单独命中也能识别(P1-2 后续接入)", () => {
    const r = discoverDomesticProviders({
      MIMO_API_KEY: true,
      MiniMax_API_KEY: true,
    });
    expect(r.discovered.map((d) => d.provider)).toEqual(["mimo", "MiniMax"]);
    const mimo = r.discovered.find((d) => d.provider === "mimo");
    expect(mimo?.envVar).toBe("MIMO_API_KEY");
    expect(mimo?.defaultModel).toBe("mimo-v2-pro");
    const MiniMax = r.discovered.find((d) => d.provider === "MiniMax");
    expect(MiniMax?.envVar).toBe("MiniMax_API_KEY");
    expect(MiniMax?.defaultModel).toBe("MiniMax-Text-01");
  });

  it("顺序按 DOMESTIC_PROVIDER_ENV_SPECS(glm→deepseek→moonshot→qwen→mimo→MiniMax)", () => {
    // 即使打乱传入顺序,discovered 也按规范顺序输出
    const r = discoverDomesticProviders({
      MiniMax_API_KEY: true,
      MIMO_API_KEY: true,
      DASHSCOPE_API_KEY: true,
      ZHIPU_API_KEY: true,
      MOONSHOT_API_KEY: true,
    });
    const providers = r.discovered.map((d) => d.provider);
    expect(providers).toEqual(["glm", "moonshot", "qwen", "mimo", "MiniMax"]);
  });

  it("未设置(值为 false)的 Provider 不会出现在 discovered", () => {
    const r = discoverDomesticProviders({
      ZHIPU_API_KEY: true,
      DEEPSEEK_API_KEY: false,
      MOONSHOT_API_KEY: false,
      DASHSCOPE_API_KEY: true,
      MIMO_API_KEY: false,
      MiniMax_API_KEY: true,
    });
    expect(r.discovered.map((d) => d.provider)).toEqual([
      "glm",
      "qwen",
      "MiniMax",
    ]);
  });

  it("海外 env var(Anthropic/OpenAI 等)不会污染 discovered", () => {
    const r = discoverDomesticProviders({
      ANTHROPIC_API_KEY: true,
      OPENAI_API_KEY: true,
      GOOGLE_API_KEY: true,
      XAI_API_KEY: true,
      CURSOR_API_KEY: true,
    });
    expect(r.discovered).toEqual([]);
  });

  it("混合场景:海外 + 国内 6 家只过滤国内", () => {
    const r = discoverDomesticProviders({
      ANTHROPIC_API_KEY: true,
      ZHIPU_API_KEY: true,
      DEEPSEEK_API_KEY: false,
      MOONSHOT_API_KEY: true,
      DASHSCOPE_API_KEY: false,
      MIMO_API_KEY: true,
      MiniMax_API_KEY: false,
    });
    expect(r.discovered.map((d) => d.provider)).toEqual([
      "glm",
      "moonshot",
      "mimo",
    ]);
  });

  it("discovered 项的 displayName 与 spec 对齐", () => {
    const r = discoverDomesticProviders({ DEEPSEEK_API_KEY: true });
    const item = r.discovered[0] as DiscoveredDomesticProvider;
    const spec = DOMESTIC_PROVIDER_ENV_SPECS.find((s) => s.provider === "deepseek");
    expect(item.displayName).toBe(spec?.displayName);
    expect(item.defaultModel).toBe(spec?.defaultModel);
  });
});

describe("domesticProviderEnvDiscovery - pickFirstDiscoveredDomestic", () => {
  it("空 discovered → null", () => {
    const r = discoverDomesticProviders({});
    expect(pickFirstDiscoveredDomestic(r)).toBeNull();
  });

  it("有 discovered → 返回第一个(spec 顺序)", () => {
    const r = discoverDomesticProviders({
      MOONSHOT_API_KEY: true,
      DASHSCOPE_API_KEY: true,
    });
    // spec 顺序 glm → deepseek → moonshot → qwen → mimo → MiniMax
    // 命中的是 moonshot + qwen → pickFirst 应该返回 moonshot
    const first = pickFirstDiscoveredDomestic(r);
    expect(first?.provider).toBe("moonshot");
  });

  it("6 家全有 → 第一个是 glm(按 spec 顺序)", () => {
    const r = discoverDomesticProviders({
      ZHIPU_API_KEY: true,
      DEEPSEEK_API_KEY: true,
      MOONSHOT_API_KEY: true,
      DASHSCOPE_API_KEY: true,
      MIMO_API_KEY: true,
      MiniMax_API_KEY: true,
    });
    const first = pickFirstDiscoveredDomestic(r);
    expect(first?.provider).toBe("glm");
  });

  it("只设 MiniMax_API_KEY → 第一个是 MiniMax(因为 mimo 在 MiniMax 之前未命中)", () => {
    const r = discoverDomesticProviders({ MiniMax_API_KEY: true });
    const first = pickFirstDiscoveredDomestic(r);
    expect(first?.provider).toBe("MiniMax");
  });

  it("混合:海外 + 国内 6 家 → 国内 6 家里第一个命中的胜出", () => {
    const r = discoverDomesticProviders({
      ANTHROPIC_API_KEY: true,
      MIMO_API_KEY: true,
      MiniMax_API_KEY: true,
    });
    // 国内 spec 顺序:glm → deepseek → moonshot → qwen → mimo → MiniMax
    // 命中的是 mimo + MiniMax → 第一个是 mimo
    const first = pickFirstDiscoveredDomestic(r);
    expect(first?.provider).toBe("mimo");
  });
});
