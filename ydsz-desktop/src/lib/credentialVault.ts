/**
 * @file 凭证保险箱（Credential Vault）
 * @description C-2 自定义 Provider BYOK：API Key 凭证的安全存储
 *
 * ## 设计目标
 *
 * - **不把 API Key 存进 localStorage 明文**——zustand persist 默认会序列化整个
 *   store 进 localStorage，这等于"明文存 API Key"。我们要把它单独抽出来。
 * - **可插拔后端**：默认用浏览器 `sessionStorage` + 异或混淆，未来可以接入
 *   Tauri `tauri-plugin-keyring`（macOS Keychain / Windows Credential Manager /
 *   Linux Secret Service）/ Stronghold。
 * - **内存优先 + 自动过期**：每次启动需要重新输入 API Key（最严格模式），
 *   也支持"记住到 session"模式（关闭标签页后清空）。
 *
 * ## 存储模式
 *
 * | 模式 | 持久性 | 安全性 | 适用场景 |
 * |------|--------|--------|----------|
 * | `session` | sessionStorage，关闭 tab 即清 | 中 | 共享电脑 / 临时使用 |
 * | `local-obfuscated` | localStorage，XOR + Base64 混淆 | 低-中 | 信任的私人电脑 |
 * | `os-keychain`（未来） | OS Keychain | 高 | 接入 tauri-plugin-keyring 后启用 |
 *
 * ## 关键约定
 *
 * - **凭证不入 store**：`customProviderStore` 只存 `apiKeyRef`（一个引用 ID），
 *   真正的 key 存在这里。这样 store 序列化（localStorage）时不会泄露 key。
 * - **运行时合并**：上层调用 Provider 时，先从 store 拿配置 + `apiKeyRef`，
 *   再从 vault 拿真 key，组成最终的 `CustomProviderConfig`。
 *
 * @module lib/credentialVault
 */

/**
 * 凭证存储模式
 */
export type CredentialStorageMode = "session" | "local-obfuscated" | "os-keychain";

/**
 * 保险箱后端接口（可插拔）
 */
export interface CredentialBackend {
  /** 读取 */
  get(ref: string): string | null;
  /** 写入 */
  set(ref: string, value: string): void;
  /** 删除 */
  remove(ref: string): void;
  /** 列出所有 ref（用于管理界面） */
  listRefs(): string[];
}

// =============================================================================
// 混淆工具（XOR + Base64）
// =============================================================================
//
// 这不是真加密（key 在前端代码里可被提取），只是防止：
// 1) localStorage 浏览器插件 / DevTools 一眼看到明文 key
// 2) 简单的磁盘扫描 / grep 抓取
//
// 真生产环境必须走 OS Keychain（见 `osKeychainBackend` 注释）。

/**
 * 全局混淆 key（从构建期常量生成；注意：不是密码学安全）
 */
const OBFUSCATION_SALT = "2. 环境变量 YDSZ_BOOTSTRAP_TOKEN-vault-v1";

/**
 * 简易 XOR 混淆（输出 base64）
 */
function obfuscate(plain: string): string {
  const encoded = new TextEncoder().encode(plain);
  const out = new Uint8Array(encoded.length);
  const salt = new TextEncoder().encode(OBFUSCATION_SALT);
  for (let i = 0; i < encoded.length; i++) {
    out[i] = (encoded[i] ?? 0) ^ (salt[i % salt.length] ?? 0);
  }
  // base64
  let binary = "";
  for (let i = 0; i < out.length; i++) {
    binary += String.fromCharCode(out[i] ?? 0);
  }
  return btoa(binary);
}

/**
 * XOR 混淆还原
 */
function deobfuscate(encoded: string): string {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const salt = new TextEncoder().encode(OBFUSCATION_SALT);
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[i] = (bytes[i] ?? 0) ^ (salt[i % salt.length] ?? 0);
  }
  return new TextDecoder().decode(out);
}

// =============================================================================
// 后端实现
// =============================================================================

const VAULT_PREFIX = "ydsz-buddy:vault:";

/**
 * sessionStorage 后端（关闭 tab 即清）
 */
const sessionBackend: CredentialBackend = {
  get(ref) {
    try {
      const raw = sessionStorage.getItem(VAULT_PREFIX + ref);
      if (!raw) return null;
      return deobfuscate(raw);
    } catch {
      return null;
    }
  },
  set(ref, value) {
    try {
      sessionStorage.setItem(VAULT_PREFIX + ref, obfuscate(value));
    } catch {
      // sessionStorage 不可用（隐私模式 / SSR），静默降级到内存
      inMemoryStore.set(ref, value);
    }
  },
  remove(ref) {
    try {
      sessionStorage.removeItem(VAULT_PREFIX + ref);
    } catch {
      inMemoryStore.delete(ref);
    }
  },
  listRefs() {
    const refs: string[] = [];
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith(VAULT_PREFIX)) {
          refs.push(key.slice(VAULT_PREFIX.length));
        }
      }
    } catch {
      // ignore
    }
    return refs;
  },
};

/**
 * localStorage 后端（XOR 混淆，关闭浏览器不清）
 */
const localObfuscatedBackend: CredentialBackend = {
  get(ref) {
    try {
      const raw = localStorage.getItem(VAULT_PREFIX + ref);
      if (!raw) return null;
      return deobfuscate(raw);
    } catch {
      return null;
    }
  },
  set(ref, value) {
    try {
      localStorage.setItem(VAULT_PREFIX + ref, obfuscate(value));
    } catch {
      inMemoryStore.set(ref, value);
    }
  },
  remove(ref) {
    try {
      localStorage.removeItem(VAULT_PREFIX + ref);
    } catch {
      inMemoryStore.delete(ref);
    }
  },
  listRefs() {
    const refs: string[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(VAULT_PREFIX)) {
          refs.push(key.slice(VAULT_PREFIX.length));
        }
      }
    } catch {
      // ignore
    }
    return refs;
  },
};

/**
 * 内存后端（兜底，浏览器存储不可用时使用）
 */
const inMemoryStore = new Map<string, string>();
const memoryBackend: CredentialBackend = {
  get: (ref) => inMemoryStore.get(ref) ?? null,
  set: (ref, value) => {
    inMemoryStore.set(ref, value);
  },
  remove: (ref) => {
    inMemoryStore.delete(ref);
  },
  listRefs: () => Array.from(inMemoryStore.keys()),
};

/**
 * OS Keychain 后端（P0-2 实现）
 *
 * 通过 Tauri 命令接入操作系统原生凭证存储：
 * - macOS → Keychain
 * - Windows → Credential Manager
 * - Linux → Secret Service (libsecret)
 *
 * 由于 Tauri invoke 是异步的，而 CredentialBackend 接口是同步的，
 * 我们采用「异步写入 + 同步读取（从内存缓存）」策略：
 * - `set()` 异步写入 OS Keyring，同时更新内存缓存
 * - `get()` 从内存缓存同步读取
 * - 应用启动时调用 `initOsKeychainBackend()` 预加载凭证到内存
 *
 * 这样既保证了安全性（凭证持久化在 OS Keyring），
 * 又保持了前端 API 的同步调用习惯。
 */

/** OS Keychain 内存缓存（从 OS Keyring 预加载） */
const osKeychainCache = new Map<string, string>();

/** OS Keychain 内存同步后端（读取用） */
const osKeychainBackend: CredentialBackend = {
  get(ref) {
    return osKeychainCache.get(ref) ?? null;
  },
  set(ref, value) {
    // 同步更新内存缓存，异步写入 OS Keyring
    osKeychainCache.set(ref, value);
    void writeOsKeychain(ref, value);
  },
  remove(ref) {
    osKeychainCache.delete(ref);
    void deleteOsKeychain(ref);
  },
  listRefs() {
    return Array.from(osKeychainCache.keys());
  },
};

/** Tauri invoke 封装：写入 OS Keyring */
async function writeOsKeychain(ref: string, value: string): Promise<void> {
  try {
    if (typeof window !== "undefined" && (window as { __TAURI__?: unknown }).__TAURI__) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("credential_store_set", { keyRef: ref, value });
    }
  } catch {
    // OS Keyring 不可用时静默降级到内存
  }
}

/** Tauri invoke 封装：读取 OS Keyring */
async function readOsKeychain(ref: string): Promise<string | null> {
  try {
    if (typeof window !== "undefined" && (window as { __TAURI__?: unknown }).__TAURI__) {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<string | null>("credential_store_get", { keyRef: ref });
      return result;
    }
  } catch {
    // OS Keyring 不可用
  }
  return null;
}

/** Tauri invoke 封装：删除 OS Keyring */
async function deleteOsKeychain(ref: string): Promise<void> {
  try {
    if (typeof window !== "undefined" && (window as { __TAURI__?: unknown }).__TAURI__) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("credential_store_delete", { keyRef: ref });
    }
  } catch {
    // 静默
  }
}

/**
 * 初始化 OS Keychain 后端：预加载所有已知凭证到内存缓存
 *
 * 应在应用启动时调用，从其他后端的 listRefs() 获取引用列表，
 * 然后逐个从 OS Keyring 加载。
 */
export async function initOsKeychainBackend(): Promise<void> {
  // 从 session/local 列表中获取已知的 refs
  const knownRefs = new Set<string>();
  for (const ref of sessionBackend.listRefs()) {
    knownRefs.add(ref);
  }
  for (const ref of localObfuscatedBackend.listRefs()) {
    knownRefs.add(ref);
  }

  // 尝试从 OS Keyring 加载每个 ref
  for (const ref of knownRefs) {
    const value = await readOsKeychain(ref);
    if (value !== null) {
      osKeychainCache.set(ref, value);
    }
  }
}

/**
 * 异步写入凭证到 OS Keychain（持久化）
 *
 * 与同步 `storeCredential` 配合使用：
 * 1. 调用 `storeCredential(ref, value, "os-keychain")` 同步更新内存缓存
 * 2. 调用此函数异步持久化到 OS Keyring
 */
export async function persistCredentialToOsKeychain(ref: string, value: string): Promise<void> {
  await writeOsKeychain(ref, value);
}

/**
 * 异步从 OS Keychain 加载凭证到内存缓存
 *
 * 用于应用启动时恢复持久化的凭证。
 */
export async function loadCredentialFromOsKeychain(ref: string): Promise<string | null> {
  const value = await readOsKeychain(ref);
  if (value !== null) {
    osKeychainCache.set(ref, value);
  }
  return value;
}

/**
 * 构建 OS Keychain 后端（兼容旧接口）
 */
async function buildOsKeychainBackend(): Promise<CredentialBackend | null> {
  if (typeof window === "undefined" || !(window as { __TAURI__?: unknown }).__TAURI__) {
    return null;
  }
  return osKeychainBackend;
}

// =============================================================================
// 公共 API
// =============================================================================

/**
 * 解析给定模式的可用后端
 */
function resolveBackend(mode: CredentialStorageMode): CredentialBackend {
  switch (mode) {
    case "session":
      return sessionBackend;
    case "local-obfuscated":
      return localObfuscatedBackend;
    case "os-keychain":
      return osKeychainBackend;
    default:
      return memoryBackend;
  }
}

/**
 * 全局默认存储模式（由 CredentialStoragePanel 切换）
 */
let defaultCredentialStorageMode: CredentialStorageMode = "session";

/**
 * 设置全局默认凭证存储模式
 */
export function setDefaultCredentialStorageMode(mode: CredentialStorageMode): void {
  defaultCredentialStorageMode = mode;
}

/**
 * 获取全局默认凭证存储模式
 */
export function getDefaultCredentialStorageMode(): CredentialStorageMode {
  return defaultCredentialStorageMode;
}

/**
 * 写入凭证
 *
 * @param ref 引用 ID（一般是 `custom-{providerId}`）
 * @param value 真实 API Key
 * @param mode 存储模式
 */
export function storeCredential(
  ref: string,
  value: string,
  mode: CredentialStorageMode = defaultCredentialStorageMode,
): void {
  const backend = resolveBackend(mode);
  backend.set(ref, value);
}

/**
 * 读取凭证
 */
export function getCredential(ref: string): string | null {
  // 同时尝试多种后端（用户可能切换过模式），OS Keychain 优先
  for (const backend of [osKeychainBackend, sessionBackend, localObfuscatedBackend, memoryBackend]) {
    const value = backend.get(ref);
    if (value !== null) return value;
  }
  return null;
}

/**
 * 删除凭证（从所有后端移除）
 */
export function removeCredential(ref: string): void {
  osKeychainBackend.remove(ref);
  sessionBackend.remove(ref);
  localObfuscatedBackend.remove(ref);
  memoryBackend.remove(ref);
}

/**
 * 列出所有凭证引用
 */
export function listCredentialRefs(): string[] {
  const refs = new Set<string>();
  for (const backend of [osKeychainBackend, sessionBackend, localObfuscatedBackend, memoryBackend]) {
    for (const ref of backend.listRefs()) {
      refs.add(ref);
    }
  }
  return Array.from(refs);
}

/**
 * 为 Provider 生成凭证引用 ID
 *
 * 约定：`custom-{providerId}` 与 store 中的 provider ID 一一对应。
 */
export function credentialRefForProvider(providerId: string): string {
  return `custom-${providerId}`;
}

/**
 * 检查 OS Keychain 是否可用（异步）
 */
export async function isOsKeychainAvailable(): Promise<boolean> {
  const backend = await buildOsKeychainBackend();
  return backend !== null;
}

/**
 * 清除所有凭证（紧急按钮 / 隐私模式切换）
 */
export function clearAllCredentials(): void {
  for (const ref of listCredentialRefs()) {
    removeCredential(ref);
  }
  inMemoryStore.clear();
  osKeychainCache.clear();
}
