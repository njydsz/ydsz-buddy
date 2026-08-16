/**
 * @file 国内厂商 Provider 真实 API e2e 测试
 *
 * 根据战略路线图，验证 6 家国内 P0/P1 厂商 API 的协议兼容性：
 * - 智谱 GLM-5.2（P0-1）
 * - DeepSeek V4-Flash（P0-2）
 * - MiniMax M2.1（P1-3）
 * - Kimi K2.6（P0-3）
 * - Qwen Coder Plus（P0-4）
 * - Xiaomi MiMo V2 Pro（P1-4）
 *
 * ## 环境变量
 *
 * - `YDSZ_E2E_GLM_API_KEY` — 智谱 GLM API Key
 * - `YDSZ_E2E_DEEPSEEK_API_KEY` — DeepSeek API Key
 * - `YDSZ_E2E_MINIMAX_API_KEY` — MiniMax API Key
 * - `YDSZ_E2E_KIMI_API_KEY` — Kimi/Moonshot API Key
 * - `YDSZ_E2E_QWEN_API_KEY` — Qwen/阿里云 DashScope API Key
 * - `YDSZ_E2E_MIMO_API_KEY` — 小米 MiMo API Key
 *
 * 当环境变量缺失时，测试自动跳过（CI 本地友好）。
 */

import { describe, it, expect, vi } from "vitest";
import { fetch } from "@tauri-apps/plugin-http";

// ===========================================================================
// 工具函数
// ===========================================================================

function skipIfNoKey(keyName: string): void {
  if (!process.env[keyName]) {
    vi.skip(`跳过：未设置 ${keyName}`);
  }
}

const PERF_BASELINE_MS: Record<string, number> = {
  glm: 10000,
  deepseek: 6000,
  minimax: 8000,
  kimi: 6000,
  qwen: 6000,
  mimo: 10000,
};

const PERF_DEGRADATION_THRESHOLD = 1.5;

/** 调用智谱 GLM API (OpenAI 兼容) */
async function callGLM(prompt: string, apiKey: string): Promise<{
  durationMs: number;
  content: string;
}> {
  const start = Date.now();
  const resp = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "glm-5.2",
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

/** 调用 DeepSeek API (OpenAI 兼容) */
async function callDeepSeek(prompt: string, apiKey: string): Promise<{
  durationMs: number;
  content: string;
}> {
  const start = Date.now();
  const resp = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek-v4-flash",
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

/** 调用 MiniMax API (OpenAI 兼容) */
async function callMiniMax(prompt: string, apiKey: string): Promise<{
  durationMs: number;
  content: string;
}> {
  const start = Date.now();
  const resp = await fetch("https://api.minimaxi.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "MiniMax-M2.1",
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

/** 调用 Kimi/Moonshot API (OpenAI 兼容) */
async function callKimi(prompt: string, apiKey: string): Promise<{
  durationMs: number;
  content: string;
}> {
  const start = Date.now();
  const resp = await fetch("https://api.moonshot.cn/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "kimi-k2.6",
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

/** 调用 Qwen/阿里云 DashScope API (OpenAI 兼容) */
async function callQwen(prompt: string, apiKey: string): Promise<{
  durationMs: number;
  content: string;
}> {
  const start = Date.now();
  const resp = await fetch(
    "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "qwen3-coder-plus",
        max_tokens: 256,
        messages: [{ role: "user", content: prompt }],
      }),
    },
  );

  const data = (await resp.json()) as Record<string, unknown>;
  const durationMs = Date.now() - start;

  const choices = data["choices"] as Array<{ message?: { content?: string } }> | undefined;
  const content = choices?.[0]?.message?.content ?? JSON.stringify(data);

  return { durationMs, content };
}

/** 调用小米 MiMo API (OpenAI 兼容) */
async function callMimo(prompt: string, apiKey: string): Promise<{
  durationMs: number;
  content: string;
}> {
  const start = Date.now();
  const resp = await fetch("https://platform.xiaomimimo.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "mimo-v2-pro",
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

// ===========================================================================
// 测试用例
// ===========================================================================

describe("国内厂商 Provider 真实 API e2e", () => {
  const testPrompt = "Say 'e2e-ok' and nothing else.";

  describe("智谱 GLM-5.2 (P0-1)", () => {
    it("should complete a real Turn with GLM", async () => {
      skipIfNoKey("YDSZ_E2E_GLM_API_KEY");
      const apiKey = process.env.YDSZ_E2E_GLM_API_KEY!;

      const { durationMs, content } = await callGLM(testPrompt, apiKey);

      expect(content.length).toBeGreaterThan(0);
      expect(content.toLowerCase()).toContain("e2e-ok");

      const baseline = PERF_BASELINE_MS["glm"]!;
      expect(durationMs).toBeLessThan(
        Math.round(baseline * PERF_DEGRADATION_THRESHOLD),
        `GLM Turn 耗时 ${durationMs}ms 超出基线 ${baseline}ms * ${PERF_DEGRADATION_THRESHOLD}`,
      );

      console.log(`[perf] GLM Turn: ${durationMs}ms (baseline: ${baseline}ms)`);
    });
  });

  describe("DeepSeek V4-Flash (P0-2)", () => {
    it("should complete a real Turn with DeepSeek", async () => {
      skipIfNoKey("YDSZ_E2E_DEEPSEEK_API_KEY");
      const apiKey = process.env.YDSZ_E2E_DEEPSEEK_API_KEY!;

      const { durationMs, content } = await callDeepSeek(testPrompt, apiKey);

      expect(content.length).toBeGreaterThan(0);
      expect(content.toLowerCase()).toContain("e2e-ok");

      const baseline = PERF_BASELINE_MS["deepseek"]!;
      expect(durationMs).toBeLessThan(
        Math.round(baseline * PERF_DEGRADATION_THRESHOLD),
        `DeepSeek Turn 耗时 ${durationMs}ms 超出基线 ${baseline}ms * ${PERF_DEGRADATION_THRESHOLD}`,
      );

      console.log(`[perf] DeepSeek Turn: ${durationMs}ms (baseline: ${baseline}ms)`);
    });
  });

  describe("MiniMax M2.1 (P1-3)", () => {
    it("should complete a real Turn with MiniMax", async () => {
      skipIfNoKey("YDSZ_E2E_MINIMAX_API_KEY");
      const apiKey = process.env.YDSZ_E2E_MINIMAX_API_KEY!;

      const { durationMs, content } = await callMiniMax(testPrompt, apiKey);

      expect(content.length).toBeGreaterThan(0);
      expect(content.toLowerCase()).toContain("e2e-ok");

      const baseline = PERF_BASELINE_MS["minimax"]!;
      expect(durationMs).toBeLessThan(
        Math.round(baseline * PERF_DEGRADATION_THRESHOLD),
        `MiniMax Turn 耗时 ${durationMs}ms 超出基线 ${baseline}ms * ${PERF_DEGRADATION_THRESHOLD}`,
      );

      console.log(`[perf] MiniMax Turn: ${durationMs}ms (baseline: ${baseline}ms)`);
    });
  });

  describe("Kimi K2.6 (P0-3)", () => {
    it("should complete a real Turn with Kimi", async () => {
      skipIfNoKey("YDSZ_E2E_KIMI_API_KEY");
      const apiKey = process.env.YDSZ_E2E_KIMI_API_KEY!;

      const { durationMs, content } = await callKimi(testPrompt, apiKey);

      expect(content.length).toBeGreaterThan(0);
      expect(content.toLowerCase()).toContain("e2e-ok");

      const baseline = PERF_BASELINE_MS["kimi"]!;
      expect(durationMs).toBeLessThan(
        Math.round(baseline * PERF_DEGRADATION_THRESHOLD),
        `Kimi Turn 耗时 ${durationMs}ms 超出基线 ${baseline}ms * ${PERF_DEGRADATION_THRESHOLD}`,
      );

      console.log(`[perf] Kimi Turn: ${durationMs}ms (baseline: ${baseline}ms)`);
    });
  });

  describe("Qwen Coder Plus (P0-4)", () => {
    it("should complete a real Turn with Qwen", async () => {
      skipIfNoKey("YDSZ_E2E_QWEN_API_KEY");
      const apiKey = process.env.YDSZ_E2E_QWEN_API_KEY!;

      const { durationMs, content } = await callQwen(testPrompt, apiKey);

      expect(content.length).toBeGreaterThan(0);
      expect(content.toLowerCase()).toContain("e2e-ok");

      const baseline = PERF_BASELINE_MS["qwen"]!;
      expect(durationMs).toBeLessThan(
        Math.round(baseline * PERF_DEGRADATION_THRESHOLD),
        `Qwen Turn 耗时 ${durationMs}ms 超出基线 ${baseline}ms * ${PERF_DEGRADATION_THRESHOLD}`,
      );

      console.log(`[perf] Qwen Turn: ${durationMs}ms (baseline: ${baseline}ms)`);
    });
  });

  describe("小米 MiMo V2 Pro (P1-4)", () => {
    it("should complete a real Turn with MiMo", async () => {
      skipIfNoKey("YDSZ_E2E_MIMO_API_KEY");
      const apiKey = process.env.YDSZ_E2E_MIMO_API_KEY!;

      const { durationMs, content } = await callMimo(testPrompt, apiKey);

      expect(content.length).toBeGreaterThan(0);
      expect(content.toLowerCase()).toContain("e2e-ok");

      const baseline = PERF_BASELINE_MS["mimo"]!;
      expect(durationMs).toBeLessThan(
        Math.round(baseline * PERF_DEGRADATION_THRESHOLD),
        `MiMo Turn 耗时 ${durationMs}ms 超出基线 ${baseline}ms * ${PERF_DEGRADATION_THRESHOLD}`,
      );

      console.log(`[perf] MiMo Turn: ${durationMs}ms (baseline: ${baseline}ms)`);
    });
  });
});
