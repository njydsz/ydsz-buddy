/**
 * @file DomesticProviderEnvDiscovery
 * @description 国内 6 家 Provider(智谱 GLM / 深度求索 DeepSeek / 月之暗面
 *              Moonshot / 阿里通义千问 Qwen / 小米 MiMo / MiniMax)通过环境变量自动发现。
 *
 * ## 设计动机
 *
 * 国内 6 家 Provider 与海外 Provider 形态不同:
 * - 海外(Anthropic / OpenAI / Cursor): 通常有 CLI 二进制(Codex / Claude Agent),
 *   走 `fs_which` 探测系统 PATH。
 * - 国内 6 家: 纯 HTTP 兼容端点(OpenAI Chat Completions 协议),
 *   **无任何客户端二进制**,可用性完全取决于 API Key 环境变量。
 *
 * 既然没有"二进制"可探测,我们把"环境变量是否存在"作为可用性的代理:
 * 启动时扫一遍 6 个环境变量,只要非空就视为"已发现",可一键启用。
 *
 * ## 覆盖范围(全量 6 家)
 *
 * | Provider | ProviderKind | 环境变量        | 文档链接                                                                  |
 * |----------|--------------|-----------------|---------------------------------------------------------------------------|
 * | 智谱 GLM | `glm`        | ZHIPU_API_KEY   | https://open.bigmodel.cn/dev/api                                         |
 * | DeepSeek | `deepseek`   | DEEPSEEK_API_KEY| https://api-docs.deepseek.com/                                            |
 * | Moonshot | `moonshot`   | MOONSHOT_API_KEY| https://platform.moonshot.cn/docs/api-reference                           |
 * | 通义千问 | `qwen`       | DASHSCOPE_API_KEY | https://help.aliyun.com/zh/model-studio/developer-reference/use-qwen-by-openai-compatible-api |
 * | 小米 MiMo| `mimo`       | MIMO_API_KEY    | https://api.xiaomimimo.com                                                |
 * | MiniMax | `MiniMax`    | MiniMax_API_KEY | https://api.minimaxi.com                                                  |
 *
 * ## 与 P0 海外分支的关系
 *
 * `workspaceClassifier.probeEnvironmentVariables()` 仍负责 5 个海外 Key 的扫描
 * (Anthropic / OpenAI / Google / XAI / Cursor);本模块专注 6 个国内 Key,
 * 输出独立的 `DiscoveredDomesticProvider[]` 列表,供 UI:
 * 1. 在「未配置 Provider」面板里高亮"按环境变量一键启用"
 * 2. 在 `recommendProvider` 中作为新的二级备选(优先级 2.5,夹在 env var 与 features 之间)
 *
 * @module lib/domesticProviderEnvDiscovery
 */

import type { ProviderKind } from "~/contracts";

/**
 * 国内 Provider 与其 API Key 环境变量的映射表
 *
 * 该表是单一权威来源(SSOT),所有 6 家国内 Provider 的
 * 1. 环境变量名
 * 2. 显示名
 * 3. 默认模型(给"一键启用"时填到 `defaultModel`)
 * 都从这里派生。
 */
export interface DomesticProviderEnvSpec {
  /** ProviderKind(如 "glm") */
  provider: ProviderKind;
  /** 环境变量名 */
  envVar: string;
  /** 显示名(如 "智谱 BigModel (GLM)") */
  displayName: string;
  /** 默认模型 slug(给"一键启用"用) */
  defaultModel: string;
}

/**
 * 国内 6 家 Provider 的 env 映射 SSOT。
 *
 * 顺序即"recommendProvider 优先级":glm → deepseek → moonshot → qwen → mimo → MiniMax
 *
 * 4 家 P0(GLM/DeepSeek/Moonshot/Qwen)+ 2 家后续接入(MiMo/MiniMax)
 * 一律走同一条 OpenAI 兼容 HTTP 路径,行为完全对称,所以统一在一个 SSOT。
 *
 * ⚠️ 历史命名:曾叫 `DOMESTIC_P0_ENV_SPECS`(只有 4 家)。
 * 2026-06-25 起加入 MiMo + MiniMax,改名为 `DOMESTIC_PROVIDER_ENV_SPECS`。
 * 为兼容外部引用,**保留** `DOMESTIC_P0_ENV_SPECS` 作为同义别名(指向同一数组)。
 */
export const DOMESTIC_PROVIDER_ENV_SPECS: ReadonlyArray<DomesticProviderEnvSpec> = [
  {
    provider: "glm",
    envVar: "ZHIPU_API_KEY",
    displayName: "智谱 BigModel (GLM)",
    defaultModel: "glm-4-plus",
  },
  {
    provider: "deepseek",
    envVar: "DEEPSEEK_API_KEY",
    displayName: "深度求索 (DeepSeek)",
    defaultModel: "deepseek-chat",
  },
  {
    provider: "moonshot",
    envVar: "MOONSHOT_API_KEY",
    displayName: "月之暗面 (Kimi)",
    defaultModel: "moonshot-v1-128k",
  },
  {
    provider: "qwen",
    envVar: "DASHSCOPE_API_KEY",
    displayName: "通义千问 (Qwen)",
    defaultModel: "qwen-plus",
  },
  {
    provider: "mimo",
    envVar: "MIMO_API_KEY",
    displayName: "小米 MiMo",
    defaultModel: "mimo-v2-pro",
  },
  {
    provider: "MiniMax",
    envVar: "MiniMax_API_KEY",
    displayName: "MiniMax",
    defaultModel: "MiniMax-Text-01",
  },
];

/**
 * 历史别名:曾指代 4 家 P0 时的 spec,2026-06-25 起 6 家统一。
 * 保留它避免破坏外部 import。
 *
 * @deprecated 请改用 {@link DOMESTIC_PROVIDER_ENV_SPECS}
 */
export const DOMESTIC_P0_ENV_SPECS: ReadonlyArray<DomesticProviderEnvSpec> =
  DOMESTIC_PROVIDER_ENV_SPECS;

/**
 * 单条"已发现"记录
 */
export interface DiscoveredDomesticProvider {
  /** ProviderKind */
  provider: ProviderKind;
  /** 环境变量名(如 "ZHIPU_API_KEY") */
  envVar: string;
  /** 显示名 */
  displayName: string;
  /** 默认模型 slug */
  defaultModel: string;
  /**
   * API Key 是否为非空字符串(用户已配置)。
   * - `true`: Key 存在且非空
   * - `false`: Key 不存在或为空
   *
   * 严格意义上,"环境变量已设"是必要条件,但我们不导出 Key 本身。
   */
  hasKey: boolean;
}

/**
 * 国内 6 家 Provider 的"发现状态"
 *
 * - `discovered`: 至少一个环境变量已配置
 * - `specs`: 完整 6 家原始信息(供 UI 列表展示"未启用"项目)
 */
export interface DomesticProviderDiscovery {
  /** 已"可启用"的 Provider 列表(按 DOMESTIC_PROVIDER_ENV_SPECS 顺序) */
  discovered: DiscoveredDomesticProvider[];
  /** 6 家的完整 spec(供 UI 展示 + 排序) */
  specs: ReadonlyArray<DomesticProviderEnvSpec>;
  /** 总数(6) */
  total: number;
}

/**
 * 从环境变量映射推导国内 Provider 的"已发现"列表
 *
 * @param envVars - 与 `probeEnvironmentVariables()` 同样格式 `Record<string, boolean>`
 *                  (key 为环境变量名, value 为"是否非空存在")
 * @returns 发现状态描述,UI 拿到后即可:
 *        1. 在 onboarding 中提示"已检测到 ZHIPU_API_KEY,启用 GLM?"
 *        2. 在 Provider picker 的"已禁用"分组里展示一键启用按钮
 */
export function discoverDomesticProviders(
  envVars: Record<string, boolean>,
): DomesticProviderDiscovery {
  const discovered: DiscoveredDomesticProvider[] = [];
  for (const spec of DOMESTIC_PROVIDER_ENV_SPECS) {
    if (envVars[spec.envVar]) {
      discovered.push({
        provider: spec.provider,
        envVar: spec.envVar,
        displayName: spec.displayName,
        defaultModel: spec.defaultModel,
        hasKey: true,
      });
    }
  }
  return {
    discovered,
    specs: DOMESTIC_PROVIDER_ENV_SPECS,
    total: DOMESTIC_PROVIDER_ENV_SPECS.length,
  };
}

/**
 * 找到"第一个"已发现的国内 Provider(按 DOMESTIC_PROVIDER_ENV_SPECS 顺序)
 *
 * @param discovery - `discoverDomesticProviders` 的结果
 * @returns 第一个 discovered 项,或 null
 */
export function pickFirstDiscoveredDomestic(
  discovery: DomesticProviderDiscovery,
): DiscoveredDomesticProvider | null {
  return discovery.discovered[0] ?? null;
}
