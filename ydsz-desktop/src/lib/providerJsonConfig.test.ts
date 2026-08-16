/**
 * @file providerJsonConfig 单元测试
 * @description 验证:
 *   - expandEnvPlaceholders 占位符展开
 *   - parseProviderJsonConfig JSON 解析 + 校验
 *   - jsonConfigToStoreConfig / storeConfigToJsonConfig 转换
 *   - resolveRuntimeProvider 运行时合并
 */

import { describe, it, expect } from "vitest";
import {
  expandEnvPlaceholders,
  expandEnvInRecord,
  parseProviderJsonConfig,
  jsonConfigToStoreConfig,
  storeConfigToJsonConfig,
  resolveRuntimeProvider,
  type ProviderJsonConfig,
} from "./providerJsonConfig";
import type { ResolvedCustomProvider } from "./customProviderStore";

describe("providerJsonConfig - expandEnvPlaceholders", () => {
  it("无占位符时原样返回", () => {
    expect(expandEnvPlaceholders("plain text", { FOO: "x" })).toBe("plain text");
  });

  it("空字符串 / undefined 走快速路径", () => {
    expect(expandEnvPlaceholders("", { FOO: "x" })).toBe("");
  });

  it("{env:VAR} 命中环境变量", () => {
    expect(expandEnvPlaceholders("token={env:FOO_TOKEN}", { FOO_TOKEN: "secret" })).toBe(
      "token=secret",
    );
  });

  it("{env:VAR} 未命中返回空字符串", () => {
    expect(expandEnvPlaceholders("x={env:MISSING}", {})).toBe("x=");
  });

  it("{env:VAR:-default} 未命中时使用 default", () => {
    expect(expandEnvPlaceholders("x={env:MISSING:-fallback}", {})).toBe("x=fallback");
  });

  it("{env:VAR:-default} 命中时优先用环境变量", () => {
    expect(
      expandEnvPlaceholders("x={env:FOO:-fallback}", { FOO: "real" }),
    ).toBe("x=real");
  });

  it("支持多个占位符混排", () => {
    const result = expandEnvPlaceholders(
      "{env:A}-{env:B}-{env:C:-c}",
      { A: "1", B: "2" },
    );
    expect(result).toBe("1-2-c");
  });

  it("显式传 env 覆盖默认(测试隔离)", () => {
    const env = { TEST_TOKEN: "abc" };
    expect(expandEnvPlaceholders("{env:TEST_TOKEN}", env)).toBe("abc");
  });

  it("占位符名不匹配大写格式时原样返回(不做替换)", () => {
    // {env:lowercase} 不匹配 /[A-Z_][A-Z0-9_]*/ 格式,函数保留原字符串
    expect(
      expandEnvPlaceholders("{env:lowercase}", { lowercase: "v" }),
    ).toBe("{env:lowercase}");
  });
});

describe("providerJsonConfig - expandEnvInRecord", () => {
  it("undefined 输入返回 undefined", () => {
    expect(expandEnvInRecord(undefined)).toBeUndefined();
  });

  it("空对象返回空对象", () => {
    expect(expandEnvInRecord({})).toEqual({});
  });

  it("对每个 value 做 env 展开", () => {
    const result = expandEnvInRecord(
      { A: "{env:API_KEY}", B: "plain" },
      { API_KEY: "sk-1" },
    );
    expect(result).toEqual({ A: "sk-1", B: "plain" });
  });
});

describe("providerJsonConfig - parseProviderJsonConfig", () => {
  it("合法 openai 配置解析成功", () => {
    const json = JSON.stringify({
      key: "my-302ai",
      name: "302.AI",
      protocol: "openai",
      baseUrl: "https://api.302.ai/v1",
      apiKey: "{env:AI_302_KEY}",
      defaultModel: "gpt-4o",
    });
    const r = parseProviderJsonConfig(json);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.key).toBe("my-302ai");
      expect(r.value.protocol).toBe("openai");
      expect(r.value.apiKey).toBe("{env:AI_302_KEY}");
      expect(r.value.enabled).toBe(true);
    }
  });

  it("合法 anthropic-compatible 配置解析成功", () => {
    const json = JSON.stringify({
      key: "glm-anthropic",
      name: "GLM Anthropic 兼容",
      protocol: "anthropic-compatible",
      baseUrl: "https://open.bigmodel.cn/api/anthropic",
      apiKey: "{env:GLM_KEY}",
      defaultModel: "glm-4.5",
      options: { timeoutMs: 60000, extraHeaders: { "X-Trace-Id": "abc" } },
      models: {
        "glm-4.5": { name: "GLM-4.5", toolUse: true, imageInput: false },
      },
    });
    const r = parseProviderJsonConfig(json);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.protocol).toBe("anthropic-compatible");
      expect(r.value.options?.timeoutMs).toBe(60000);
      expect(r.value.models?.["glm-4.5"]?.toolUse).toBe(true);
    }
  });

  it("JSON 解析失败返回 error", () => {
    const r = parseProviderJsonConfig("{ bad json");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("JSON 解析失败");
  });

  it("顶层不是 object 返回 error", () => {
    const r = parseProviderJsonConfig("null");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("顶层必须是 object");
  });

  it("key 非法字符返回 error", () => {
    const json = JSON.stringify({
      key: "Bad Key!",
      name: "X",
      protocol: "openai",
      baseUrl: "https://api.x.com/v1",
      defaultModel: "gpt-4o",
    });
    const r = parseProviderJsonConfig(json);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("key");
  });

  it("key 以连字符开头返回 error", () => {
    const json = JSON.stringify({
      key: "-bad",
      name: "X",
      protocol: "openai",
      baseUrl: "https://api.x.com/v1",
      defaultModel: "gpt-4o",
    });
    const r = parseProviderJsonConfig(json);
    expect(r.ok).toBe(false);
  });

  it("name 为空返回 error", () => {
    const r = parseProviderJsonConfig(
      JSON.stringify({
        key: "x",
        name: "  ",
        protocol: "openai",
        baseUrl: "https://x.com/v1",
        defaultModel: "m",
      }),
    );
    expect(r.ok).toBe(false);
  });

  it("未知 protocol 返回 error", () => {
    const r = parseProviderJsonConfig(
      JSON.stringify({
        key: "x",
        name: "X",
        protocol: "foo",
        baseUrl: "https://x.com/v1",
        defaultModel: "m",
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("protocol");
  });

  it("baseUrl 不是 http(s) 返回 error", () => {
    const r = parseProviderJsonConfig(
      JSON.stringify({
        key: "x",
        name: "X",
        protocol: "openai",
        baseUrl: "ftp://x.com",
        defaultModel: "m",
      }),
    );
    expect(r.ok).toBe(false);
  });

  it("defaultModel 空返回 error", () => {
    const r = parseProviderJsonConfig(
      JSON.stringify({
        key: "x",
        name: "X",
        protocol: "openai",
        baseUrl: "https://x.com/v1",
        defaultModel: "",
      }),
    );
    expect(r.ok).toBe(false);
  });

  it("options.timeoutMs 负数返回 error", () => {
    const r = parseProviderJsonConfig(
      JSON.stringify({
        key: "x",
        name: "X",
        protocol: "openai",
        baseUrl: "https://x.com/v1",
        defaultModel: "m",
        options: { timeoutMs: -1 },
      }),
    );
    expect(r.ok).toBe(false);
  });

  it("models.<slug>.name 空返回 error", () => {
    const r = parseProviderJsonConfig(
      JSON.stringify({
        key: "x",
        name: "X",
        protocol: "openai",
        baseUrl: "https://x.com/v1",
        defaultModel: "m",
        models: { foo: { name: "" } },
      }),
    );
    expect(r.ok).toBe(false);
  });

  it("enabled=false 透传", () => {
    const r = parseProviderJsonConfig(
      JSON.stringify({
        key: "x",
        name: "X",
        protocol: "openai",
        baseUrl: "https://x.com/v1",
        defaultModel: "m",
        enabled: false,
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.enabled).toBe(false);
  });
});

describe("providerJsonConfig - jsonConfigToStoreConfig", () => {
  it("转换字段完整、providerKey 等于 key", () => {
    const cfg: ProviderJsonConfig = {
      key: "my-302ai",
      name: "302.AI",
      protocol: "openai",
      baseUrl: "https://api.302.ai/v1",
      apiKey: "{env:AI_302_KEY}",
      defaultModel: "gpt-4o",
      enabled: true,
      options: { timeoutMs: 30000 },
      models: { "gpt-4o": { name: "GPT-4o" } },
    };
    const out = jsonConfigToStoreConfig(cfg, 1000);
    expect(out.name).toBe("302.AI");
    expect(out.providerKey).toBe("my-302ai");
    expect(out.apiKey).toBe("{env:AI_302_KEY}");
    expect(out.apiKeyRef).toBe("{env:AI_302_KEY}");
    expect(out.options?.timeoutMs).toBe(30000);
    expect(out.models?.["gpt-4o"]?.name).toBe("GPT-4o");
    expect(out.createdAt).toBe(1000);
    expect(out.updatedAt).toBe(1000);
  });

  it("apiKey 缺省时记空字符串", () => {
    const cfg: ProviderJsonConfig = {
      key: "x",
      name: "X",
      protocol: "openai",
      baseUrl: "https://x.com/v1",
      defaultModel: "m",
    };
    const out = jsonConfigToStoreConfig(cfg);
    expect(out.apiKey).toBe("");
    expect(out.apiKeyRef).toBeUndefined();
  });
});

describe("providerJsonConfig - storeConfigToJsonConfig", () => {
  it("双向转换幂等(providerKey 路径) - 字段相等(undefined 视为相等)", () => {
    const original: ProviderJsonConfig = {
      key: "my-302ai",
      name: "302.AI",
      protocol: "openai",
      baseUrl: "https://api.302.ai/v1",
      apiKey: "{env:X}",
      defaultModel: "m",
    };
    const round = storeConfigToJsonConfig(jsonConfigToStoreConfig(original, 0) as never);
    // 字段级比较(忽略 undefined, 因为 JSON.parse/stringify 会丢 undefined)
    for (const k of Object.keys(original) as (keyof ProviderJsonConfig)[]) {
      expect(round[k]).toEqual(original[k]);
    }
  });
});

describe("providerJsonConfig - resolveRuntimeProvider", () => {
  function makeResolved(overrides: Partial<ResolvedCustomProvider> = {}): ResolvedCustomProvider {
    return {
      id: "x",
      name: "X",
      protocol: "openai",
      baseUrl: "https://x.com/v1",
      hasApiKey: true,
      defaultModel: "m",
      enabled: true,
      createdAt: 0,
      updatedAt: 0,
      apiKey: "sk-{env:KEY}",
      ...overrides,
    };
  }

  it("展开 apiKey 中的 {env:VAR}", () => {
    const out = resolveRuntimeProvider(makeResolved(), { KEY: "real" });
    expect(out.apiKey).toBe("sk-real");
  });

  it("展开 extraHeaders 中的 {env:VAR}", () => {
    const cfg = makeResolved({ extraHeaders: { "X-Token": "{env:TOK}" } });
    const out = resolveRuntimeProvider(cfg, { TOK: "abc" });
    expect(out.extraHeaders?.["X-Token"]).toBe("abc");
  });

  it("展开 options.extraHeaders 中的 {env:VAR}", () => {
    const cfg = makeResolved({
      options: { extraHeaders: { "X-Region": "{env:REGION:-us}" } },
    });
    const out = resolveRuntimeProvider(cfg, { REGION: "cn" });
    expect(out.options?.extraHeaders?.["X-Region"]).toBe("cn");
  });

  it("options 缺省时保持 undefined", () => {
    const cfg = makeResolved();
    const out = resolveRuntimeProvider(cfg);
    expect(out.options).toBeUndefined();
  });
});
