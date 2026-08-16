/**
 * @file byok-ui.test.ts
 * @description P2-3 静态检查:自定义 Provider (BYOK) 配置 UI 必须支持全部 4 种协议
 *              (openai / anthropic / litellm / ollama),并展示协议特定 Base URL
 *              / 模型默认值与 URL 校验。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..", "..");
const src = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("P2-3 自定义 Provider BYOK UI 完整性", () => {
  const settings = src("src/routes/_chat.settings.tsx");

  it("renderCustomProviderSection 函数存在", () => {
    expect(settings).toMatch(/renderCustomProviderSection/);
  });

  it("SettingsSection 标题为 '自定义 Provider (BYOK)'", () => {
    expect(settings).toMatch(/title="自定义 Provider \(BYOK\)"/);
  });

  it("协议类型下拉框包含 4 种协议(openai / anthropic / litellm / ollama)", () => {
    expect(settings).toMatch(/SelectItem value="openai"/);
    expect(settings).toMatch(/SelectItem value="anthropic"/);
    expect(settings).toMatch(/SelectItem value="litellm"/);
    expect(settings).toMatch(/SelectItem value="ollama"/);
  });

  it("ollama 协议标识为'免 API Key'", () => {
    // 协议下拉项文案
    expect(settings).toMatch(/Ollama 本地推理 \(免 API Key\)/);
  });

  it("包含协议特定的默认 Base URL", () => {
    // openai / anthropic / litellm / ollama 各自的默认 URL
    expect(settings).toContain("https://api.openai.com/v1");
    expect(settings).toContain("https://api.anthropic.com");
    expect(settings).toContain("http://localhost:4000");
    expect(settings).toContain("http://localhost:11434");
  });

  it("包含协议特定的默认模型", () => {
    expect(settings).toContain("gpt-4o");
    expect(settings).toContain("claude-sonnet-4-20250514");
    expect(settings).toContain("llama3.2");
  });

  it("包含 Base URL 校验函数(URL 协议必须是 http/https)", () => {
    expect(settings).toMatch(/validateBaseUrl\s*=/);
    expect(settings).toMatch(/http:\/\/ 或 https:\/\//);
  });

  it("ollama 协议下,API Key 标记为可选(留空即可)", () => {
    // 表单中 ollama 分支
    expect(settings).toMatch(/API Key \{newProviderProtocol === "ollama" \? "\(\u53ef\u9009\)"/);
    expect(settings).toContain("留空即可");
  });

  it("openai / anthropic / litellm 协议下,API Key 必填", () => {
    expect(settings).toMatch(/newProviderProtocol !== "ollama" && !newProviderApiKey\.trim\(\)/);
  });

  it("输入 type=password + autoComplete=off,避免浏览器记忆 API Key", () => {
    // 提取 renderCustomProviderSection 区块,再断言包含 password / autoComplete
    const block = settings.split("renderCustomProviderSection")[1] ?? "";
    expect(block).toMatch(/type="password"/);
    expect(block).toMatch(/autoComplete="off"/);
  });

  it("Provider 列表项展示协议徽章(protocol 标签)", () => {
    const block = settings.split("renderCustomProviderSection")[1] ?? "";
    expect(block).toMatch(/uppercase tracking-wide/);
    expect(block).toMatch(/\{provider\.protocol\}/);
  });

  it("renderProvidersPanel 调用了 renderCustomProviderSection", () => {
    expect(settings).toMatch(/\{renderCustomProviderSection\(\)\}/);
  });
});

describe("P2-3 自定义 Provider Store 支持全部 4 种协议", () => {
  const store = src("src/lib/customProviderStore.ts");
  it("CustomProviderProtocol 类型包含 openai / anthropic / litellm / ollama", () => {
    expect(store).toMatch(/CustomProviderProtocol = "openai" \| "anthropic" \| "litellm" \| "ollama"/);
  });
});

describe("P2-4 Ollama 服务发现 UI 完整性", () => {
  const settings = src("src/routes/_chat.settings.tsx");
  const discovery = src("src/lib/ollamaDiscovery.ts");

  it("UI 引入了 discoverOllama 服务发现函数", () => {
    expect(settings).toMatch(/import\s*\{[^}]*discoverOllama[^}]*\}\s*from\s*"\.\.\/lib\/ollamaDiscovery"/);
  });

  it("UI 引入了 formatOllamaModelSize 用于展示模型大小", () => {
    expect(settings).toMatch(/formatOllamaModelSize/);
  });

  it("ollama 协议下展示'测试连接'按钮", () => {
    const block = settings.split("renderCustomProviderSection")[1] ?? "";
    expect(block).toMatch(/data-testid="ollama-test-connection"/);
    expect(block).toMatch(/测试连接/);
  });

  it("测试连接后展示服务状态(版本 + 模型数量)", () => {
    const block = settings.split("renderCustomProviderSection")[1] ?? "";
    expect(block).toMatch(/data-testid="ollama-probe-status"/);
    expect(block).toMatch(/Ollama v\{ollamaDiscovery\.version\}/);
  });

  it("已发现模型时,展示'从本地挑选'按钮 + 模型下拉", () => {
    const block = settings.split("renderCustomProviderSection")[1] ?? "";
    expect(block).toMatch(/data-testid="ollama-pick-model"/);
    expect(block).toMatch(/data-testid="ollama-model-dropdown"/);
  });

  it("模型下拉每条都带 size / parameterSize / quantizationLevel 元信息", () => {
    const block = settings.split("renderCustomProviderSection")[1] ?? "";
    expect(block).toMatch(/formatOllamaModelSize\(m\.size\)/);
    expect(block).toMatch(/m\.details\?\.parameterSize/);
    expect(block).toMatch(/m\.details\?\.quantizationLevel/);
  });

  it("切换到非 ollama 协议时清空探测结果", () => {
    const block = settings.split("renderCustomProviderSection")[1] ?? "";
    expect(block).toMatch(/next !== "ollama"[\s\S]*setOllamaDiscovery\(null\)/);
  });

  it("discoverOllama 默认 baseUrl 指向 http://localhost:11434", () => {
    expect(discovery).toMatch(/DEFAULT_OLLAMA_URL = "http:\/\/localhost:11434"/);
  });

  it("Tauri 模式下优先走 indexer_ollama_discover 命令(避免浏览器 CORS)", () => {
    expect(discovery).toMatch(/__TAURI_INTERNALS__/);
    expect(discovery).toMatch(/indexer_ollama_discover/);
    expect(discovery).toMatch(/loadTauriInvoke/);
  });

  it("Tauri 命令不可用时 fallback 到浏览器 fetch", () => {
    expect(discovery).toMatch(/fetchOllamaDiscoveryBrowser/);
  });

  it("snake_case 字段映射到 camelCase(版本号 / 模型名 / parameter_size)", () => {
    expect(discovery).toMatch(/parameter_size/);
    expect(discovery).toMatch(/quantization_level/);
    expect(discovery).toMatch(/modified_at/);
    expect(discovery).toMatch(/parameterSize/);
  });
});
