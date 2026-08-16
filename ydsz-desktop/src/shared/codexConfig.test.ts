/**
 * @file codexConfig.ts 单元测试
 *
 * 覆盖：
 * 1. parseCodexConfigModelProvider - 解析 model_provider
 * 2. parseCodexConfigProviderEnvKey - 解析特定 Provider 的 env_key
 * 3. parseCodexConfigActiveProviderEnvKey - 解析激活 Provider 的 env_key
 * 4. resolveCodexHome - 解析 CODEX_HOME 路径
 * 5. readCodexConfigContent - 读取配置文件内容
 * 6. readActiveCodexProviderEnvKey - 读取激活 Provider 的 env_key
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  parseCodexConfigActiveProviderEnvKey,
  parseCodexConfigModelProvider,
  parseCodexConfigProviderEnvKey,
  readActiveCodexProviderEnvKey,
  readCodexConfigContent,
  resolveCodexHome,
} from "./codexConfig";

describe("codexConfig", () => {
  describe("parseCodexConfigModelProvider", () => {
    it("从顶层 model_provider 字段读取", () => {
      const content = `
model_provider = "azure"
`;
      expect(parseCodexConfigModelProvider(content)).toBe("azure");
    });

    it("支持单引号", () => {
      const content = `model_provider = 'gemini'`;
      expect(parseCodexConfigModelProvider(content)).toBe("gemini");
    });

    it("一旦进入 [section]，inTopLevel 永久为 false，section 后的 model_provider 不会被读取", () => {
      const content = `
[model_providers.azure]
model_provider = "ignored"

model_provider = "after-section"
`;
      // 当前实现：进入第一个 section 后 inTopLevel 永远为 false
      expect(parseCodexConfigModelProvider(content)).toBeUndefined();
    });

    it("未找到时返回 undefined", () => {
      const content = `
[model_providers.azure]
base_url = "https://example.com"
`;
      expect(parseCodexConfigModelProvider(content)).toBeUndefined();
    });

    it("忽略注释行", () => {
      const content = `
# model_provider = "commented"
model_provider = "real"
`;
      expect(parseCodexConfigModelProvider(content)).toBe("real");
    });

    it("忽略空行和前后空白", () => {
      const content = `

  model_provider   =   "spaced"
`;
      expect(parseCodexConfigModelProvider(content)).toBe("spaced");
    });
  });

  describe("parseCodexConfigProviderEnvKey", () => {
    it("读取指定 Provider section 的 env_key", () => {
      const content = `
[model_providers.azure]
env_key = "AZURE_OPENAI_API_KEY"
base_url = "https://example.com"
`;
      expect(parseCodexConfigProviderEnvKey(content, "azure")).toBe("AZURE_OPENAI_API_KEY");
    });

    it("其它 Provider 的 env_key 不会被读取", () => {
      const content = `
[model_providers.azure]
env_key = "AZURE_KEY"

[model_providers.gemini]
env_key = "GEMINI_API_KEY"
`;
      expect(parseCodexConfigProviderEnvKey(content, "azure")).toBe("AZURE_KEY");
      expect(parseCodexConfigProviderEnvKey(content, "gemini")).toBe("GEMINI_API_KEY");
    });

    it("不存在的 Provider 返回 undefined", () => {
      const content = `
[model_providers.azure]
env_key = "AZURE_KEY"
`;
      expect(parseCodexConfigProviderEnvKey(content, "notfound")).toBeUndefined();
    });

    it("section 名带连字符/下划线/数字支持", () => {
      const content = `
[model_providers.my-provider_v2]
env_key = "MY_KEY"
`;
      expect(parseCodexConfigProviderEnvKey(content, "my-provider_v2")).toBe("MY_KEY");
    });

    it("section 名带引号支持", () => {
      const content = `
[model_providers."my-provider"]
env_key = "MY_KEY"
`;
      expect(parseCodexConfigProviderEnvKey(content, "my-provider")).toBe("MY_KEY");
    });
  });

  describe("parseCodexConfigActiveProviderEnvKey", () => {
    it("openai provider 返回 undefined", () => {
      const content = `
model_provider = "openai"

[model_providers.openai]
env_key = "OPENAI_API_KEY"
`;
      expect(parseCodexConfigActiveProviderEnvKey(content)).toBeUndefined();
    });

    it("未配置 model_provider 返回 undefined", () => {
      const content = `
[model_providers.azure]
env_key = "AZURE_KEY"
`;
      expect(parseCodexConfigActiveProviderEnvKey(content)).toBeUndefined();
    });

    it("返回激活 Provider 的 env_key", () => {
      const content = `
model_provider = "azure"

[model_providers.azure]
env_key = "AZURE_OPENAI_API_KEY"
`;
      expect(parseCodexConfigActiveProviderEnvKey(content)).toBe("AZURE_OPENAI_API_KEY");
    });
  });

  describe("resolveCodexHome", () => {
    const originalEnv = process.env.CODEX_HOME;

    afterAll(() => {
      if (originalEnv === undefined) {
        delete process.env.CODEX_HOME;
      } else {
        process.env.CODEX_HOME = originalEnv;
      }
    });

    it("使用 CODEX_HOME 环境变量", () => {
      expect(resolveCodexHome({ CODEX_HOME: "/custom/codex" })).toBe("/custom/codex");
    });

    it("CODEX_HOME 空白字符串回退到 ~/.codex", () => {
      const result = resolveCodexHome({ CODEX_HOME: "   " });
      expect(result).toMatch(/\.codex$/);
    });

    it("无 CODEX_HOME 时回退到 ~/.codex", () => {
      const result = resolveCodexHome({});
      expect(result).toMatch(/\.codex$/);
    });
  });

  describe("readCodexConfigContent / readActiveCodexProviderEnvKey", () => {
    let tempDir: string;
    let originalCodexHome: string | undefined;

    beforeAll(() => {
      tempDir = join(tmpdir(), `codex-config-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      mkdirSync(tempDir, { recursive: true });
      originalCodexHome = process.env.CODEX_HOME;
      process.env.CODEX_HOME = tempDir;
    });

    afterAll(() => {
      if (originalCodexHome === undefined) {
        delete process.env.CODEX_HOME;
      } else {
        process.env.CODEX_HOME = originalCodexHome;
      }
      rmSync(tempDir, { recursive: true, force: true });
    });

    it("配置文件不存在时返回 undefined", () => {
      expect(readCodexConfigContent()).toBeUndefined();
      expect(readActiveCodexProviderEnvKey()).toBeUndefined();
    });

    it("读取并解析 config.toml", () => {
      const configPath = join(tempDir, "config.toml");
      writeFileSync(
        configPath,
        `
model_provider = "azure"

[model_providers.azure]
env_key = "AZURE_OPENAI_API_KEY"
`,
      );
      expect(existsSync(configPath)).toBe(true);
      const content = readCodexConfigContent();
      expect(content).toContain("model_provider");
      expect(readActiveCodexProviderEnvKey()).toBe("AZURE_OPENAI_API_KEY");
    });
  });
});
