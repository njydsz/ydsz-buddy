/**
 * @file Custom Provider Store 单元测试
 * @description 验证 C-2 任务:自定义 Provider BYOK 状态管理
 *   - addProvider: 唯一 ID + 时间戳 + API Key 进 vault
 *   - updateProvider: 合并字段 + 更新 updatedAt
 *   - removeProvider: 按 ID 删除 + vault 清理
 *   - toggleProvider: 切换 enabled
 *   - getProvider: 按 ID 查找
 *   - getEnabledProviders: 仅返回启用的
 *   - setApiKey / clearApiKey: vault 同步
 *   - getResolvedProvider: 合并 vault 中的 apiKey
 *   - 协议支持: openai / anthropic / litellm / ollama
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  useCustomProviderStore,
  type NewCustomProviderInput,
} from "./customProviderStore";
import { getCredential, removeCredential, listCredentialRefs } from "./credentialVault";

function makeInput(overrides: Partial<NewCustomProviderInput> = {}): NewCustomProviderInput {
  return {
    name: "Test Provider",
    protocol: "openai",
    baseUrl: "https://api.example.com/v1",
    apiKey: "sk-test-123",
    defaultModel: "gpt-4o-mini",
    enabled: true,
    ...overrides,
  };
}

beforeEach(() => {
  // 重置 store:清除 localStorage / sessionStorage 并重置内存状态
  localStorage.clear();
  sessionStorage.clear();
  for (const ref of listCredentialRefs()) {
    removeCredential(ref);
  }
  useCustomProviderStore.setState({ providers: [] });
  // 简单 mock crypto.randomUUID
  if (!globalThis.crypto) {
    (globalThis as { crypto?: Crypto }).crypto = {} as Crypto;
  }
  if (!globalThis.crypto.randomUUID) {
    (globalThis.crypto as { randomUUID?: () => string }).randomUUID = vi
      .fn()
      .mockReturnValue("uuid-12345-abcde");
  }
});

describe("C-2 CustomProviderStore - addProvider", () => {
  it("添加 Provider 返回唯一 ID", () => {
    const id = useCustomProviderStore.getState().addProvider(makeInput());
    expect(id).toMatch(/^custom-/);
  });

  it("添加的 Provider 出现在 providers 列表", () => {
    const id = useCustomProviderStore.getState().addProvider(makeInput({ name: "My LLM" }));
    const providers = useCustomProviderStore.getState().providers;
    expect(providers.length).toBe(1);
    expect(providers[0]?.id).toBe(id);
    expect(providers[0]?.name).toBe("My LLM");
  });

  it("添加时自动写入 createdAt / updatedAt", () => {
    const before = Date.now();
    useCustomProviderStore.getState().addProvider(makeInput());
    const after = Date.now();
    const provider = useCustomProviderStore.getState().providers[0];
    expect(provider?.createdAt).toBeGreaterThanOrEqual(before);
    expect(provider?.createdAt).toBeLessThanOrEqual(after);
    expect(provider?.updatedAt).toBe(provider?.createdAt);
  });

  it("可添加多个 Provider,各持独立 ID", () => {
    const id1 = useCustomProviderStore.getState().addProvider(makeInput({ name: "P1" }));
    const id2 = useCustomProviderStore.getState().addProvider(makeInput({ name: "P2" }));
    expect(id1).not.toBe(id2);
    expect(useCustomProviderStore.getState().providers.length).toBe(2);
  });

  it("API Key 进 vault,持久化形态只有 hasApiKey:true", () => {
    const id = useCustomProviderStore
      .getState()
      .addProvider(makeInput({ apiKey: "sk-very-secret-abc" }));
    const provider = useCustomProviderStore.getState().getProvider(id);
    expect(provider?.hasApiKey).toBe(true);
    // localStorage 不应包含明文 key
    const stored = JSON.stringify(localStorage);
    expect(stored).not.toContain("sk-very-secret-abc");
    // vault 里有
    expect(getCredential(`custom-${id}`)).toBe("sk-very-secret-abc");
  });
});

describe("C-2 CustomProviderStore - updateProvider", () => {
  it("按 ID 更新指定字段", () => {
    const id = useCustomProviderStore.getState().addProvider(makeInput({ name: "Old" }));
    useCustomProviderStore.getState().updateProvider(id, { name: "New" });
    const provider = useCustomProviderStore.getState().getProvider(id);
    expect(provider?.name).toBe("New");
  });

  it("更新后 updatedAt 被刷新", async () => {
    const id = useCustomProviderStore.getState().addProvider(makeInput());
    const originalUpdatedAt = useCustomProviderStore.getState().getProvider(id)?.updatedAt;
    // 等 5ms 确保时间戳差异
    await new Promise((resolve) => setTimeout(resolve, 5));
    useCustomProviderStore.getState().updateProvider(id, { baseUrl: "https://x.com/v1" });
    const newUpdatedAt = useCustomProviderStore.getState().getProvider(id)?.updatedAt;
    expect(newUpdatedAt).toBeGreaterThan(originalUpdatedAt ?? 0);
  });

  it("不修改不存在的 ID 不会抛错", () => {
    expect(() =>
      useCustomProviderStore.getState().updateProvider("nonexistent", { name: "X" }),
    ).not.toThrow();
  });
});

describe("C-2 CustomProviderStore - removeProvider", () => {
  it("按 ID 删除 Provider + 清理 vault", () => {
    const id = useCustomProviderStore.getState().addProvider(makeInput());
    expect(useCustomProviderStore.getState().providers.length).toBe(1);
    expect(getCredential(`custom-${id}`)).toBe("sk-test-123");
    useCustomProviderStore.getState().removeProvider(id);
    expect(useCustomProviderStore.getState().providers.length).toBe(0);
    expect(getCredential(`custom-${id}`)).toBeNull();
  });

  it("删除不存在的 ID 不抛错", () => {
    expect(() =>
      useCustomProviderStore.getState().removeProvider("nonexistent"),
    ).not.toThrow();
  });
});

describe("C-2 CustomProviderStore - toggleProvider", () => {
  it("切换 enabled 状态", () => {
    const id = useCustomProviderStore.getState().addProvider(makeInput({ enabled: true }));
    useCustomProviderStore.getState().toggleProvider(id);
    expect(useCustomProviderStore.getState().getProvider(id)?.enabled).toBe(false);
    useCustomProviderStore.getState().toggleProvider(id);
    expect(useCustomProviderStore.getState().getProvider(id)?.enabled).toBe(true);
  });
});

describe("C-2 CustomProviderStore - getProvider", () => {
  it("按 ID 返回 Provider", () => {
    const id = useCustomProviderStore.getState().addProvider(makeInput({ name: "Find Me" }));
    const provider = useCustomProviderStore.getState().getProvider(id);
    expect(provider?.name).toBe("Find Me");
  });

  it("不存在的 ID 返回 undefined", () => {
    expect(useCustomProviderStore.getState().getProvider("nonexistent")).toBeUndefined();
  });
});

describe("C-2 CustomProviderStore - getEnabledProviders", () => {
  it("只返回 enabled=true 的 Provider", () => {
    useCustomProviderStore.getState().addProvider(makeInput({ name: "A", enabled: true }));
    useCustomProviderStore.getState().addProvider(makeInput({ name: "B", enabled: false }));
    useCustomProviderStore.getState().addProvider(makeInput({ name: "C", enabled: true }));
    const enabled = useCustomProviderStore.getState().getEnabledProviders();
    expect(enabled.length).toBe(2);
    expect(enabled.map((p) => p.name).sort()).toEqual(["A", "C"]);
  });

  it("没有任何启用时返回空数组", () => {
    useCustomProviderStore.getState().addProvider(makeInput({ name: "A", enabled: false }));
    expect(useCustomProviderStore.getState().getEnabledProviders()).toEqual([]);
  });
});

describe("C-2 CustomProviderStore - 协议支持", () => {
  it("支持 openai 协议", () => {
    const id = useCustomProviderStore
      .getState()
      .addProvider(makeInput({ protocol: "openai", baseUrl: "https://api.openai.com/v1" }));
    expect(useCustomProviderStore.getState().getProvider(id)?.protocol).toBe("openai");
  });

  it("支持 anthropic 协议", () => {
    const id = useCustomProviderStore
      .getState()
      .addProvider(
        makeInput({ protocol: "anthropic", baseUrl: "https://api.anthropic.com" }),
      );
    expect(useCustomProviderStore.getState().getProvider(id)?.protocol).toBe("anthropic");
  });

  it("支持 litellm 协议", () => {
    const id = useCustomProviderStore
      .getState()
      .addProvider(
        makeInput({ protocol: "litellm", baseUrl: "http://localhost:4000", apiKey: "" }),
      );
    expect(useCustomProviderStore.getState().getProvider(id)?.protocol).toBe("litellm");
  });

  it("支持 ollama 协议 (P1-3 本地模型,无需 apiKey)", () => {
    const id = useCustomProviderStore
      .getState()
      .addProvider(
        makeInput({
          protocol: "ollama",
          baseUrl: "http://localhost:11434",
          apiKey: "",
          defaultModel: "llama3.2",
        }),
      );
    const provider = useCustomProviderStore.getState().getProvider(id);
    expect(provider?.protocol).toBe("ollama");
    expect(provider?.baseUrl).toBe("http://localhost:11434");
    expect(provider?.defaultModel).toBe("llama3.2");
    expect(provider?.hasApiKey).toBe(false);
  });
});

describe("C-2 CustomProviderStore - 凭证 vault 集成", () => {
  it("setApiKey 写入 vault + 更新 hasApiKey", () => {
    const id = useCustomProviderStore.getState().addProvider(makeInput({ apiKey: "old-key" }));
    useCustomProviderStore.getState().setApiKey(id, "new-key");
    expect(getCredential(`custom-${id}`)).toBe("new-key");
    expect(useCustomProviderStore.getState().getProvider(id)?.hasApiKey).toBe(true);
  });

  it("setApiKey('') 等价于 clearApiKey", () => {
    const id = useCustomProviderStore.getState().addProvider(makeInput());
    useCustomProviderStore.getState().setApiKey(id, "");
    expect(getCredential(`custom-${id}`)).toBeNull();
    expect(useCustomProviderStore.getState().getProvider(id)?.hasApiKey).toBe(false);
  });

  it("clearApiKey 从 vault 移除", () => {
    const id = useCustomProviderStore.getState().addProvider(makeInput());
    expect(getCredential(`custom-${id}`)).toBe("sk-test-123");
    useCustomProviderStore.getState().clearApiKey(id);
    expect(getCredential(`custom-${id}`)).toBeNull();
    expect(useCustomProviderStore.getState().getProvider(id)?.hasApiKey).toBe(false);
  });

  it("getResolvedProvider 合并 vault apiKey", () => {
    const id = useCustomProviderStore.getState().addProvider(makeInput({ apiKey: "live-key" }));
    const resolved = useCustomProviderStore.getState().getResolvedProvider(id);
    expect(resolved).toBeDefined();
    expect(resolved?.apiKey).toBe("live-key");
  });

  it("getResolvedProvider 在 vault 缺失时返回 undefined", () => {
    const id = useCustomProviderStore.getState().addProvider(makeInput());
    // 模拟 vault 丢失
    removeCredential(`custom-${id}`);
    const resolved = useCustomProviderStore.getState().getResolvedProvider(id);
    expect(resolved).toBeUndefined();
  });
});
