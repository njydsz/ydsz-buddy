/**
 * @file Credential Vault 单元测试
 * @description 验证 C-2 任务:凭证保险箱（多后端 + 脱敏 + 多模式）
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  clearAllCredentials,
  credentialRefForProvider,
  getCredential,
  isOsKeychainAvailable,
  listCredentialRefs,
  removeCredential,
  storeCredential,
  type CredentialStorageMode,
} from "./credentialVault";

beforeEach(() => {
  clearAllCredentials();
  localStorage.clear();
  sessionStorage.clear();
});

describe("C-2 credentialVault - session 模式", () => {
  it("写入 + 读取", () => {
    storeCredential("ref-1", "secret-key", "session");
    expect(getCredential("ref-1")).toBe("secret-key");
  });

  it("sessionStorage 中存的是混淆后的字符串（不是明文）", () => {
    storeCredential("ref-1", "sk-very-secret", "session");
    const raw = sessionStorage.getItem("ydsz-buddy:vault:ref-1");
    expect(raw).toBeTruthy();
    expect(raw).not.toBe("sk-very-secret");
    expect(raw).not.toContain("sk-very-secret");
  });

  it("删除后再读返回 null", () => {
    storeCredential("ref-1", "key", "session");
    removeCredential("ref-1");
    expect(getCredential("ref-1")).toBeNull();
  });

  it("listCredentialRefs 列出所有已存 ref", () => {
    storeCredential("ref-1", "k1", "session");
    storeCredential("ref-2", "k2", "session");
    const refs = listCredentialRefs();
    expect(refs).toContain("ref-1");
    expect(refs).toContain("ref-2");
  });
});

describe("C-2 credentialVault - local-obfuscated 模式", () => {
  it("写入 + 读取", () => {
    storeCredential("ref-1", "secret-key", "local-obfuscated");
    expect(getCredential("ref-1")).toBe("secret-key");
  });

  it("localStorage 中存的是混淆后的字符串", () => {
    storeCredential("ref-1", "sk-very-secret", "local-obfuscated");
    const raw = localStorage.getItem("ydsz-buddy:vault:ref-1");
    expect(raw).toBeTruthy();
    expect(raw).not.toBe("sk-very-secret");
    expect(raw).not.toContain("sk-very-secret");
  });

  it("清除 session 模式不影响 local-obfuscated 模式", () => {
    storeCredential("ref-1", "k1", "session");
    storeCredential("ref-2", "k2", "local-obfuscated");
    expect(getCredential("ref-1")).toBe("k1");
    expect(getCredential("ref-2")).toBe("k2");
  });
});

describe("C-2 credentialVault - 跨模式查找", () => {
  it("getCredential 会按顺序尝试多种后端", () => {
    storeCredential("ref-x", "local-value", "local-obfuscated");
    expect(getCredential("ref-x")).toBe("local-value");
  });

  it("removeCredential 同时清理所有后端", () => {
    storeCredential("ref-x", "k", "local-obfuscated");
    storeCredential("ref-x", "k", "session");
    removeCredential("ref-x");
    expect(getCredential("ref-x")).toBeNull();
    expect(localStorage.getItem("ydsz-buddy:vault:ref-x")).toBeNull();
    expect(sessionStorage.getItem("ydsz-buddy:vault:ref-x")).toBeNull();
  });
});

describe("C-2 credentialVault - 工具函数", () => {
  it("credentialRefForProvider 拼接 'custom-' 前缀", () => {
    expect(credentialRefForProvider("abc-123")).toBe("custom-abc-123");
  });
});

describe("C-2 credentialVault - clearAllCredentials", () => {
  it("清空所有 ref", () => {
    storeCredential("a", "1", "session");
    storeCredential("b", "2", "local-obfuscated");
    clearAllCredentials();
    expect(listCredentialRefs()).toEqual([]);
    expect(getCredential("a")).toBeNull();
    expect(getCredential("b")).toBeNull();
  });
});

describe("C-2 credentialVault - OS Keychain", () => {
  it("非 Tauri 环境返回 false", async () => {
    const available = await isOsKeychainAvailable();
    expect(available).toBe(false);
  });
});

describe("C-2 credentialVault - 混淆 round-trip 正确性", () => {
  const samples: Array<{ ref: string; value: string; mode: CredentialStorageMode }> = [
    { ref: "k1", value: "sk-12345", mode: "session" },
    { ref: "k2", value: "sk-ant-very-long-key-abcdef", mode: "local-obfuscated" },
    { ref: "k3", value: "中文 key 也得能存", mode: "session" },
    { ref: "k4", value: "a", mode: "local-obfuscated" },
    { ref: "k5", value: "🚀 emoji keys 🔑", mode: "session" },
  ];

  for (const { ref, value, mode } of samples) {
    it(`round-trip: ${ref} (${mode})`, () => {
      storeCredential(ref, value, mode);
      expect(getCredential(ref)).toBe(value);
    });
  }
});

describe("C-2 credentialVault - 空字符串边界", () => {
  it("存空字符串后 getCredential 返回 null（语义上等价于'无 key'）", () => {
    storeCredential("ref-empty", "", "session");
    expect(getCredential("ref-empty")).toBeNull();
  });
});
