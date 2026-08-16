/**
 * @file workspaceClassifier.ts 单元测试
 *
 * 覆盖：
 * - recommendProvider 优先级：lastUsed > envVars > features > 第一个 installed > codex
 * - generateSmartSuggestions 5 种工作区类型
 *
 * 注：probeWorkspaceFeatures / probeProviderBinary / probeEnvironmentVariables 依赖
 * Tauri invoke，已通过 happy-dom + vi.mock 覆盖错误分支与正常分支。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  generateSmartSuggestions,
  probeEnvironmentVariables,
  probeProviderBinary,
  probeWorkspaceFeatures,
  recommendProvider,
  type ProviderBinaryProbe,
  type WorkspaceFeatures,
} from "./workspaceClassifier";
import type { ProviderKind } from "~/contracts";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

const emptyFeatures: WorkspaceFeatures = {
  hasPackageJson: false,
  hasCargoToml: false,
  hasGoMod: false,
  hasRequirementsTxt: false,
  hasPyprojectToml: false,
  hasGit: false,
  rootPath: null,
};

const nodeFeatures: WorkspaceFeatures = { ...emptyFeatures, hasPackageJson: true };
const rustFeatures: WorkspaceFeatures = { ...emptyFeatures, hasCargoToml: true };
const goFeatures: WorkspaceFeatures = { ...emptyFeatures, hasGoMod: true };
const pythonFeatures: WorkspaceFeatures = { ...emptyFeatures, hasRequirementsTxt: true };
const pyprojectFeatures: WorkspaceFeatures = { ...emptyFeatures, hasPyprojectToml: true };

const installedList = (providers: ProviderKind[]): ProviderBinaryProbe[] =>
  providers.map((p) => ({ provider: p, installed: true, binaryPath: `/usr/bin/${p}` }));

beforeEach(() => {
  mockInvoke.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("recommendProvider", () => {
  it("优先级 1：lastUsed 已安装 → lastUsed", () => {
    const result = recommendProvider({
      features: emptyFeatures,
      envVars: {},
      lastUsedProvider: "codex",
      installedProviders: installedList(["codex"]),
    });
    expect(result.provider).toBe("codex");
    expect(result.reason).toMatch(/上次使用/);
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it("lastUsed 未安装时不走 lastUsed 分支", () => {
    const result = recommendProvider({
      features: emptyFeatures,
      envVars: {},
      lastUsedProvider: "codex",
      installedProviders: [],
    });
    // 兜底到 codex
    expect(result.provider).toBe("codex");
    expect(result.confidence).toBeLessThan(0.6);
  });

  it("优先级 2：ANTHROPIC_API_KEY + claudeAgent 已安装", () => {
    const result = recommendProvider({
      features: emptyFeatures,
      envVars: { ANTHROPIC_API_KEY: true },
      lastUsedProvider: null,
      installedProviders: installedList(["claudeAgent"]),
    });
    expect(result.provider).toBe("claudeAgent");
    expect(result.reason).toMatch(/ANTHROPIC/);
  });

  it("优先级 2：OPENAI_API_KEY + codex 已安装", () => {
    const result = recommendProvider({
      features: emptyFeatures,
      envVars: { OPENAI_API_KEY: true },
      lastUsedProvider: null,
      installedProviders: installedList(["codex"]),
    });
    expect(result.provider).toBe("codex");
    expect(result.reason).toMatch(/OPENAI/);
  });

  it("优先级 2：GOOGLE_API_KEY + gemini 已安装", () => {
    const result = recommendProvider({
      features: emptyFeatures,
      envVars: { GOOGLE_API_KEY: true },
      lastUsedProvider: null,
      installedProviders: installedList(["gemini"]),
    });
    expect(result.provider).toBe("gemini");
    expect(result.reason).toMatch(/GOOGLE/);
  });

  it("优先级 3：Node 项目 + codex 已安装", () => {
    const result = recommendProvider({
      features: nodeFeatures,
      envVars: {},
      lastUsedProvider: null,
      installedProviders: installedList(["codex"]),
    });
    expect(result.provider).toBe("codex");
    expect(result.reason).toMatch(/Node/);
  });

  it("优先级 3：Rust 项目 + claudeAgent 已安装", () => {
    const result = recommendProvider({
      features: rustFeatures,
      envVars: {},
      lastUsedProvider: null,
      installedProviders: installedList(["claudeAgent"]),
    });
    expect(result.provider).toBe("claudeAgent");
    expect(result.reason).toMatch(/Rust/);
  });

  it("优先级 3：Go 项目 + codex 已安装", () => {
    const result = recommendProvider({
      features: goFeatures,
      envVars: {},
      lastUsedProvider: null,
      installedProviders: installedList(["codex"]),
    });
    expect(result.provider).toBe("codex");
    expect(result.reason).toMatch(/Go/);
  });

  it("优先级 3：Python（requirements.txt）+ claudeAgent 已安装", () => {
    const result = recommendProvider({
      features: pythonFeatures,
      envVars: {},
      lastUsedProvider: null,
      installedProviders: installedList(["claudeAgent"]),
    });
    expect(result.provider).toBe("claudeAgent");
    expect(result.reason).toMatch(/Python/);
  });

  it("优先级 3：Python（pyproject.toml）→ codex 已安装", () => {
    const result = recommendProvider({
      features: pyprojectFeatures,
      envVars: {},
      lastUsedProvider: null,
      installedProviders: installedList(["codex"]),
    });
    expect(result.provider).toBe("codex");
  });

  it("优先级 4：所有特征都没命中时使用第一个 installed", () => {
    const result = recommendProvider({
      features: emptyFeatures,
      envVars: {},
      lastUsedProvider: null,
      installedProviders: installedList(["grok", "cursor"]),
    });
    expect(result.provider).toBe("grok");
    expect(result.reason).toMatch(/默认/);
  });

  it("优先级 5：兜底 codex（无任何 installed）", () => {
    const result = recommendProvider({
      features: emptyFeatures,
      envVars: {},
      lastUsedProvider: null,
      installedProviders: [],
    });
    expect(result.provider).toBe("codex");
    expect(result.confidence).toBe(0.3);
    expect(result.reason).toMatch(/兜底/);
  });

  it("每次返回 mode='code'", () => {
    const result = recommendProvider({
      features: emptyFeatures,
      envVars: {},
      lastUsedProvider: null,
      installedProviders: [],
    });
    expect(result.mode).toBe("code");
  });

  it("每次返回 discoveredAlternatives 字段(允许为空数组)", () => {
    const result = recommendProvider({
      features: emptyFeatures,
      envVars: {},
      lastUsedProvider: null,
      installedProviders: [],
    });
    expect(Array.isArray(result.discoveredAlternatives)).toBe(true);
  });
});

describe("recommendProvider - P1-2 国内 4 家 P0 自发现", () => {
  it("优先级 2.5: ZHIPU_API_KEY 命中 → glm(无需 installed)", () => {
    const result = recommendProvider({
      features: emptyFeatures,
      envVars: { ZHIPU_API_KEY: true },
      lastUsedProvider: null,
      installedProviders: [], // 即使没装任何二进制,国内 6 家仍可推荐
    });
    expect(result.provider).toBe("glm");
    expect(result.confidence).toBe(0.85);
    expect(result.reason).toMatch(/ZHIPU_API_KEY/);
    expect(result.reason).toMatch(/GLM/);
  });

  it("优先级 2.5: DEEPSEEK_API_KEY 命中 → deepseek", () => {
    const result = recommendProvider({
      features: emptyFeatures,
      envVars: { DEEPSEEK_API_KEY: true },
      lastUsedProvider: null,
      installedProviders: [],
    });
    expect(result.provider).toBe("deepseek");
    expect(result.confidence).toBe(0.85);
  });

  it("优先级 2.5: MOONSHOT_API_KEY 命中 → moonshot", () => {
    const result = recommendProvider({
      features: emptyFeatures,
      envVars: { MOONSHOT_API_KEY: true },
      lastUsedProvider: null,
      installedProviders: [],
    });
    expect(result.provider).toBe("moonshot");
    expect(result.confidence).toBe(0.85);
  });

  it("优先级 2.5: DASHSCOPE_API_KEY 命中 → qwen", () => {
    const result = recommendProvider({
      features: emptyFeatures,
      envVars: { DASHSCOPE_API_KEY: true },
      lastUsedProvider: null,
      installedProviders: [],
    });
    expect(result.provider).toBe("qwen");
    expect(result.confidence).toBe(0.85);
  });

  it("优先级 2.5: MIMO_API_KEY 命中 → mimo(无 installed 检查)", () => {
    const result = recommendProvider({
      features: emptyFeatures,
      envVars: { MIMO_API_KEY: true },
      lastUsedProvider: null,
      installedProviders: [],
    });
    expect(result.provider).toBe("mimo");
    expect(result.confidence).toBe(0.85);
    expect(result.reason).toMatch(/MIMO_API_KEY/);
  });

  it("优先级 2.5: MiniMax_API_KEY 命中 → MiniMax(无 installed 检查)", () => {
    const result = recommendProvider({
      features: emptyFeatures,
      envVars: { MiniMax_API_KEY: true },
      lastUsedProvider: null,
      installedProviders: [],
    });
    expect(result.provider).toBe("MiniMax");
    expect(result.confidence).toBe(0.85);
    expect(result.reason).toMatch(/MiniMax_API_KEY/);
  });

  it("6 家全有 → 按 spec 顺序推 glm(discoveredAlternatives 含其余 5 家)", () => {
    const result = recommendProvider({
      features: emptyFeatures,
      envVars: {
        ZHIPU_API_KEY: true,
        DEEPSEEK_API_KEY: true,
        MOONSHOT_API_KEY: true,
        DASHSCOPE_API_KEY: true,
        MIMO_API_KEY: true,
        MiniMax_API_KEY: true,
      },
      lastUsedProvider: null,
      installedProviders: [],
    });
    expect(result.provider).toBe("glm");
    const altProviders = result.discoveredAlternatives.map((d) => d.provider);
    expect(altProviders).toEqual([
      "deepseek",
      "moonshot",
      "qwen",
      "mimo",
      "MiniMax",
    ]);
  });

  it("只 mimo + MiniMax → 推 mimo(按 spec 顺序),alternatives=[MiniMax]", () => {
    const result = recommendProvider({
      features: emptyFeatures,
      envVars: { MIMO_API_KEY: true, MiniMax_API_KEY: true },
      lastUsedProvider: null,
      installedProviders: [],
    });
    expect(result.provider).toBe("mimo");
    expect(result.discoveredAlternatives.map((d) => d.provider)).toEqual([
      "MiniMax",
    ]);
  });

  it("国内 4 家都有 + MiMo 单独 → 推 glm(因为 glm 排第一),alternatives 包含 MiMo", () => {
    const result = recommendProvider({
      features: emptyFeatures,
      envVars: {
        ZHIPU_API_KEY: true,
        DEEPSEEK_API_KEY: true,
        MOONSHOT_API_KEY: true,
        DASHSCOPE_API_KEY: true,
        MIMO_API_KEY: true,
      },
      lastUsedProvider: null,
      installedProviders: [],
    });
    expect(result.provider).toBe("glm");
    const altProviders = result.discoveredAlternatives.map((d) => d.provider);
    expect(altProviders).toContain("mimo");
  });

  it("只 DEEPSEEK + MOONSHOT → 推 deepseek,alternatives=[moonshot]", () => {
    const result = recommendProvider({
      features: emptyFeatures,
      envVars: { DEEPSEEK_API_KEY: true, MOONSHOT_API_KEY: true },
      lastUsedProvider: null,
      installedProviders: [],
    });
    expect(result.provider).toBe("deepseek");
    expect(result.discoveredAlternatives.map((d) => d.provider)).toEqual(["moonshot"]);
  });

  it("海外 ANTHROPIC_API_KEY 优先级高于国内 6 家", () => {
    const result = recommendProvider({
      features: emptyFeatures,
      envVars: { ANTHROPIC_API_KEY: true, ZHIPU_API_KEY: true },
      lastUsedProvider: null,
      installedProviders: installedList(["claudeAgent"]),
    });
    expect(result.provider).toBe("claudeAgent");
    // glm 应在 discoveredAlternatives 里
    expect(result.discoveredAlternatives.map((d) => d.provider)).toContain("glm");
  });

  it("海外 OPENAI_API_KEY 优先级高于国内 4 家", () => {
    const result = recommendProvider({
      features: emptyFeatures,
      envVars: { OPENAI_API_KEY: true, DEEPSEEK_API_KEY: true },
      lastUsedProvider: null,
      installedProviders: installedList(["codex"]),
    });
    expect(result.provider).toBe("codex");
    expect(result.discoveredAlternatives.map((d) => d.provider)).toContain("deepseek");
  });

  it("国内 6 家 P0 优先级高于工作区特征(无 lastUsed/海外 env)", () => {
    // Node.js 项目 + ZHIPU_API_KEY,但没装 codex/claudeAgent 二进制
    // → 应该走国内 6 家分支,而非"无 installed 兜底到 codex"
    const result = recommendProvider({
      features: nodeFeatures,
      envVars: { ZHIPU_API_KEY: true },
      lastUsedProvider: null,
      installedProviders: [],
    });
    expect(result.provider).toBe("glm");
    expect(result.confidence).toBe(0.85);
  });

  it("lastUsed=glm + ZHIPU_API_KEY 命中 → glm(discoveredAlternatives=[])", () => {
    // 即使 ZHIPU_API_KEY 是来源,lastUsed 优先级更高
    // 但 glm 自身就是 lastUsed,所以 discoveredAlternatives 应为空
    // 关键点:此处没装 glm 二进制,因为 glm 没二进制
    // 但我们假设用户能直接使用(因为是纯 HTTP Provider)
    const result = recommendProvider({
      features: emptyFeatures,
      envVars: { ZHIPU_API_KEY: true },
      lastUsedProvider: "glm",
      installedProviders: installedList(["glm"]),
    });
    expect(result.provider).toBe("glm");
    expect(result.discoveredAlternatives).toEqual([]);
  });

  it("没命中任何 env 时 discoveredAlternatives=[]", () => {
    const result = recommendProvider({
      features: emptyFeatures,
      envVars: { ANTHROPIC_API_KEY: true },
      lastUsedProvider: null,
      installedProviders: installedList(["claudeAgent"]),
    });
    expect(result.discoveredAlternatives).toEqual([]);
  });

  it("兜底分支:无 env + 无 installed → 推 codex,alternatives=[]", () => {
    const result = recommendProvider({
      features: emptyFeatures,
      envVars: {},
      lastUsedProvider: null,
      installedProviders: [],
    });
    expect(result.provider).toBe("codex");
    expect(result.discoveredAlternatives).toEqual([]);
  });
});

describe("generateSmartSuggestions", () => {
  it("Node 项目 → package.json 相关", () => {
    const suggestions = generateSmartSuggestions(nodeFeatures);
    expect(suggestions).toHaveLength(3);
    expect(suggestions[0]).toMatch(/package\.json/);
  });

  it("Rust 项目 → Cargo.toml 相关", () => {
    const suggestions = generateSmartSuggestions(rustFeatures);
    expect(suggestions).toHaveLength(3);
    expect(suggestions[0]).toMatch(/Rust/);
  });

  it("Go 项目 → go.mod 相关", () => {
    const suggestions = generateSmartSuggestions(goFeatures);
    expect(suggestions).toHaveLength(3);
    expect(suggestions[0]).toMatch(/Go/);
  });

  it("Python（requirements.txt）项目", () => {
    const suggestions = generateSmartSuggestions(pythonFeatures);
    expect(suggestions).toHaveLength(3);
    expect(suggestions[0]).toMatch(/Python/);
  });

  it("Python（pyproject.toml）项目", () => {
    const suggestions = generateSmartSuggestions(pyprojectFeatures);
    expect(suggestions).toHaveLength(3);
    expect(suggestions[0]).toMatch(/Python/);
  });

  it("空工作区 → 通用建议", () => {
    const suggestions = generateSmartSuggestions(emptyFeatures);
    expect(suggestions).toHaveLength(3);
    expect(suggestions[0]).toMatch(/结构|文档|质量/);
  });

  it("返回数组始终 <= 3 条", () => {
    const features: WorkspaceFeatures = { ...emptyFeatures, hasPackageJson: true };
    expect(generateSmartSuggestions(features).length).toBeLessThanOrEqual(3);
  });
});

describe("probeWorkspaceFeatures", () => {
  it("rootPath=null → 全 false 的空特征", async () => {
    const features = await probeWorkspaceFeatures(null);
    expect(features.hasPackageJson).toBe(false);
    expect(features.rootPath).toBeNull();
  });

  it("rootPath 有效时并行调用 fs_exists 6 次", async () => {
    mockInvoke.mockResolvedValue(false);
    await probeWorkspaceFeatures("/repo");
    expect(mockInvoke).toHaveBeenCalledTimes(6);
  });

  it("正常路径：成功返回 6 个探测结果", async () => {
    mockInvoke
      .mockResolvedValueOnce(true) // package.json
      .mockResolvedValueOnce(false) // Cargo.toml
      .mockResolvedValueOnce(true) // go.mod
      .mockResolvedValueOnce(false) // requirements.txt
      .mockResolvedValueOnce(false) // pyproject.toml
      .mockResolvedValueOnce(true); // .git
    const features = await probeWorkspaceFeatures("/repo");
    expect(features.hasPackageJson).toBe(true);
    expect(features.hasGoMod).toBe(true);
    expect(features.hasGit).toBe(true);
    expect(features.hasCargoToml).toBe(false);
  });

  it("invoke 抛错时降级返回全 false", async () => {
    mockInvoke.mockRejectedValue(new Error("network down"));
    const features = await probeWorkspaceFeatures("/repo");
    expect(features.hasPackageJson).toBe(false);
    expect(features.rootPath).toBe("/repo");
  });
});

describe("probeProviderBinary", () => {
  it("customBinaryPath 存在且 fs_exists=true → installed=true", async () => {
    mockInvoke.mockResolvedValueOnce(true);
    const result = await probeProviderBinary("codex", "/usr/local/codex");
    expect(result.installed).toBe(true);
    expect(result.binaryPath).toBe("/usr/local/codex");
  });

  it("customBinaryPath 存在但 fs_exists=false → installed=false", async () => {
    mockInvoke.mockResolvedValueOnce(false);
    const result = await probeProviderBinary("codex", "/missing/codex");
    expect(result.installed).toBe(false);
    expect(result.binaryPath).toBeNull();
  });

  it("customBinaryPath 为空字符串时探测系统 PATH", async () => {
    mockInvoke.mockResolvedValueOnce("/usr/bin/codex");
    const result = await probeProviderBinary("codex", "");
    expect(result.installed).toBe(true);
    expect(result.binaryPath).toBe("/usr/bin/codex");
  });

  it("无 customBinaryPath 时探测系统 PATH", async () => {
    mockInvoke.mockResolvedValueOnce("/usr/bin/claude");
    const result = await probeProviderBinary("claudeAgent");
    expect(result.installed).toBe(true);
    expect(result.binaryPath).toBe("/usr/bin/claude");
  });

  it("fs_which 返回 null → installed=false", async () => {
    mockInvoke.mockResolvedValueOnce(null);
    const result = await probeProviderBinary("gemini");
    expect(result.installed).toBe(false);
    expect(result.binaryPath).toBeNull();
  });

  it("fs_which 抛错 → installed=false", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("err"));
    const result = await probeProviderBinary("gemini");
    expect(result.installed).toBe(false);
  });
});

describe("probeEnvironmentVariables", () => {
  it("全部存在时返回全 true", async () => {
    mockInvoke.mockResolvedValue("value");
    const result = await probeEnvironmentVariables();
    expect(result.ANTHROPIC_API_KEY).toBe(true);
    expect(result.OPENAI_API_KEY).toBe(true);
    expect(result.GOOGLE_API_KEY).toBe(true);
    expect(result.XAI_API_KEY).toBe(true);
    expect(result.CURSOR_API_KEY).toBe(true);
  });

  it("P1-2: 6 家国内 env var 也被扫描", async () => {
    mockInvoke.mockResolvedValue("value");
    const result = await probeEnvironmentVariables();
    expect(result.ZHIPU_API_KEY).toBe(true);
    expect(result.DEEPSEEK_API_KEY).toBe(true);
    expect(result.MOONSHOT_API_KEY).toBe(true);
    expect(result.DASHSCOPE_API_KEY).toBe(true);
    expect(result.MIMO_API_KEY).toBe(true);
    expect(result.MiniMax_API_KEY).toBe(true);
  });

  it("P1-2: 6 家国内全 false → result 中 6 个 key 都在且都是 false", async () => {
    mockInvoke.mockResolvedValue(null);
    const result = await probeEnvironmentVariables();
    expect(result.ZHIPU_API_KEY).toBe(false);
    expect(result.DEEPSEEK_API_KEY).toBe(false);
    expect(result.MOONSHOT_API_KEY).toBe(false);
    expect(result.DASHSCOPE_API_KEY).toBe(false);
    expect(result.MIMO_API_KEY).toBe(false);
    expect(result.MiniMax_API_KEY).toBe(false);
  });

  it("env_get 返回 null → false", async () => {
    mockInvoke.mockResolvedValue(null);
    const result = await probeEnvironmentVariables();
    expect(result.ANTHROPIC_API_KEY).toBe(false);
  });

  it("env_get 返回空字符串 → false", async () => {
    mockInvoke.mockResolvedValue("   ");
    const result = await probeEnvironmentVariables();
    expect(result.ANTHROPIC_API_KEY).toBe(false);
  });

  it("env_get 抛错 → false", async () => {
    mockInvoke.mockRejectedValue(new Error("err"));
    const result = await probeEnvironmentVariables();
    expect(result.ANTHROPIC_API_KEY).toBe(false);
  });

  it("P1-2: 扫描总数 11 个 env var(5 海外 + 6 国内)", async () => {
    mockInvoke.mockResolvedValue("v");
    await probeEnvironmentVariables();
    // 5 海外 + 6 国内 = 11
    expect(mockInvoke).toHaveBeenCalledTimes(11);
  });
});
