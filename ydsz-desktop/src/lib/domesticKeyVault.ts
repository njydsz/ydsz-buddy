/**
 * @file 国产 Provider API Key 安全存储
 * @description 将 9 家国产 Provider 的 API Key 从明文 localStorage 迁移到 OS Keyring
 *
 * ## 迁移策略
 *
 * 1. 应用启动时，检测 localStorage 中是否存在 9 家 Provider 的 API Key
 * 2. 如存在 + Tauri 环境：自动迁移到 OS Keyring，清空 localStorage 中的明文
 * 3. 如不存在：读取时从 OS Keyring 获取，降级到 localStorage
 * 4. 写入时：优先存 OS Keyring，清空 localStorage 中的对应字段
 *
 * ## 支持的 Provider
 *
 * | Provider ID | Key Field | 名称 |
 * |-------------|-----------|------|
 * | glm | glmApiKey | 智谱 GLM |
 * | deepseek | deepseekApiKey | DeepSeek |
 * | moonshot | moonshotApiKey | Moonshot (Kimi) |
 * | qwen | qwenApiKey | 通义千问 |
 * | mimo | mimoApiKey | 小米 MiMo |
 * | minimax | MiniMaxApiKey | MiniMax |
 * | doubao | doubaoApiKey | 豆包 |
 * | ernie | ernieApiKey | 文心一言 |
 * | hunyuan | hunyuanApiKey | 混元 |
 *
 * @module lib/domesticKeyVault
 */

const DOMESTIC_PROVIDER_REFS: Record<string, string> = {
  glm: "domestic-glm-apikey",
  deepseek: "domestic-deepseek-apikey",
  moonshot: "domestic-moonshot-apikey",
  qwen: "domestic-qwen-apikey",
  mimo: "domestic-mimo-apikey",
  minimax: "domestic-minimax-apikey",
  doubao: "domestic-doubao-apikey",
  ernie: "domestic-ernie-apikey",
  hunyuan: "domestic-hunyuan-apikey",
};

/** 传统 localStorage 中存储 API Key 的字段名映射 */
const DOMESTIC_KEY_FIELDS: Record<string, string> = {
  glm: "glmApiKey",
  deepseek: "deepseekApiKey",
  moonshot: "moonshotApiKey",
  qwen: "qwenApiKey",
  mimo: "mimoApiKey",
  minimax: "MiniMaxApiKey",
  doubao: "doubaoApiKey",
  ernie: "ernieApiKey",
  hunyuan: "hunyuanApiKey",
};

// =============================================================================
// OS Keyring 读写
// =============================================================================

/** Tauri invoke 封装：写入 OS Keyring */
async function writeToKeyring(ref: string, value: string): Promise<boolean> {
  try {
    if (typeof window !== "undefined" && (window as { __TAURI__?: unknown }).__TAURI__) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("credential_store_set", { keyRef: ref, value });
      return true;
    }
  } catch (e) {
    console.warn(`[domesticKeyVault] OS Keyring 写入失败 (${ref}):`, e);
  }
  return false;
}

/** Tauri invoke 封装：读取 OS Keyring */
async function readFromKeyring(ref: string): Promise<string | null> {
  try {
    if (typeof window !== "undefined" && (window as { __TAURI__?: unknown }).__TAURI__) {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<string | null>("credential_store_get", { keyRef: ref });
      return result;
    }
  } catch (e) {
    console.warn(`[domesticKeyVault] OS Keyring 读取失败 (${ref}):`, e);
  }
  return null;
}

/** Tauri invoke 封装：删除 OS Keyring */
async function deleteFromKeyring(ref: string): Promise<boolean> {
  try {
    if (typeof window !== "undefined" && (window as { __TAURI__?: unknown }).__TAURI__) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("credential_store_delete", { keyRef: ref });
      return true;
    }
  } catch (e) {
    console.warn(`[domesticKeyVault] OS Keyring 删除失败 (${ref}):`, e);
  }
  return false;
}

// =============================================================================
// localStorage 读写 (降级 / 迁移)
// =============================================================================

const LS_PREFIX = "ydsz-buddy:domestic-key:";

function lsRead(providerId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LS_PREFIX + providerId);
  } catch {
    return null;
  }
}

function lsWrite(providerId: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_PREFIX + providerId, value);
  } catch {
    // ignore
  }
}

function lsRemove(providerId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LS_PREFIX + providerId);
  } catch {
    // ignore
  }
}

// =============================================================================
// 公共 API
// =============================================================================

/**
 * 从安全存储中读取国产 Provider 的 API Key
 *
 * 优先级: OS Keyring → localStorage 降级字段
 *
 * @param providerId Provider 标识（如 "glm", "deepseek"）
 * @returns API Key 或空字符串
 */
export async function getDomesticApiKey(providerId: string): Promise<string> {
  const ref = DOMESTIC_PROVIDER_REFS[providerId];
  if (!ref) return "";

  // 1. 从 OS Keyring 读取
  const keyringValue = await readFromKeyring(ref);
  if (keyringValue) return keyringValue;

  // 2. 降级：从 localStorage 读取
  const lsValue = lsRead(providerId);
  if (lsValue) {
    // 异步迁移到 Keyring（不阻塞返回）
    writeToKeyring(ref, lsValue).then((ok) => {
      if (ok) lsRemove(providerId);
    });
    return lsValue;
  }

  return "";
}

/**
 * 将国产 Provider 的 API Key 写入安全存储
 *
 * 优先写入 OS Keyring；写入成功后清除 localStorage 中的明文
 *
 * @param providerId Provider 标识
 * @param apiKey API Key 值（空字符串表示清除）
 * @returns 是否成功写入 OS Keyring
 */
export async function setDomesticApiKey(
  providerId: string,
  apiKey: string,
): Promise<boolean> {
  const ref = DOMESTIC_PROVIDER_REFS[providerId];
  if (!ref) return false;

  if (!apiKey) {
    // 清除
    await deleteFromKeyring(ref);
    lsRemove(providerId);
    return true;
  }

  const ok = await writeToKeyring(ref, apiKey);
  if (ok) {
    // 清除 localStorage 中的明文备份
    lsRemove(providerId);
  } else {
    // 降级存 localStorage
    lsWrite(providerId, apiKey);
  }
  return ok;
}

/**
 * 应用启动时执行一次性迁移
 *
 * 检测所有存在 localStorage 中的国产 Provider Key，尝试迁移到 OS Keyring。
 * 返回迁移统计。
 */
export async function migrateDomesticKeysToKeyring(): Promise<{
  migrated: number;
  failed: number;
  skipped: number;
}> {
  const stats = { migrated: 0, failed: 0, skipped: 0 };

  for (const providerId of Object.keys(DOMESTIC_PROVIDER_REFS)) {
    const ref = DOMESTIC_PROVIDER_REFS[providerId];
    const lsValue = lsRead(providerId);

    if (!lsValue) {
      stats.skipped++;
      continue;
    }

    const ok = await writeToKeyring(ref, lsValue);
    if (ok) {
      lsRemove(providerId);
      stats.migrated++;
      console.info(`[domesticKeyVault] 已迁移 ${providerId} API Key 到 OS Keyring`);
    } else {
      stats.failed++;
      console.warn(`[domesticKeyVault] ${providerId} 迁移失败，保留 localStorage 降级`);
    }
  }

  return stats;
}

/**
 * 检查 OS Keyring 是否可用
 */
export async function isKeyringAvailable(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!(window as { __TAURI__?: unknown }).__TAURI__) return false;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("credential_store_exists", { keyRef: "__healthcheck__" });
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取所有国产 Provider 的迁移状态
 */
export function getDomesticProviderIds(): string[]> {
  return Object.keys(DOMESTIC_PROVIDER_REFS);
}

/**
 * 获取 localStorage key 字段名（用于 appSettings 读取降级）
 */
export function getDomesticKeyField(
  providerId: string,
): string | undefined {
  return DOMESTIC_KEY_FIELDS[providerId];
}
