/**
 * @file providerPricing
 * @description Provider 模型定价表（P2-4）
 *
 * 集中维护每个 Provider + Model 的 input / output 定价（USD / 1M tokens）。
 *
 * ## 数据来源
 *
 * - 公开文档(2026-Q2 截取):OpenAI / Anthropic / Google / xAI / Mistral / DeepSeek / Moonshot / GLM / Qwen
 * - 国内 Provider(GLM / DeepSeek / Moonshot / Qwen / Mimo)按官方公开报价
 * - 缺数据的模型 → 不进表,`getModelCost(slug)` 返回 null,UI 提示"未配置"
 *
 * ## 维护约定
 *
 * - 单位: USD / 1M tokens(input / output)
 * - cached input 走 `calculateUsageCost` 内部固定 0.1 倍 input 系数(OpenAI 公开参考)
 * - 表格新增/调价后,需同步更新 `providerPricing.test.ts` 中的快照测试
 *
 * ## 大厂基线
 *
 * - 缺值视作"未知",不允许填 0(否则预算告警会瞎报)
 * - 数字精度 6 位小数即可
 * - 永不抛错:任何非法 slug → 返回 null
 */

import type { ModelCost } from "../providerModelOptions";
import type { ProviderKind } from "../contracts";

/** 定价表 key: `${provider}:${slug}` */
export type ProviderPricingKey = `${ProviderKind}:${string}`;

/**
 * 内部定价表(只读)
 *
 * 注意:此处数字精度刻意保留为公开文档中的有效位(2~3 位小数),由
 * `calculateUsageCost` 内部按 1M 系数做最终换算。
 */
const PRICING_TABLE: Readonly<Record<string, ModelCost>> = Object.freeze({
  // ──────────── OpenAI / Codex ────────────
  "codex:gpt-4o": { input: 2.5, output: 10 },
  "codex:gpt-4o-mini": { input: 0.15, output: 0.6 },
  "codex:gpt-4.1": { input: 2.5, output: 10 },
  "codex:gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "codex:gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "codex:o3": { input: 10, output: 40 },
  "codex:o3-mini": { input: 1.1, output: 4.4 },
  "codex:o4-mini": { input: 1.1, output: 4.4 },
  "codex:gpt-5": { input: 1.25, output: 10 },
  "codex:gpt-5-mini": { input: 0.25, output: 2 },
  "codex:gpt-5-nano": { input: 0.05, output: 0.4 },
  "codex:gpt-5-codex": { input: 1.25, output: 10 },

  // ──────────── Anthropic / ClaudeAgent ────────────
  "claudeAgent:claude-3-5-sonnet-latest": { input: 3, output: 15 },
  "claudeAgent:claude-3-5-haiku-latest": { input: 0.8, output: 4 },
  "claudeAgent:claude-3-7-sonnet-latest": { input: 3, output: 15 },
  "claudeAgent:claude-sonnet-4": { input: 3, output: 15 },
  "claudeAgent:claude-opus-4": { input: 15, output: 75 },
  "claudeAgent:claude-opus-4-1": { input: 15, output: 75 },

  // ──────────── Google / Gemini ────────────
  "gemini:gemini-1.5-pro": { input: 1.25, output: 5 },
  "gemini:gemini-1.5-flash": { input: 0.075, output: 0.3 },
  "gemini:gemini-2.0-flash": { input: 0.1, output: 0.4 },
  "gemini:gemini-2.5-pro": { input: 1.25, output: 10 },
  "gemini:gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini:gemini-3-pro": { input: 2, output: 12 },

  // ──────────── xAI / Grok ────────────
  "grok:grok-2": { input: 2, output: 10 },
  "grok:grok-2-mini": { input: 0.2, output: 1 },
  "grok:grok-3": { input: 3, output: 15 },
  "grok:grok-3-mini": { input: 0.3, output: 0.5 },

  // ──────────── OpenCode / Kilo(各上游差异大,只列常见) ────────────
  "opencode:gpt-4o": { input: 2.5, output: 10 },
  "opencode:gpt-4o-mini": { input: 0.15, output: 0.6 },
  "opencode:claude-3-5-sonnet-latest": { input: 3, output: 15 },
  "opencode:claude-3-7-sonnet-latest": { input: 3, output: 15 },
  "opencode:gemini-2.5-pro": { input: 1.25, output: 10 },
  "opencode:gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "kilo:gpt-4o": { input: 2.5, output: 10 },
  "kilo:gpt-4o-mini": { input: 0.15, output: 0.6 },
  "kilo:claude-3-5-sonnet-latest": { input: 3, output: 15 },

  // ──────────── Pi ────────────
  "pi:pi-3": { input: 0, output: 0 }, // 暂未公开报价
  "pi:pi-4": { input: 0, output: 0 },

  // ──────────── 国内 Provider ────────────
  // GLM(智谱)
  "glm:glm-4-plus": { input: 7, output: 7 },
  "glm:glm-4-air": { input: 0.12, output: 0.12 },
  "glm:glm-4-airx": { input: 1.2, output: 1.2 },
  "glm:glm-4-long": { input: 0.4, output: 0.4 },
  "glm:glm-4-flash": { input: 0, output: 0 }, // 免费
  "glm:glm-4.6": { input: 1.4, output: 1.4 },
  "glm:glm-4.5": { input: 1.4, output: 1.4 },
  "glm:glm-z1-air": { input: 0, output: 0 }, // 推理免费(限时)
  "glm:glm-zero": { input: 6, output: 6 },

  // DeepSeek
  "deepseek:deepseek-chat": { input: 0.27, output: 1.1 }, // V2.5 cache miss
  "deepseek:deepseek-coder": { input: 0.27, output: 1.1 },
  "deepseek:deepseek-reasoner": { input: 0.55, output: 2.19 }, // R1
  "deepseek:deepseek-v3": { input: 0.27, output: 1.1 },
  "deepseek:deepseek-v3-1": { input: 0.27, output: 1.1 },
  "deepseek:deepseek-r1": { input: 0.55, output: 2.19 },

  // Moonshot(Kimi)
  "moonshot:moonshot-v1-8k": { input: 1.67, output: 1.67 },
  "moonshot:moonshot-v1-32k": { input: 3.33, output: 3.33 },
  "moonshot:moonshot-v1-128k": { input: 5, output: 5 },
  "moonshot:moonshot-v1-auto": { input: 2, output: 2 },
  "moonshot:kimi-k2": { input: 2, output: 5 },
  "moonshot:kimi-latest": { input: 2, output: 5 },

  // Qwen(通义千问)
  "qwen:qwen-max": { input: 2.4, output: 9.6 },
  "qwen:qwen-plus": { input: 0.8, output: 2 },
  "qwen:qwen-turbo": { input: 0.3, output: 0.6 },
  "qwen:qwen-long": { input: 0.5, output: 2 },
  "qwen:qwen-3-coder-plus": { input: 4, output: 12 },
  "qwen:qwen-3-max": { input: 4, output: 12 },
  "qwen:qwen-3-235b-a22b-instruct": { input: 0.7, output: 2.8 },
  "qwen:qwen-3-coder-480b-a35b-instruct": { input: 1.5, output: 7.5 },

  // Mimo(小米)
  "mimo:mimo-vl-7b": { input: 0, output: 0 }, // 免费
  "mimo:mimo-7b": { input: 0, output: 0 },

  // MiniMax(占位,无公开报价)
  "MiniMax:MiniMax-abab-6-5s-chat": { input: 0, output: 0 },
  "MiniMax:MiniMax-abab-6-5-chat": { input: 0, output: 0 },

  // Doubao(字节跳动·火山方舟 Ark)
  // 报价来源:火山方舟控制台 2026-Q2 公开价目(单位 USD / 1M tokens)
  "doubao:doubao-pro-32k": { input: 0.11, output: 0.28 },
  "doubao:doubao-pro-128k": { input: 0.11, output: 0.28 },
  "doubao:doubao-lite-32k": { input: 0.003, output: 0.009 },
  "doubao:doubao-lite-128k": { input: 0.005, output: 0.014 },
  "doubao:doubao-1.5-pro-32k": { input: 0.11, output: 0.28 },
  "doubao:doubao-1.5-pro-256k": { input: 0.34, output: 0.86 },
  "doubao:doubao-1.5-lite-32k": { input: 0.004, output: 0.011 },
  "doubao:doubao-1.5-vision-pro-32k": { input: 0.16, output: 0.41 },

  // Ernie(百度·千帆 v2)
  // 报价来源:千帆 ModelBuilder 平台 2026-Q2 公开价目
  "ernie:ernie-4.0-8k-latest": { input: 1.4, output: 4.2 },
  "ernie:ernie-4.0-turbo-8k": { input: 1.4, output: 4.2 },
  "ernie:ernie-3.5-8k": { input: 0.7, output: 2.1 },
  "ernie:ernie-3.5-128k": { input: 1.5, output: 4.5 },
  "ernie:ernie-speed-8k": { input: 0.04, output: 0.12 },
  "ernie:ernie-speed-128k": { input: 0.12, output: 0.36 },
  "ernie:ernie-lite-8k": { input: 0, output: 0 }, // 免费
  "ernie:ernie-tiny-8k": { input: 0, output: 0 }, // 免费

  // Hunyuan(腾讯混元)
  // 报价来源:腾讯云混元大模型 2026-Q2 公开价目
  "hunyuan:hunyuan-pro": { input: 0.55, output: 1.65 },
  "hunyuan:hunyuan-standard": { input: 0.055, output: 0.165 },
  "hunyuan:hunyuan-lite": { input: 0, output: 0 }, // 免费
  "hunyuan:hunyuan-large-longcontext": { input: 0.55, output: 1.65 },
  "hunyuan:hunyuan-functioncall": { input: 0.055, output: 0.165 },
  "hunyuan:hunyuan-vision": { input: 0.41, output: 1.24 },
  "hunyuan:hunyuan-code": { input: 0.21, output: 0.62 },
});

/**
 * 根据 provider + slug 查定价
 *
 * @returns ModelCost 或 null(缺数据)
 */
export function getModelCost(provider: ProviderKind, slug: string): ModelCost | null {
  if (!provider || !slug) return null;
  const key = `${provider}:${slug}`;
  const found = PRICING_TABLE[key];
  if (!found) return null;
  // 防御:output=0 且 input=0 → 视为"未公开报价",降级为 null
  if ((found.input ?? 0) <= 0 && (found.output ?? 0) <= 0) return null;
  return found;
}

/**
 * 判断模型是否已配置定价
 */
export function hasModelCost(provider: ProviderKind, slug: string): boolean {
  return getModelCost(provider, slug) !== null;
}

/**
 * 列出某 Provider 下所有已配置 slug(用于"未配置"诊断 UI)
 */
export function listConfiguredSlugs(provider: ProviderKind): string[] {
  const prefix = `${provider}:`;
  return Object.keys(PRICING_TABLE)
    .filter((k) => k.startsWith(prefix))
    .map((k) => k.slice(prefix.length));
}

/**
 * 定价表整体(只读,用于快照测试 / 调试面板)
 *
 * 大厂基线:对外暴露只读 snapshot,避免误改全局常量。
 */
export function getAllPricing(): ReadonlyMap<ProviderPricingKey, ModelCost> {
  const out = new Map<ProviderPricingKey, ModelCost>();
  for (const [k, v] of Object.entries(PRICING_TABLE)) {
    out.set(k as ProviderPricingKey, v);
  }
  return out;
}
