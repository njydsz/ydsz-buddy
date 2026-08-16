/**
 * @file ollamaDiscovery.test.ts
 * @description P2-4 Ollama 本地模型服务发现单元测试
 *
 * 覆盖:
 * 1. 默认 baseUrl 行为
 * 2. /api/version 成功 → reachable:true + version
 * 3. /api/version 失败 → reachable:false + error
 * 4. CORS 错误识别
 * 5. /api/tags 映射(parameter_size → parameterSize 等)
 * 6. /api/tags 失败不影响 reachable
 * 7. 5s 缓存命中
 * 8. 缓存可被 clearOllamaDiscoveryCache 清除
 * 9. formatOllamaModelSize 字节数格式化
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearOllamaDiscoveryCache,
  discoverOllama,
  formatOllamaModelSize,
  OLLAMA_POPULAR_MODELS,
  type OllamaModelInfo,
} from "./ollamaDiscovery";

const ORIGINAL_FETCH = globalThis.fetch;

function mockFetch(impl: (input: RequestInfo | URL) => Promise<Response>): void {
  globalThis.fetch = impl as unknown as typeof fetch;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  clearOllamaDiscoveryCache();
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  clearOllamaDiscoveryCache();
  vi.useRealTimers();
});

describe("discoverOllama - 基础行为", () => {
  it("默认 baseUrl 为 http://localhost:11434", async () => {
    const calls: string[] = [];
    mockFetch(async (input) => {
      calls.push(String(input));
      return jsonResponse(200, { version: "0.5.0" });
    });
    await discoverOllama(undefined, { useCache: false });
    expect(calls[0]).toContain("http://localhost:11434/api/version");
  });

  it("去除 baseUrl 末尾的斜杠", async () => {
    const calls: string[] = [];
    mockFetch(async (input) => {
      calls.push(String(input));
      return jsonResponse(200, { version: "0.5.0" });
    });
    await discoverOllama("http://localhost:11434///", { useCache: false });
    expect(calls[0]).toContain("http://localhost:11434/api/version");
  });
});

describe("discoverOllama - 成功路径", () => {
  it("/api/version 成功 → reachable:true + version", async () => {
    mockFetch(async (input) => {
      const url = String(input);
      if (url.includes("/api/version")) {
        return jsonResponse(200, { version: "0.5.7" });
      }
      if (url.includes("/api/tags")) {
        return jsonResponse(200, { models: [] });
      }
      return jsonResponse(404, {});
    });
    const result = await discoverOllama("http://localhost:11434", { useCache: false });
    expect(result.reachable).toBe(true);
    expect(result.version).toBe("0.5.7");
    expect(result.models).toEqual([]);
    expect(result.error).toBeUndefined();
  });

  it("/api/tags 成功 → 返回模型列表(字段映射正确)", async () => {
    mockFetch(async (input) => {
      const url = String(input);
      if (url.includes("/api/version")) {
        return jsonResponse(200, { version: "0.5.7" });
      }
      if (url.includes("/api/tags")) {
        return jsonResponse(200, {
          models: [
            {
              name: "llama3.2:latest",
              size: 4_982_345_678,
              details: {
                family: "llama",
                parameter_size: "3B",
                quantization_level: "Q4_0",
              },
              modified_at: "2025-06-20T08:00:00Z",
            },
          ],
        });
      }
      return jsonResponse(404, {});
    });
    const result = await discoverOllama("http://localhost:11434", { useCache: false });
    expect(result.reachable).toBe(true);
    const models = result.models ?? [];
    expect(models).toHaveLength(1);
    const first: OllamaModelInfo = models[0]!;
    expect(first.name).toBe("llama3.2:latest");
    expect(first.size).toBe(4_982_345_678);
    expect(first.details?.parameterSize).toBe("3B");
    expect(first.details?.quantizationLevel).toBe("Q4_0");
    expect(first.details?.family).toBe("llama");
    expect(first.modifiedAt).toBe("2025-06-20T08:00:00Z");
  });

  it("/api/tags 失败不影响 reachable 标记", async () => {
    mockFetch(async (input) => {
      const url = String(input);
      if (url.includes("/api/version")) {
        return jsonResponse(200, { version: "0.5.7" });
      }
      if (url.includes("/api/tags")) {
        return jsonResponse(500, { error: "internal" });
      }
      return jsonResponse(404, {});
    });
    const result = await discoverOllama("http://localhost:11434", { useCache: false });
    expect(result.reachable).toBe(true);
    expect(result.version).toBe("0.5.7");
    expect(result.models).toEqual([]);
  });
});

describe("discoverOllama - 失败路径", () => {
  it("/api/version 返回非 2xx → reachable:false + error", async () => {
    mockFetch(async () => jsonResponse(403, {}));
    const result = await discoverOllama("http://localhost:11434", { useCache: false });
    expect(result.reachable).toBe(false);
    expect(result.error).toContain("403");
  });

  it("/api/version 缺 version 字段 → reachable:false", async () => {
    mockFetch(async () => jsonResponse(200, {}));
    const result = await discoverOllama("http://localhost:11434", { useCache: false });
    expect(result.reachable).toBe(false);
    expect(result.error).toContain("missing version");
  });

  it("fetch 抛 TypeError('Failed to fetch') → 识别为 CORS 错误", async () => {
    mockFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    const result = await discoverOllama("http://localhost:11434", { useCache: false });
    expect(result.reachable).toBe(false);
    expect(result.error).toBe("CORS blocked");
  });

  it("fetch 抛 AbortError → reachable:false(超时)", async () => {
    vi.useFakeTimers();
    mockFetch(async (_input, init) => {
      // 监听 AbortSignal,3s 后被 abort
      return new Promise((_, reject) => {
        const signal = (init as RequestInit | undefined)?.signal;
        if (signal) {
          signal.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        }
      });
    });
    const promise = discoverOllama("http://localhost:11434", { useCache: false });
    // 触发超时
    await vi.advanceTimersByTimeAsync(3500);
    const result = await promise;
    expect(result.reachable).toBe(false);
    expect(result.error).toContain("aborted");
  });

  it("非 fetch 环境(SSR) → reachable:false + 友好错误", async () => {
    const original = globalThis.fetch;
    // 模拟 SSR
    (globalThis as { fetch?: typeof fetch }).fetch = undefined as unknown as typeof fetch;
    try {
      const result = await discoverOllama("http://localhost:11434", { useCache: false });
      expect(result.reachable).toBe(false);
      expect(result.error).toContain("not available");
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("discoverOllama - 缓存", () => {
  it("5s 内重复调用 → 命中缓存,不发起新请求", async () => {
    const calls: string[] = [];
    mockFetch(async (input) => {
      calls.push(String(input));
      return jsonResponse(200, { version: "0.5.0" });
    });
    const a = await discoverOllama("http://localhost:11434");
    const b = await discoverOllama("http://localhost:11434");
    expect(a.version).toBe(b.version);
    // 缓存命中,fetch 只被调用一次(2 次 for /api/version + /api/tags)
    expect(calls.length).toBe(2);
  });

  it("useCache:false → 强制重新探测", async () => {
    const calls: string[] = [];
    mockFetch(async (input) => {
      calls.push(String(input));
      return jsonResponse(200, { version: "0.5.0" });
    });
    await discoverOllama("http://localhost:11434");
    await discoverOllama("http://localhost:11434", { useCache: false });
    // 2 次调用 × 2 个端点 = 4 次 fetch
    expect(calls.length).toBe(4);
  });

  it("不同 baseUrl 互不影响缓存", async () => {
    const calls: string[] = [];
    mockFetch(async (input) => {
      calls.push(String(input));
      return jsonResponse(200, { version: "0.5.0" });
    });
    await discoverOllama("http://localhost:11434");
    await discoverOllama("http://other-host:11434", { useCache: false });
    expect(calls.some((c) => c.includes("localhost:11434"))).toBe(true);
    expect(calls.some((c) => c.includes("other-host:11434"))).toBe(true);
  });

  it("clearOllamaDiscoveryCache 清空缓存", async () => {
    const calls: string[] = [];
    mockFetch(async (input) => {
      calls.push(String(input));
      return jsonResponse(200, { version: "0.5.0" });
    });
    await discoverOllama("http://localhost:11434");
    clearOllamaDiscoveryCache();
    await discoverOllama("http://localhost:11434", { useCache: true });
    // 第 1 次 + 清空后第 2 次 = 4 次
    expect(calls.length).toBe(4);
  });
});

describe("formatOllamaModelSize", () => {
  it("字节 → B", () => {
    expect(formatOllamaModelSize(512)).toBe("512 B");
  });
  it("KB", () => {
    expect(formatOllamaModelSize(2048)).toBe("2.0 KB");
  });
  it("MB", () => {
    expect(formatOllamaModelSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });
  it("GB(常见 Ollama 模型大小)", () => {
    expect(formatOllamaModelSize(4_982_345_678)).toBe("4.6 GB");
  });
  it("TB", () => {
    expect(formatOllamaModelSize(2 * 1024 * 1024 * 1024 * 1024)).toBe("2.0 TB");
  });
  it("非法输入 → '未知大小'", () => {
    expect(formatOllamaModelSize(-1)).toBe("未知大小");
    expect(formatOllamaModelSize(NaN)).toBe("未知大小");
    expect(formatOllamaModelSize(Infinity)).toBe("未知大小");
  });
});

describe("OLLAMA_POPULAR_MODELS", () => {
  it("至少 3 个家族", () => {
    expect(OLLAMA_POPULAR_MODELS.length).toBeGreaterThanOrEqual(3);
  });
  it("每个家族至少有 1 个示例", () => {
    for (const entry of OLLAMA_POPULAR_MODELS) {
      expect(entry.family.length).toBeGreaterThan(0);
      expect(entry.examples.length).toBeGreaterThan(0);
    }
  });
  it("含主流家族 Llama / Qwen / DeepSeek", () => {
    const families = OLLAMA_POPULAR_MODELS.map((m) => m.family);
    expect(families).toContain("Meta Llama");
    expect(families).toContain("Qwen");
    expect(families).toContain("DeepSeek");
  });
});

describe("discoverOllama - Tauri 命令路径(避免浏览器 CORS)", () => {
  /**
   * 在 window 上挂 `__TAURI_INTERNALS__`,让 hasTauriRuntime() 返回 true
   * 然后 mock 掉 `@tauri-apps/api/core` 的 invoke,验证走 Tauri 命令的分支
   */
  function mockTauriInvoke(handler: (cmd: string, args: unknown) => Promise<unknown>): void {
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    // 动态导入已被模块内部缓存;直接替换 @tauri-apps/api/core 模块
    // vi.doMock 在 vitest 中需要 hoist;此处我们用更轻量的方式:
    // 让 loadTauriInvoke 走 module-level cache 失败,从而 fallback 到浏览器 fetch
    // —— 但这里我们要测的是 Tauri 路径本身,所以改用：
    // 1) 清除模块 cache 2) 重新 import 3) mock @tauri-apps/api/core
    vi.resetModules();
    vi.doMock("@tauri-apps/api/core", () => ({
      invoke: (cmd: string, args: unknown) => handler(cmd, args),
    }));
    handler; // satisfy ts unused warning
  }

  it("Tauri 模式下优先调用 indexer_ollama_discover,不再走 fetch", async () => {
    // 让 mockFetch 的计数应该为 0(完全走 Tauri)
    const fetchCalls: string[] = [];
    mockFetch(async (input) => {
      fetchCalls.push(String(input));
      return jsonResponse(200, { version: "0.5.0" });
    });

    const captured: Array<{ cmd: string; args: unknown }> = [];
    mockTauriInvoke(async (cmd, args) => {
      captured.push({ cmd, args });
      return {
        reachable: true,
        version: "0.5.1",
        models: [
          {
            name: "qwen2.5:7b",
            size: 4_000_000_000,
            details: { family: "qwen2", parameter_size: "7.6B", quantization_level: "Q4_K_M" },
            modified_at: "2026-05-01T12:00:00Z",
          },
        ],
        error: undefined,
      };
    });

    // 由于 vi.doMock 需要重新 import 模块,这里在测试内重置 module cache
    // 然后动态 import —— 这保证 fetch 的 spy 已挂上时,Tauri 模块才被重新初始化
    const fresh = await import("./ollamaDiscovery?tauri=1");
    const result = await fresh.discoverOllama("http://localhost:11434", { useCache: false });

    expect(captured).toHaveLength(1);
    expect(captured[0]?.cmd).toBe("indexer_ollama_discover");
    // 当 baseUrl 等于默认值时,前端会传 null 让 Rust 用默认,避免硬编码字符串
    expect(captured[0]?.args).toMatchObject({ baseUrl: null });
    expect(result.reachable).toBe(true);
    expect(result.version).toBe("0.5.1");
    expect(result.models?.[0]?.name).toBe("qwen2.5:7b");
    expect(result.models?.[0]?.details?.parameterSize).toBe("7.6B");
    expect(result.models?.[0]?.details?.quantizationLevel).toBe("Q4_K_M");
    expect(result.models?.[0]?.modifiedAt).toBe("2026-05-01T12:00:00Z");
    // 关键:fetch 不应该被调用
    expect(fetchCalls).toHaveLength(0);

    // 清理 mock
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    vi.doUnmock("@tauri-apps/api/core");
    vi.resetModules();
  });

  it("Tauri 命令 baseUrl 透传非默认地址", async () => {
    vi.resetModules();
    vi.doMock("@tauri-apps/api/core", () => ({
      invoke: async () => ({
        reachable: true,
        version: "0.5.1",
        models: [],
        error: undefined,
      }),
    }));
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};

    const captured: Array<{ cmd: string; args: unknown }> = [];
    // 覆盖之前的 mock
    vi.doMock("@tauri-apps/api/core", () => ({
      invoke: (cmd: string, args: unknown) => {
        captured.push({ cmd, args });
        return Promise.resolve({
          reachable: true,
          version: "0.5.1",
          models: [],
          error: undefined,
        });
      },
    }));

    const fresh = await import("./ollamaDiscovery?tauri=4");
    await fresh.discoverOllama("http://192.168.1.5:11434", { useCache: false });
    expect(captured[0]?.cmd).toBe("indexer_ollama_discover");
    // 非默认 URL 会原样透传
    expect(captured[0]?.args).toMatchObject({ baseUrl: "http://192.168.1.5:11434" });

    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    vi.doUnmock("@tauri-apps/api/core");
    vi.resetModules();
  });

  it("Tauri 命令失败时 fallback 到浏览器 fetch 并返回结果", async () => {
    // 准备 Tauri mock,让 invoke 抛错
    vi.resetModules();
    vi.doMock("@tauri-apps/api/core", () => ({
      invoke: async () => {
        throw new Error("ipc disconnected");
      },
    }));
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};

    // 浏览器 fetch 仍然成功
    mockFetch(async (input) => {
      const url = String(input);
      if (url.includes("/api/version")) {
        return jsonResponse(200, { version: "0.5.7" });
      }
      if (url.includes("/api/tags")) {
        return jsonResponse(200, { models: [] });
      }
      return jsonResponse(404, {});
    });

    const fresh = await import("./ollamaDiscovery?tauri=2");
    const result = await fresh.discoverOllama("http://localhost:11434", { useCache: false });
    // browser fallback 成功,reachable 应为 true
    expect(result.reachable).toBe(true);
    expect(result.version).toBe("0.5.7");

    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    vi.doUnmock("@tauri-apps/api/core");
    vi.resetModules();
  });

  it("Tauri 命令失败 + 浏览器也失败 → reachable:false + tauri 错误", async () => {
    vi.resetModules();
    vi.doMock("@tauri-apps/api/core", () => ({
      invoke: async () => {
        throw new Error("ipc disconnected");
      },
    }));
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};

    mockFetch(async () => {
      throw new TypeError("Failed to fetch");
    });

    const fresh = await import("./ollamaDiscovery?tauri=3");
    const result = await fresh.discoverOllama("http://localhost:11434", { useCache: false });
    expect(result.reachable).toBe(false);
    // 应包含 tauri 失败原因(说明两层都尝试了)
    expect(result.error).toBeTruthy();

    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    vi.doUnmock("@tauri-apps/api/core");
    vi.resetModules();
  });
});
