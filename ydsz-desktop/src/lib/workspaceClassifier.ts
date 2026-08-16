/**
 * @file 工作区分类器
 * @description 根据工作区特征自动推断默认 Provider 和模式
 *
 * 探测逻辑：
 * 1. 用户上次使用 → 优先用（从 appSettings 读取）
 * 2. 环境变量(海外) → 优先用（ANTHROPIC_API_KEY/OPENAI_API_KEY/...）
 * 2.5. 环境变量(国内 6 家) → 次优(ZHIPU/DEEPSEEK/MOONSHOT/DASHSCOPE/MIMO/MiniMax)
 * 3. 工作区特征 → 推断模式（package.json → Code 模式）
 * 4. 本机已安装 Provider → 优先用（二进制路径探测）
 *
 * ## P1-2:国内 Provider 自发现
 *
 * 6 家国内 Provider(智谱 GLM / DeepSeek / Moonshot / Qwen / 小米 MiMo / MiniMax)
 * 无客户端二进制,唯一可用性信号就是 API Key 环境变量。本分类器把它们视作
 * "已通过环境变量发现"的 Provider,在 `recommendProvider` 中作为
 * 海外 env var 失败后的备选,避免"装好系统但完全没法用"的情况。
 *
 * 详细发现规则见 `domesticProviderEnvDiscovery.ts`。
 */

import { invoke } from "@tauri-apps/api/core";
import type { ProviderKind, RuntimeMode } from "~/contracts";
import {
  DOMESTIC_PROVIDER_ENV_SPECS,
  discoverDomesticProviders,
  pickFirstDiscoveredDomestic,
  type DiscoveredDomesticProvider,
} from "./domesticProviderEnvDiscovery";

/** 国内 6 家 Provider 的环境变量名(常量数组,SSOT 来自 domesticProviderEnvDiscovery) */
export const DOMESTIC_P0_ENV_VARS: ReadonlyArray<string> = DOMESTIC_PROVIDER_ENV_SPECS.map(
  (spec) => spec.envVar,
);

/** 工作区分类结果 */
export interface WorkspaceClassification {
  /** 推荐 Provider */
  provider: ProviderKind;
  /** 推荐模式 */
  mode: RuntimeMode;
  /** 置信度 (0-1) */
  confidence: number;
  /** 推荐原因 */
  reason: string;
  /**
   * 已被环境变量发现但**未**被推荐为首选的国内 P0 Provider 列表。
   *
   * 场景:用户装了 ZHIPU_API_KEY + ANTHROPIC_API_KEY,recommendProvider 会推
   * claudeAgent(优先级 2),但 glm 仍要被前端展示"已检测到 GLM,启用?",
   * 方便用户一键切到国内 Provider(零网络成本)。UI 据此渲染提示条/一键按钮。
   */
  discoveredAlternatives: ReadonlyArray<DiscoveredDomesticProvider>;
}

/** 工作区特征 */
export interface WorkspaceFeatures {
  /** 是否有 package.json */
  hasPackageJson: boolean;
  /** 是否有 Cargo.toml */
  hasCargoToml: boolean;
  /** 是否有 go.mod */
  hasGoMod: boolean;
  /** 是否有 requirements.txt */
  hasRequirementsTxt: boolean;
  /** 是否有 pyproject.toml */
  hasPyprojectToml: boolean;
  /** 是否有 .git 目录 */
  hasGit: boolean;
  /** 项目根目录 */
  rootPath: string | null;
}

/** Provider 二进制探测结果 */
export interface ProviderBinaryProbe {
  provider: ProviderKind;
  installed: boolean;
  binaryPath: string | null;
}

/**
 * 探测工作区特征
 * @param rootPath - 工作区根目录
 * @returns 工作区特征
 */
export async function probeWorkspaceFeatures(rootPath: string | null): Promise<WorkspaceFeatures> {
  if (!rootPath) {
    return {
      hasPackageJson: false,
      hasCargoToml: false,
      hasGoMod: false,
      hasRequirementsTxt: false,
      hasPyprojectToml: false,
      hasGit: false,
      rootPath: null,
    };
  }

  try {
    const [hasPackageJson, hasCargoToml, hasGoMod, hasRequirementsTxt, hasPyprojectToml, hasGit] =
      await Promise.all([
        invoke<boolean>("fs_exists", { path: `${rootPath}/package.json` }),
        invoke<boolean>("fs_exists", { path: `${rootPath}/Cargo.toml` }),
        invoke<boolean>("fs_exists", { path: `${rootPath}/go.mod` }),
        invoke<boolean>("fs_exists", { path: `${rootPath}/requirements.txt` }),
        invoke<boolean>("fs_exists", { path: `${rootPath}/pyproject.toml` }),
        invoke<boolean>("fs_exists", { path: `${rootPath}/.git` }),
      ]);

    return {
      hasPackageJson,
      hasCargoToml,
      hasGoMod,
      hasRequirementsTxt,
      hasPyprojectToml,
      hasGit,
      rootPath,
    };
  } catch (error) {
    console.error("Failed to probe workspace features:", error);
    return {
      hasPackageJson: false,
      hasCargoToml: false,
      hasGoMod: false,
      hasRequirementsTxt: false,
      hasPyprojectToml: false,
      hasGit: false,
      rootPath,
    };
  }
}

/**
 * 探测 Provider 二进制是否已安装
 * @param provider - Provider 类型
 * @param customBinaryPath - 自定义二进制路径（从 appSettings）
 * @returns 探测结果
 */
export async function probeProviderBinary(
  provider: ProviderKind,
  customBinaryPath?: string,
): Promise<ProviderBinaryProbe> {
  // 如果用户配置了自定义路径，优先使用
  if (customBinaryPath && customBinaryPath.trim().length > 0) {
    try {
      const exists = await invoke<boolean>("fs_exists", { path: customBinaryPath });
      return {
        provider,
        installed: exists,
        binaryPath: exists ? customBinaryPath : null,
      };
    } catch {
      return { provider, installed: false, binaryPath: null };
    }
  }

  // 否则探测系统 PATH
  //
  // 6 家国内 P0(智谱/DeepSeek/Moonshot/Qwen/Mimo/MiniMax)没有 CLI 二进制,
  // 它们是纯 HTTP 兼容端点,通过 `probeEnvironmentVariables` 发现;此处
  // 不参与 fs_which 探测。
  const binaryNames: Partial<Record<ProviderKind, string>> = {
    codex: "codex",
    claudeAgent: "claude",
    cursor: "cursor",
    gemini: "gemini",
    grok: "grok",
    kilo: "kilo",
    opencode: "opencode",
    pi: "pi",
  };

  const binaryName = binaryNames[provider];
  if (!binaryName) {
    // 国内 P0 等无二进制 Provider:不再探测 PATH,直接返回未安装
    // (它们的可用性靠 `probeEnvironmentVariables` 决定,见 `recommendProvider`)
    return { provider, installed: false, binaryPath: null };
  }

  try {
    const whichResult = await invoke<string | null>("fs_which", { name: binaryName });
    return {
      provider,
      installed: whichResult !== null,
      binaryPath: whichResult,
    };
  } catch {
    return { provider, installed: false, binaryPath: null };
  }
}

/**
 * 探测环境变量
 *
 * 扫描的 11 个环境变量分两组:
 * - 海外 5 家(ANTHROPIC / OPENAI / GOOGLE / XAI / CURSOR)→ 老逻辑
 * - 国内 6 家(ZHIPU / DEEPSEEK / MOONSHOT / DASHSCOPE / MIMO / MiniMax)→ P1-2
 *
 * 国内 Key 列表来自 `DOMESTIC_PROVIDER_ENV_SPECS`,自动与 SSOT 同步:
 * 后续接入新国内 Provider 时,只需在 domesticProviderEnvDiscovery.ts 添一行。
 *
 * @returns 环境变量映射,key 为环境变量名,value 为"是否非空存在"
 */
export async function probeEnvironmentVariables(): Promise<Record<string, boolean>> {
  const envVars = [
    // 海外
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "GOOGLE_API_KEY",
    "XAI_API_KEY",
    "CURSOR_API_KEY",
    // 国内 6 家(从 DOMESTIC_PROVIDER_ENV_SPECS 自动展开,2026-06-25 起含 MiMo + MiniMax)
    ...DOMESTIC_PROVIDER_ENV_SPECS.map((spec) => spec.envVar),
  ];

  const result: Record<string, boolean> = {};

  for (const envVar of envVars) {
    try {
      const value = await invoke<string | null>("env_get", { name: envVar });
      result[envVar] = value !== null && value.trim().length > 0;
    } catch {
      result[envVar] = false;
    }
  }

  return result;
}

/**
 * 根据工作区特征推荐 Provider
 *
 * 优先级链(P1-2 之后):
 * 1. 用户上次使用(已安装) → 0.95
 * 2. 海外 env var 命中(Anthropic/OpenAI/Google) → 0.9
 * 2.5 国内 P0 env var 命中(智谱/DeepSeek/Moonshot/Qwen) → 0.85
 * 3. 工作区特征 → 0.8
 * 4. 第一个已安装 Provider → 0.5
 * 5. 兜底 codex → 0.3
 *
 * @param options - 推荐输入
 * @param options.features - 工作区特征
 * @param options.envVars - 环境变量(已包含 5 海外 + 4 国内 P0)
 * @param options.lastUsedProvider - 用户上次使用的 Provider
 * @param options.installedProviders - 已安装的 Provider 列表
 * @returns 推荐结果,含 `discoveredAlternatives` 给 UI 渲染"已发现但未推荐"的国内 P0 列表
 */
export function recommendProvider(options: {
  features: WorkspaceFeatures;
  envVars: Record<string, boolean>;
  lastUsedProvider: ProviderKind | null;
  installedProviders: ProviderBinaryProbe[];
}): WorkspaceClassification {
  const { features, envVars, lastUsedProvider, installedProviders } = options;
  const discovery = discoverDomesticProviders(envVars);

  // 1. 用户上次使用 → 最高优先级
  if (lastUsedProvider) {
    const isInstalled = installedProviders.find((p) => p.provider === lastUsedProvider)?.installed;
    if (isInstalled) {
      return {
        provider: lastUsedProvider,
        mode: "code",
        confidence: 0.95,
        reason: "基于上次使用",
        discoveredAlternatives: discovery.discovered.filter((d) => d.provider !== lastUsedProvider),
      };
    }
  }

  // 2. 海外 env var → 高优先级
  if (envVars.ANTHROPIC_API_KEY) {
    const claudeInstalled = installedProviders.find((p) => p.provider === "claudeAgent")?.installed;
    if (claudeInstalled) {
      return {
        provider: "claudeAgent",
        mode: "code",
        confidence: 0.9,
        reason: "检测到 ANTHROPIC_API_KEY",
        discoveredAlternatives: discovery.discovered,
      };
    }
  }

  if (envVars.OPENAI_API_KEY) {
    const codexInstalled = installedProviders.find((p) => p.provider === "codex")?.installed;
    if (codexInstalled) {
      return {
        provider: "codex",
        mode: "code",
        confidence: 0.9,
        reason: "检测到 OPENAI_API_KEY",
        discoveredAlternatives: discovery.discovered,
      };
    }
  }

  if (envVars.GOOGLE_API_KEY) {
    const geminiInstalled = installedProviders.find((p) => p.provider === "gemini")?.installed;
    if (geminiInstalled) {
      return {
        provider: "gemini",
        mode: "code",
        confidence: 0.9,
        reason: "检测到 GOOGLE_API_KEY",
        discoveredAlternatives: discovery.discovered,
      };
    }
  }

  // 2.5 P1-2: 国内 6 家 Provider env var → 次优
  //
  // 与海外不同,国内 6 家无客户端二进制,**不需要 installed 检查**;
  // env var 命中即视为"可用"(实际可用性由 ProviderSession 启动时校验)。
  // 按 DOMESTIC_PROVIDER_ENV_SPECS 顺序(glm → deepseek → moonshot → qwen
  // → mimo → MiniMax)挑选第一个。
  const domesticPick = pickFirstDiscoveredDomestic(discovery);
  if (domesticPick) {
    return {
      provider: domesticPick.provider,
      mode: "code",
      confidence: 0.85,
      reason: `检测到 ${domesticPick.envVar} → ${domesticPick.displayName}`,
      discoveredAlternatives: discovery.discovered.filter(
        (d) => d.provider !== domesticPick.provider,
      ),
    };
  }

  // 3. 工作区特征 → 推断模式
  if (features.hasPackageJson) {
    // Node.js 项目 → 推荐 codex 或 claudeAgent
    const preferredProvider = installedProviders.find(
      (p) => p.installed && (p.provider === "codex" || p.provider === "claudeAgent"),
    );
    if (preferredProvider) {
      return {
        provider: preferredProvider.provider,
        mode: "code",
        confidence: 0.8,
        reason: "检测到 Node.js 项目 (package.json)",
        discoveredAlternatives: discovery.discovered,
      };
    }
  }

  if (features.hasCargoToml) {
    // Rust 项目 → 推荐 claudeAgent
    const claudeInstalled = installedProviders.find(
      (p) => p.installed && p.provider === "claudeAgent",
    );
    if (claudeInstalled) {
      return {
        provider: "claudeAgent",
        mode: "code",
        confidence: 0.8,
        reason: "检测到 Rust 项目 (Cargo.toml)",
        discoveredAlternatives: discovery.discovered,
      };
    }
  }

  if (features.hasGoMod) {
    // Go 项目 → 推荐 codex
    const codexInstalled = installedProviders.find((p) => p.installed && p.provider === "codex");
    if (codexInstalled) {
      return {
        provider: "codex",
        mode: "code",
        confidence: 0.8,
        reason: "检测到 Go 项目 (go.mod)",
        discoveredAlternatives: discovery.discovered,
      };
    }
  }

  if (features.hasRequirementsTxt || features.hasPyprojectToml) {
    // Python 项目 → 推荐 claudeAgent 或 codex
    const preferredProvider = installedProviders.find(
      (p) => p.installed && (p.provider === "claudeAgent" || p.provider === "codex"),
    );
    if (preferredProvider) {
      return {
        provider: preferredProvider.provider,
        mode: "code",
        confidence: 0.8,
        reason: "检测到 Python 项目",
        discoveredAlternatives: discovery.discovered,
      };
    }
  }

  // 4. 默认：使用第一个已安装的 Provider
  const firstInstalled = installedProviders.find((p) => p.installed);
  if (firstInstalled) {
    return {
      provider: firstInstalled.provider,
      mode: "code",
      confidence: 0.5,
      reason: "使用默认已安装 Provider",
      discoveredAlternatives: discovery.discovered,
    };
  }

  // 5. 兜底：使用 codex
  return {
    provider: "codex",
    mode: "code",
    confidence: 0.3,
    reason: "兜底默认值",
    discoveredAlternatives: discovery.discovered,
  };
}

/**
 * 生成智能提示（根据工作区类型）
 * @param features - 工作区特征
 * @returns 3 条提示
 */
export function generateSmartSuggestions(features: WorkspaceFeatures): string[] {
  const suggestions: string[] = [];

  if (features.hasPackageJson) {
    suggestions.push("分析 package.json 依赖并检查安全漏洞");
    suggestions.push("生成 TypeScript 类型定义");
    suggestions.push("优化构建配置");
  } else if (features.hasCargoToml) {
    suggestions.push("分析 Rust 代码性能瓶颈");
    suggestions.push("生成单元测试");
    suggestions.push("检查内存安全问题");
  } else if (features.hasGoMod) {
    suggestions.push("优化 Go 并发模式");
    suggestions.push("生成 API 文档");
    suggestions.push("检查错误处理");
  } else if (features.hasRequirementsTxt || features.hasPyprojectToml) {
    suggestions.push("分析 Python 依赖兼容性");
    suggestions.push("生成类型注解");
    suggestions.push("优化性能瓶颈");
  } else {
    suggestions.push("帮我理解这个项目的结构");
    suggestions.push("生成项目文档");
    suggestions.push("检查代码质量问题");
  }

  return suggestions.slice(0, 3);
}
