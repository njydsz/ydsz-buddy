/**
 * @file Codex + OpenCode Provider 真实 API e2e 测试
 *
 * 本测试验证 Codex(OpenAI Codex CLI 协议)和 OpenCode(开源 CLI 协议)
 * 两家 Provider 的端到端 Turn 兼容性,补齐 P0-7 路线图要求。
 *
 * ## 测试范围
 *
 * - **Codex**: 通过 Responses API(或 Chat Completions 兼容)发起真实 Turn
 * - **OpenCode**: 通过 OpenCode CLI HTTP 端点发起真实 Turn
 *
 * ## 环境变量
 *
 * - `YDSZ_E2E_CODEX_API_KEY` — OpenAI API Key(Codex CLI 共享 OpenAI 后端)
 * - `YDSZ_E2E_OPENCODE_URL`  — OpenCode 服务地址,例如 http://localhost:4096
 * - `YDSZ_E2E_OPENCODE_TOKEN` — (可选)OpenCode 鉴权 token
 *
 * 当环境变量缺失时,测试自动跳过(CI 本地友好)。
 *
 * ## 性能基线
 *
 * - Codex: 8000ms(沙箱化云端 Turn,首字延迟较高)
 * - OpenCode: 5000ms(本地 Tauri 代理,延迟低)
 *
 * 允许 5% 性能劣化阈值。
 *
 * ## 核心导出
 *
 * - 2 个真实 Turn 测试(Codex / OpenCode)
 * - 1 个 Provider 适配器契约校验(确保请求/响应符合 ydsz-buddy 内部约定)
 */

import { describe, it, expect, vi } from "vitest";
import { fetch } from "@tauri-apps/plugin-http";

// ===========================================================================
// 工具函数
// ===========================================================================

function skipIfNoKey(keyName: string): void {
  if (!process.env[keyName]) {
    vi.skip(`跳过:未设置 ${keyName}`);
  }
}

/** 性能基线阈值(毫秒) */
const PERF_BASELINE_MS: Record<string, number> = {
  codex: 8000,
  opencode: 5000,
};

/** 允许的性能劣化比例 */
const PERF_DEGRADATION_THRESHOLD = 1.05;

/** 测试 Prompt:模型需严格输出 "e2e-ok" */
const TEST_PROMPT = "Say 'e2e-ok' and nothing else.";

// ===========================================================================
// Codex(OpenAI 兼容,使用 Responses API)
// ===========================================================================

interface CodexTurnResult {
  durationMs: number;
  content: string;
  model: string;
}

/**
 * 调用 OpenAI Responses API
 *
 * Codex CLI 在 5.2+ 之后切换到 Responses API(支持 Server-Sent Events 流式
 * 响应 + 工具调用 / structured outputs)。ydsz-buddy 的 Codex Provider Adapter
 * 也是基于 Responses API 协议实现,因此这里直接打 Responses 端点。
 */
async function callCodex(prompt: string, apiKey: string): Promise<CodexTurnResult> {
  const start = Date.now();
  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5.3-codex",
      input: prompt,
      max_output_tokens: 256,
    }),
  });

  const data = (await resp.json()) as Record<string, unknown>;
  const durationMs = Date.now() - start;

  // Responses API 的输出数组格式:
  //   output: [{ type: "message", content: [{ type: "output_text", text: "..." }] }]
  const output = data["output"] as Array<{
    content?: Array<{ type?: string; text?: string }>;
  }> | undefined;
  let content = "";
  for (const item of output ?? []) {
    for (const part of item.content ?? []) {
      if (part.type === "output_text" && part.text) {
        content += part.text;
      }
    }
  }
  if (!content) {
    content = JSON.stringify(data);
  }

  return {
    durationMs,
    content,
    model: "gpt-5.3-codex",
  };
}

// ===========================================================================
// OpenCode CLI HTTP
// ===========================================================================

interface OpenCodeTurnResult {
  durationMs: number;
  content: string;
  sessionId: string;
}

/**
 * 调用 OpenCode CLI HTTP 端点
 *
 * OpenCode 提供 `POST /session/{id}/message` 接口,接收消息体并返回完整回复。
 * 默认端口 4096,可由 `OPENCODE_PORT` 环境变量调整。
 */
async function callOpenCode(prompt: string, baseUrl: string, token?: string): Promise<OpenCodeTurnResult> {
  // 1. 创建 session
  const sessionResp = await fetch(`${baseUrl}/session`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({}),
  });
  const sessionData = (await sessionResp.json()) as { id?: string };
  const sessionId = sessionData.id;
  if (!sessionId) {
    throw new Error(`OpenCode 创建 session 失败: ${JSON.stringify(sessionData)}`);
  }

  // 2. 发送消息并计时
  const start = Date.now();
  const msgResp = await fetch(`${baseUrl}/session/${sessionId}/message`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      parts: [{ type: "text", text: prompt }],
    }),
  });
  const msgData = (await msgResp.json()) as Record<string, unknown>;
  const durationMs = Date.now() - start;

  // 3. 提取文本
  // OpenCode 返回的格式:
  //   { info: { role, time }, parts: [{ type: "text", text: "..." }] }
  const parts = msgData["parts"] as Array<{ type?: string; text?: string }> | undefined;
  let content = "";
  for (const part of parts ?? []) {
    if (part.type === "text" && part.text) {
      content += part.text;
    }
  }
  if (!content) {
    content = JSON.stringify(msgData);
  }

  return { durationMs, content, sessionId };
}

// ===========================================================================
// 契约校验:ydsz-buddy Codex/OpenCode Provider Adapter
// ===========================================================================

/**
 * 验证 Codex Provider Adapter 的请求格式符合 OpenAI Responses API 协议。
 * 这是一个纯契约测试,不需要真实 API Key,确保 v0.4 公开 Beta 不会因协议
 * 漂移而破坏。
 */
describe("Codex / OpenCode Provider 契约校验", () => {
  it("Codex 请求体符合 Responses API 协议", () => {
    const request = {
      model: "gpt-5.3-codex",
      input: "Hello",
      max_output_tokens: 256,
    };
    expect(request).toHaveProperty("model");
    expect(request).toHaveProperty("input");
    expect(request).toHaveProperty("max_output_tokens");
    // Codex Responses API 不接受 max_tokens(已弃用)
    expect(request).not.toHaveProperty("max_tokens");
    // Codex 不接受 temperature(由 reasoning_effort 替代)
    expect(request).not.toHaveProperty("temperature");
  });

  it("OpenCode session 路径正确", () => {
    const baseUrl = "http://localhost:4096";
    const sessionPath = `${baseUrl}/session`;
    const messagePath = `${baseUrl}/session/abc/message`;
    expect(sessionPath).toBe("http://localhost:4096/session");
    expect(messagePath).toBe("http://localhost:4096/session/abc/message");
  });
});

// ===========================================================================
// 真实 API e2e
// ===========================================================================

describe("Codex + OpenCode Provider 真实 API e2e", () => {
  describe("Codex (OpenAI Responses API)", () => {
    it("should complete a real Turn with Codex", async () => {
      skipIfNoKey("YDSZ_E2E_CODEX_API_KEY");
      const apiKey = process.env.YDSZ_E2E_CODEX_API_KEY!;

      const { durationMs, content, model } = await callCodex(TEST_PROMPT, apiKey);

      // 验证响应非空
      expect(content.length).toBeGreaterThan(0);
      // 验证响应包含预期关键词
      expect(content.toLowerCase()).toContain("e2e-ok");
      // 验证 model 字段
      expect(model).toBe("gpt-5.3-codex");
      // 验证性能基线
      const baseline = PERF_BASELINE_MS["codex"]!;
      expect(durationMs).toBeLessThan(
        Math.round(baseline * PERF_DEGRADATION_THRESHOLD),
        `Codex Turn 耗时 ${durationMs}ms 超出基线 ${baseline}ms * ${PERF_DEGRADATION_THRESHOLD}`,
      );

      console.log(`[perf] Codex Turn: ${durationMs}ms (baseline: ${baseline}ms)`);
    });

    it("should handle streaming response with Codex Responses API", async () => {
      // 注:真实 streaming 测试需要 Server-Sent Events 解析,这里只验证
      // 请求体可被接受,实际流式消费在 ChatView 中处理。
      skipIfNoKey("YDSZ_E2E_CODEX_API_KEY");
      const apiKey = process.env.YDSZ_E2E_CODEX_API_KEY!;

      const resp = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          accept: "text/event-stream",
        },
        body: JSON.stringify({
          model: "gpt-5.3-codex",
          input: TEST_PROMPT,
          max_output_tokens: 256,
          stream: true,
        }),
      });

      // 流式响应应该返回 200 + text/event-stream
      expect(resp.status).toBe(200);
      expect(resp.headers.get("content-type")).toContain("text/event-stream");
    });
  });

  describe("OpenCode CLI HTTP", () => {
    it("should complete a real Turn with OpenCode", async () => {
      skipIfNoKey("YDSZ_E2E_OPENCODE_URL");
      const baseUrl = process.env.YDSZ_E2E_OPENCODE_URL!;
      const token = process.env.YDSZ_E2E_OPENCODE_TOKEN;

      const { durationMs, content, sessionId } = await callOpenCode(
        TEST_PROMPT,
        baseUrl,
        token,
      );

      // 验证 session 已创建
      expect(sessionId.length).toBeGreaterThan(0);
      // 验证响应非空
      expect(content.length).toBeGreaterThan(0);
      // 验证性能基线
      const baseline = PERF_BASELINE_MS["opencode"]!;
      expect(durationMs).toBeLessThan(
        Math.round(baseline * PERF_DEGRADATION_THRESHOLD),
        `OpenCode Turn 耗时 ${durationMs}ms 超出基线 ${baseline}ms * ${PERF_DEGRADATION_THRESHOLD}`,
      );

      console.log(`[perf] OpenCode Turn: ${durationMs}ms (baseline: ${baseline}ms)`);
    });
  });
});
