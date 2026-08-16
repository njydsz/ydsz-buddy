/**
 * @file Provider 真实 API e2e 测试
 *
 * 本测试使用真实 Provider API Key 进行端到端 Turn 测试，确保：
 * - 各 Provider API 端点可达
 * - 请求/响应格式兼容
 * - 性能基线不劣化 > 5%
 *
 * ## 环境变量
 *
 * - `YDSZ_E2E_CLAUDE_API_KEY` — Anthropic API Key
 * - `YDSZ_E2E_OPENAI_API_KEY` — OpenAI API Key
 * - `YDSZ_E2E_GEMINI_API_KEY` — Google API Key
 *
 * 当环境变量缺失时，测试自动跳过（CI 本地友好）。
 *
 * ## 核心导出
 *
 * - 3 个真实 Turn 测试（Claude / OpenAI / Gemini）
 * - 性能基线验证
 */

import { describe, it, expect, vi } from "vitest";
import { fetch } from "@tauri-apps/plugin-http";

// ===========================================================================
// 工具函数
// ===========================================================================

/** 跳过条件：无 API Key */
function skipIfNoKey(keyName: string): void {
  if (!process.env[keyName]) {
    vi.skip(`跳过：未设置 ${keyName}`);
  }
}

/** 性能基线阈值（毫秒） */
const PERF_BASELINE_MS: Record<string, number> = {
  claude: 8000,
  openai: 6000,
  gemini: 5000,
};

/** 允许的性能劣化比例 */
const PERF_DEGRADATION_THRESHOLD = 1.05;

/** 调用 Anthropic Messages API */
async function callClaude(prompt: string, apiKey: string): Promise<{
  durationMs: number;
  content: string;
}> {
  const start = Date.now();
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 256,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = (await resp.json()) as Record<string, unknown>;
  const durationMs = Date.now() - start;

  const content =
    (data["content"] as Array<{ text?: string }>)?.[0]?.text ?? JSON.stringify(data);

  return { durationMs, content };
}

/** 调用 OpenAI Chat Completions API */
async function callOpenAI(prompt: string, apiKey: string): Promise<{
  durationMs: number;
  content: string;
}> {
  const start = Date.now();
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 256,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = (await resp.json()) as Record<string, unknown>;
  const durationMs = Date.now() - start;

  const choices = data["choices"] as Array<{ message?: { content?: string } }> | undefined;
  const content = choices?.[0]?.message?.content ?? JSON.stringify(data);

  return { durationMs, content };
}

/** 调用 Google Gemini API */
async function callGemini(prompt: string, apiKey: string): Promise<{
  durationMs: number;
  content: string;
}> {
  const start = Date.now();
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 256 },
      }),
    },
  );

  const data = (await resp.json()) as Record<string, unknown>;
  const durationMs = Date.now() - start;

  const candidates = data["candidates"] as Array<{
    content?: { parts?: Array<{ text?: string }> };
  }> | undefined;
  const content =
    candidates?.[0]?.content?.parts?.[0]?.text ?? JSON.stringify(data);

  return { durationMs, content };
}

// ===========================================================================
// 测试用例
// ===========================================================================

describe("Provider 真实 API e2e", () => {
  const testPrompt = "Say 'e2e-ok' and nothing else.";

  describe("Claude (Anthropic)", () => {
    it("should complete a real Turn with Claude", async () => {
      skipIfNoKey("YDSZ_E2E_CLAUDE_API_KEY");
      const apiKey = process.env.YDSZ_E2E_CLAUDE_API_KEY!;

      const { durationMs, content } = await callClaude(testPrompt, apiKey);

      // 验证响应非空
      expect(content.length).toBeGreaterThan(0);
      // 验证响应包含预期关键词
      expect(content.toLowerCase()).toContain("e2e-ok");
      // 验证性能基线
      const baseline = PERF_BASELINE_MS["claude"]!;
      expect(durationMs).toBeLessThan(
        Math.round(baseline * PERF_DEGRADATION_THRESHOLD),
        `Claude Turn 耗时 ${durationMs}ms 超出基线 ${baseline}ms * ${PERF_DEGRADATION_THRESHOLD}`,
      );

      console.log(`[perf] Claude Turn: ${durationMs}ms (baseline: ${baseline}ms)`);
    });
  });

  describe("OpenAI", () => {
    it("should complete a real Turn with OpenAI", async () => {
      skipIfNoKey("YDSZ_E2E_OPENAI_API_KEY");
      const apiKey = process.env.YDSZ_E2E_OPENAI_API_KEY!;

      const { durationMs, content } = await callOpenAI(testPrompt, apiKey);

      expect(content.length).toBeGreaterThan(0);
      expect(content.toLowerCase()).toContain("e2e-ok");

      const baseline = PERF_BASELINE_MS["openai"]!;
      expect(durationMs).toBeLessThan(
        Math.round(baseline * PERF_DEGRADATION_THRESHOLD),
        `OpenAI Turn 耗时 ${durationMs}ms 超出基线 ${baseline}ms * ${PERF_DEGRADATION_THRESHOLD}`,
      );

      console.log(`[perf] OpenAI Turn: ${durationMs}ms (baseline: ${baseline}ms)`);
    });
  });

  describe("Gemini (Google)", () => {
    it("should complete a real Turn with Gemini", async () => {
      skipIfNoKey("YDSZ_E2E_GEMINI_API_KEY");
      const apiKey = process.env.YDSZ_E2E_GEMINI_API_KEY!;

      const { durationMs, content } = await callGemini(testPrompt, apiKey);

      expect(content.length).toBeGreaterThan(0);
      expect(content.toLowerCase()).toContain("e2e-ok");

      const baseline = PERF_BASELINE_MS["gemini"]!;
      expect(durationMs).toBeLessThan(
        Math.round(baseline * PERF_DEGRADATION_THRESHOLD),
        `Gemini Turn 耗时 ${durationMs}ms 超出基线 ${baseline}ms * ${PERF_DEGRADATION_THRESHOLD}`,
      );

      console.log(`[perf] Gemini Turn: ${durationMs}ms (baseline: ${baseline}ms)`);
    });
  });
});
