/**
 * @file Custom Provider Protocols 单元测试
 * @description 验证 C-2 任务:3 协议转换 + 校验 + 脱敏
 */

import { describe, it, expect } from "vitest";
import {
  ALL_PROTOCOLS,
  PROTOCOL_META,
  buildChatRequest,
  maskApiKey,
  validateBaseUrl,
  validateModel,
  validateProviderConfig,
  type ChatRequestPayload,
} from "./customProviderProtocols";
import type {
  CustomProviderConfig,
  ResolvedCustomProvider,
} from "./customProviderStore";

/** 生成 ResolvedCustomProvider（带 apiKey） */
function makeResolved(
  overrides: Partial<ResolvedCustomProvider> = {},
): ResolvedCustomProvider {
  return {
    id: "custom-test",
    name: "Test",
    protocol: "openai",
    baseUrl: "https://api.example.com/v1",
    hasApiKey: true,
    defaultModel: "gpt-4o-mini",
    enabled: true,
    createdAt: 0,
    updatedAt: 0,
    apiKey: "sk-test-key",
    ...overrides,
  };
}

/** 生成 CustomProviderConfig（持久化形态,无 apiKey） */
function makeConfig(
  overrides: Partial<CustomProviderConfig> = {},
): CustomProviderConfig {
  return {
    id: "custom-test",
    name: "Test",
    protocol: "openai",
    baseUrl: "https://api.example.com/v1",
    hasApiKey: true,
    defaultModel: "gpt-4o-mini",
    enabled: true,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

const samplePayload: ChatRequestPayload = {
  model: "gpt-4o-mini",
  messages: [
    { role: "system", content: "你是一个助手" },
    { role: "user", content: "你好" },
  ],
  temperature: 0.7,
  maxTokens: 1024,
  stream: false,
};

describe("C-2 customProviderProtocols - 4 协议元信息", () => {
  it("包含 openai / anthropic / litellm / ollama", () => {
    expect(ALL_PROTOCOLS).toEqual(["openai", "anthropic", "litellm", "ollama"]);
    expect(PROTOCOL_META.openai.id).toBe("openai");
    expect(PROTOCOL_META.anthropic.id).toBe("anthropic");
    expect(PROTOCOL_META.litellm.id).toBe("litellm");
    expect(PROTOCOL_META.ollama.id).toBe("ollama");
  });

  it("每个协议都有 label / defaultBaseUrl / defaultModel", () => {
    for (const proto of ALL_PROTOCOLS) {
      const meta = PROTOCOL_META[proto];
      expect(meta.label).toBeTruthy();
      expect(meta.description).toBeTruthy();
      expect(meta.defaultBaseUrl).toMatch(/^https?:\/\//);
      expect(meta.defaultModel).toBeTruthy();
    }
  });

  it("ollama 默认 baseUrl 指向本地 11434 端口", () => {
    expect(PROTOCOL_META.ollama.defaultBaseUrl).toBe("http://localhost:11434");
  });

  it("litellm / ollama 协议不需要 API Key", () => {
    expect(PROTOCOL_META.litellm.requiresApiKey).toBe(false);
    expect(PROTOCOL_META.ollama.requiresApiKey).toBe(false);
    expect(PROTOCOL_META.openai.requiresApiKey).toBe(true);
    expect(PROTOCOL_META.anthropic.requiresApiKey).toBe(true);
  });
});

describe("C-2 buildChatRequest - OpenAI 协议", () => {
  it("正确拼接 URL + Bearer auth + OpenAI body", () => {
    const req = buildChatRequest("openai", makeResolved(), samplePayload);
    expect(req.url).toBe("https://api.example.com/v1/chat/completions");
    expect(req.method).toBe("POST");
    expect(req.headers.Authorization).toBe("Bearer sk-test-key");
    const body = JSON.parse(req.body);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.messages).toEqual(samplePayload.messages);
    expect(body.stream).toBe(false);
  });

  it("无 apiKey 时不写 Authorization header", () => {
    const req = buildChatRequest("openai", makeResolved({ apiKey: "" }), samplePayload);
    expect(req.headers.Authorization).toBeUndefined();
  });

  it("自动去掉 baseUrl 末尾斜杠", () => {
    const req = buildChatRequest(
      "openai",
      makeResolved({ baseUrl: "https://api.example.com/v1/" }),
      samplePayload,
    );
    expect(req.url).toBe("https://api.example.com/v1/chat/completions");
  });
});

describe("C-2 buildChatRequest - Anthropic 协议", () => {
  it("使用 x-api-key + anthropic-version header", () => {
    const req = buildChatRequest(
      "anthropic",
      makeResolved({ protocol: "anthropic", baseUrl: "https://api.anthropic.com" }),
      samplePayload,
    );
    expect(req.url).toBe("https://api.anthropic.com/v1/messages");
    expect(req.headers["x-api-key"]).toBe("sk-test-key");
    expect(req.headers["anthropic-version"]).toBe("2023-06-01");
  });

  it("system 消息被提取到顶层 system 字段", () => {
    const req = buildChatRequest(
      "anthropic",
      makeResolved({ protocol: "anthropic", baseUrl: "https://api.anthropic.com" }),
      samplePayload,
    );
    const body = JSON.parse(req.body);
    expect(body.system).toBe("你是一个助手");
    expect(body.messages.every((m: { role: string }) => m.role !== "system")).toBe(true);
  });

  it("没有 system 消息时不写 system 字段", () => {
    const req = buildChatRequest(
      "anthropic",
      makeResolved({ protocol: "anthropic", baseUrl: "https://api.anthropic.com" }),
      {
        model: "claude-3-5-sonnet",
        messages: [{ role: "user", content: "hi" }],
      },
    );
    const body = JSON.parse(req.body);
    expect(body.system).toBeUndefined();
  });

  it("默认 max_tokens = 4096", () => {
    const req = buildChatRequest(
      "anthropic",
      makeResolved({ protocol: "anthropic", baseUrl: "https://api.anthropic.com" }),
      { model: "claude", messages: [] },
    );
    const body = JSON.parse(req.body);
    expect(body.max_tokens).toBe(4096);
  });
});

describe("C-2 buildChatRequest - LiteLLM 协议", () => {
  it("使用 /v1/chat/completions 端点 + 可选 Bearer auth", () => {
    const req = buildChatRequest(
      "litellm",
      makeResolved({ protocol: "litellm", baseUrl: "http://localhost:4000" }),
      samplePayload,
    );
    expect(req.url).toBe("http://localhost:4000/v1/chat/completions");
    expect(req.headers.Authorization).toBe("Bearer sk-test-key");
  });

  it("无 apiKey 时也能构造请求（LiteLLM 可无需 key）", () => {
    const req = buildChatRequest(
      "litellm",
      makeResolved({ protocol: "litellm", baseUrl: "http://localhost:4000", apiKey: "" }),
      samplePayload,
    );
    expect(req.headers.Authorization).toBeUndefined();
    expect(req.url).toBeTruthy();
  });

  it("使用 OpenAI 格式 body（LiteLLM 完全兼容）", () => {
    const req = buildChatRequest(
      "litellm",
      makeResolved({ protocol: "litellm", baseUrl: "http://x" }),
      samplePayload,
    );
    const body = JSON.parse(req.body);
    expect(body.model).toBe("gpt-4o-mini");
    expect(Array.isArray(body.messages)).toBe(true);
  });
});

describe("C-2 buildChatRequest - Ollama 协议 (P1-3)", () => {
  it("使用本地 /v1/chat/completions 端点,无 Authorization", () => {
    const req = buildChatRequest(
      "ollama",
      makeResolved({
        protocol: "ollama",
        baseUrl: "http://localhost:11434",
        apiKey: "", // 本地 Ollama 不需要 key
      }),
      samplePayload,
    );
    expect(req.url).toBe("http://localhost:11434/v1/chat/completions");
    // 本地免鉴权:不带 Authorization header
    expect(req.headers.Authorization).toBeUndefined();
    expect(req.headers["Content-Type"]).toBe("application/json");
  });

  it("若用户填了 apiKey (e.g. OLLAMA_API_KEY),会带上 Bearer", () => {
    const reqWithKey = buildChatRequest(
      "ollama",
      makeResolved({
        protocol: "ollama",
        baseUrl: "http://localhost:11434",
        apiKey: "ollama-local-token",
      }),
      samplePayload,
    );
    expect(reqWithKey.headers.Authorization).toBe("Bearer ollama-local-token");
  });

  it("使用 OpenAI 格式 body (Ollama 兼容层)", () => {
    const req = buildChatRequest(
      "ollama",
      makeResolved({
        protocol: "ollama",
        baseUrl: "http://localhost:11434",
        apiKey: "",
      }),
      samplePayload,
    );
    const body = JSON.parse(req.body);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.messages).toEqual(samplePayload.messages);
    expect(body.stream).toBe(false);
  });

  it("自动去掉 baseUrl 末尾斜杠", () => {
    const req = buildChatRequest(
      "ollama",
      makeResolved({
        protocol: "ollama",
        baseUrl: "http://localhost:11434/",
        apiKey: "",
      }),
      samplePayload,
    );
    expect(req.url).toBe("http://localhost:11434/v1/chat/completions");
  });

  it("支持自定义远端地址 (LM Studio / vLLM 等同样适用)", () => {
    const req = buildChatRequest(
      "ollama",
      makeResolved({
        protocol: "ollama",
        baseUrl: "http://192.168.1.5:1234",
        apiKey: "",
      }),
      samplePayload,
    );
    expect(req.url).toBe("http://192.168.1.5:1234/v1/chat/completions");
  });
});

describe("C-2 校验函数", () => {
  it("validateBaseUrl 必须以 http(s) 开头", () => {
    expect(validateBaseUrl("")).toMatch(/不能为空/);
    expect(validateBaseUrl("ftp://x")).toMatch(/http/);
    expect(validateBaseUrl("https://api.openai.com/v1")).toBe("");
    expect(validateBaseUrl("http://localhost:4000")).toBe("");
  });

  it("validateModel 非空", () => {
    expect(validateModel("")).toMatch(/不能为空/);
    expect(validateModel("  ")).toMatch(/不能为空/);
    expect(validateModel("gpt-4")).toBe("");
  });

  it("validateProviderConfig 串联校验 - openai 协议", () => {
    expect(validateProviderConfig(makeConfig(), "k")).toBe("");

    const noName = makeConfig({ name: "" });
    expect(validateProviderConfig(noName, "k")).toMatch(/名称/);

    const noUrl = makeConfig({ baseUrl: "" });
    expect(validateProviderConfig(noUrl, "k")).toMatch(/Base URL/);

    const noModel = makeConfig({ defaultModel: "" });
    expect(validateProviderConfig(noModel, "k")).toMatch(/默认模型/);

    const noKey = makeConfig({ hasApiKey: false });
    expect(validateProviderConfig(noKey, "")).toMatch(/需要 API Key/);
  });

  it("validateProviderConfig - litellm 不要求 key", () => {
    expect(
      validateProviderConfig(
        makeConfig({ protocol: "litellm", hasApiKey: false }),
        "",
      ),
    ).toBe("");
  });

  it("validateProviderConfig - ollama 不要求 key (P1-3)", () => {
    expect(
      validateProviderConfig(
        makeConfig({ protocol: "ollama", baseUrl: "http://localhost:11434", hasApiKey: false }),
        "",
      ),
    ).toBe("");
  });

  it("validateProviderConfig - hasApiKey=true 时不要求重新填 key", () => {
    expect(validateProviderConfig(makeConfig(), "")).toBe("");
  });
});

describe("C-2 maskApiKey 脱敏", () => {
  it("空字符串返回空", () => {
    expect(maskApiKey("")).toBe("");
  });

  it("短 key 全遮蔽", () => {
    expect(maskApiKey("abcd")).toBe("••••");
  });

  it("长 key 保留首 4 + 末 4 + 中间遮蔽", () => {
    const masked = maskApiKey("sk-1234567890abcdef");
    expect(masked.startsWith("sk-1")).toBe(true);
    expect(masked.endsWith("cdef")).toBe(true);
    expect(masked).toContain("•");
    // 实际 key 不会出现在脱敏结果中
    expect(masked).not.toBe("sk-1234567890abcdef");
  });
});
