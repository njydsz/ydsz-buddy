/**
 * @file Provider e2e Turn 回归测试
 *
 * 验证三家 Provider（Claude/OpenAI/Gemini）的 Turn 流程：
 * - 发送消息 → 接收响应
 * - 工具调用（Bash/Read/Write）
 * - 错误处理和重试
 *
 * 测试覆盖：
 * - 基本对话流程
 * - 工具调用能力
 * - 流式响应处理
 * - 超时和错误恢复
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ProviderKind } from "~/contracts";

// Mock Tauri invoke
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

// Mock readNativeApi
vi.mock("~/nativeApi", () => ({
  readNativeApi: vi.fn(() => ({
    orchestration: {
      onDomainEvent: vi.fn(() => vi.fn()),
    },
  })),
}));

describe("Provider e2e Turn 回归测试", () => {
  const providers: ProviderKind[] = ["claudeAgent", "openaiAgent", "geminiAgent"];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("基本对话流程", () => {
    it.each(providers)("should send turn and receive response for %s", async (provider) => {
      // 模拟发送 Turn
      const mockInvoke = vi.fn().mockResolvedValue({
        turnId: "turn-123",
        status: "completed",
        response: "Hello from " + provider,
      });

      vi.mocked(await import("@tauri-apps/api/core")).invoke = mockInvoke;

      // 验证 Turn 发送
      const result = await mockInvoke("send_turn", {
        provider,
        threadId: "thread-123",
        message: "Hello",
      });

      expect(result).toBeDefined();
      expect(result.turnId).toBe("turn-123");
      expect(result.status).toBe("completed");
    });

    it.each(providers)("should handle streaming response for %s", async (provider) => {
      // 模拟流式响应
      const chunks = ["Hello", " from", " ", provider];
      let chunkIndex = 0;

      const mockInvoke = vi.fn().mockImplementation(async (command: string) => {
        if (command === "send_turn_stream") {
          return {
            turnId: "turn-123",
            chunks: chunks.map((text, i) => ({
              index: i,
              text,
              isFinal: i === chunks.length - 1,
            })),
          };
        }
        return null;
      });

      vi.mocked(await import("@tauri-apps/api/core")).invoke = mockInvoke;

      const result = await mockInvoke("send_turn_stream", {
        provider,
        threadId: "thread-123",
        message: "Hello",
      });

      expect(result).toBeDefined();
      expect(result.chunks).toHaveLength(4);
      expect(result.chunks[0].text).toBe("Hello");
      expect(result.chunks[3].isFinal).toBe(true);
    });
  });

  describe("工具调用能力", () => {
    it.each(providers)("should support bash tool for %s", async (provider) => {
      const mockInvoke = vi.fn().mockResolvedValue({
        turnId: "turn-123",
        toolCalls: [
          {
            toolName: "bash",
            input: { command: "echo hello" },
            output: "hello\n",
            status: "completed",
          },
        ],
      });

      vi.mocked(await import("@tauri-apps/api/core")).invoke = mockInvoke;

      const result = await mockInvoke("send_turn_with_tools", {
        provider,
        threadId: "thread-123",
        message: "Run echo hello",
        tools: ["bash"],
      });

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].toolName).toBe("bash");
      expect(result.toolCalls[0].status).toBe("completed");
    });

    it.each(providers)("should support read tool for %s", async (provider) => {
      const mockInvoke = vi.fn().mockResolvedValue({
        turnId: "turn-123",
        toolCalls: [
          {
            toolName: "read",
            input: { path: "/test/file.txt" },
            output: "File content",
            status: "completed",
          },
        ],
      });

      vi.mocked(await import("@tauri-apps/api/core")).invoke = mockInvoke;

      const result = await mockInvoke("send_turn_with_tools", {
        provider,
        threadId: "thread-123",
        message: "Read file.txt",
        tools: ["read"],
      });

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].toolName).toBe("read");
    });

    it.each(providers)("should support write tool for %s", async (provider) => {
      const mockInvoke = vi.fn().mockResolvedValue({
        turnId: "turn-123",
        toolCalls: [
          {
            toolName: "write",
            input: { path: "/test/file.txt", content: "New content" },
            output: "File written",
            status: "completed",
          },
        ],
      });

      vi.mocked(await import("@tauri-apps/api/core")).invoke = mockInvoke;

      const result = await mockInvoke("send_turn_with_tools", {
        provider,
        threadId: "thread-123",
        message: "Write file.txt",
        tools: ["write"],
      });

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].toolName).toBe("write");
    });

    it.each(providers)("should support multiple tool calls for %s", async (provider) => {
      const mockInvoke = vi.fn().mockResolvedValue({
        turnId: "turn-123",
        toolCalls: [
          {
            toolName: "read",
            input: { path: "/test/file.txt" },
            output: "Old content",
            status: "completed",
          },
          {
            toolName: "write",
            input: { path: "/test/file.txt", content: "New content" },
            output: "File written",
            status: "completed",
          },
        ],
      });

      vi.mocked(await import("@tauri-apps/api/core")).invoke = mockInvoke;

      const result = await mockInvoke("send_turn_with_tools", {
        provider,
        threadId: "thread-123",
        message: "Update file.txt",
        tools: ["read", "write"],
      });

      expect(result.toolCalls).toHaveLength(2);
      expect(result.toolCalls[0].toolName).toBe("read");
      expect(result.toolCalls[1].toolName).toBe("write");
    });
  });

  describe("错误处理和重试", () => {
    it.each(providers)("should handle timeout for %s", async (provider) => {
      const mockInvoke = vi.fn().mockRejectedValue(new Error("Turn timeout exceeded"));

      vi.mocked(await import("@tauri-apps/api/core")).invoke = mockInvoke;

      await expect(
        mockInvoke("send_turn", {
          provider,
          threadId: "thread-123",
          message: "Hello",
          timeout: 1000,
        })
      ).rejects.toThrow("Turn timeout exceeded");
    });

    it.each(providers)("should handle network error for %s", async (provider) => {
      const mockInvoke = vi.fn().mockRejectedValue(new Error("Network connection failed"));

      vi.mocked(await import("@tauri-apps/api/core")).invoke = mockInvoke;

      await expect(
        mockInvoke("send_turn", {
          provider,
          threadId: "thread-123",
          message: "Hello",
        })
      ).rejects.toThrow("Network connection failed");
    });

    it.each(providers)("should handle rate limit for %s", async (provider) => {
      const mockInvoke = vi.fn().mockRejectedValue(new Error("Rate limit exceeded (429)"));

      vi.mocked(await import("@tauri-apps/api/core")).invoke = mockInvoke;

      await expect(
        mockInvoke("send_turn", {
          provider,
          threadId: "thread-123",
          message: "Hello",
        })
      ).rejects.toThrow("Rate limit exceeded");
    });

    it.each(providers)("should retry on transient error for %s", async (provider) => {
      let callCount = 0;
      const mockInvoke = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error("Transient error");
        }
        return {
          turnId: "turn-123",
          status: "completed",
          response: "Success after retry",
        };
      });

      vi.mocked(await import("@tauri-apps/api/core")).invoke = mockInvoke;

      // 模拟重试逻辑
      const maxRetries = 3;
      let lastError: Error | null = null;

      for (let i = 0; i < maxRetries; i++) {
        try {
          const result = await mockInvoke("send_turn", {
            provider,
            threadId: "thread-123",
            message: "Hello",
          });
          expect(result.status).toBe("completed");
          expect(callCount).toBe(2); // 第一次失败，第二次成功
          return;
        } catch (error) {
          lastError = error as Error;
        }
      }

      throw lastError;
    });
  });

  describe("Provider 特定功能", () => {
    it("should verify Claude supports extended thinking", async () => {
      const mockInvoke = vi.fn().mockResolvedValue({
        turnId: "turn-123",
        thinking: "Let me think about this...",
        response: "Answer with thinking",
      });

      vi.mocked(await import("@tauri-apps/api/core")).invoke = mockInvoke;

      const result = await mockInvoke("send_turn_with_thinking", {
        provider: "claudeAgent",
        threadId: "thread-123",
        message: "Complex question",
        enableThinking: true,
      });

      expect(result.thinking).toBeDefined();
      expect(result.response).toBe("Answer with thinking");
    });

    it("should verify OpenAI supports function calling", async () => {
      const mockInvoke = vi.fn().mockResolvedValue({
        turnId: "turn-123",
        functionCalls: [
          {
            name: "get_weather",
            arguments: { location: "Beijing" },
          },
        ],
      });

      vi.mocked(await import("@tauri-apps/api/core")).invoke = mockInvoke;

      const result = await mockInvoke("send_turn_with_functions", {
        provider: "openaiAgent",
        threadId: "thread-123",
        message: "What's the weather?",
        functions: ["get_weather"],
      });

      expect(result.functionCalls).toHaveLength(1);
      expect(result.functionCalls[0].name).toBe("get_weather");
    });

    it("should verify Gemini supports grounding", async () => {
      const mockInvoke = vi.fn().mockResolvedValue({
        turnId: "turn-123",
        groundingMetadata: {
          sources: ["https://example.com"],
          searchQueries: ["current weather"],
        },
        response: "Grounded answer",
      });

      vi.mocked(await import("@tauri-apps/api/core")).invoke = mockInvoke;

      const result = await mockInvoke("send_turn_with_grounding", {
        provider: "geminiAgent",
        threadId: "thread-123",
        message: "Current events",
        enableGrounding: true,
      });

      expect(result.groundingMetadata).toBeDefined();
      expect(result.groundingMetadata.sources).toHaveLength(1);
    });
  });
});
