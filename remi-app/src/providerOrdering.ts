/**
 * @file Provider 鎺掑簭绠＄悊
 *
 * 缁存姢 Provider 閫夋嫨鍣ㄤ腑鐨勬帓搴忕ǔ瀹氭€э紝纭繚璁剧疆椤甸潰銆佹悳绱㈠拰鑿滃崟涓殑椤哄簭涓€鑷淬€? * 鎻愪緵榛樿鎺掑簭銆佹帓搴忔爣鍑嗗寲銆佹帓搴忔瘮杈冪瓑宸ュ叿鍑芥暟銆? */

import type { ProviderKind } from "~/contracts";

/**
 * Provider 鐨勯粯璁ゆ樉绀洪『搴忋€? * 姝ら『搴忓喅瀹氫簡渚ц竟鏍忋€侀€夋嫨鍣ㄧ瓑 UI 涓?Provider 鐨勬帓鍒椾綅缃€? */
export const DEFAULT_PROVIDER_ORDER: readonly ProviderKind[] = [
  "codex",
  "claudeAgent",
  "cursor",
  "gemini",
  "grok",
  "kilo",
  "opencode",
  "pi",
];

/** 鍩轰簬 DEFAULT_PROVIDER_ORDER 鏋勫缓鐨?Provider 绫诲瀷闆嗗悎锛岀敤浜庡揩閫熸煡鎵?*/
const PROVIDER_KIND_SET: ReadonlySet<ProviderKind> = new Set(DEFAULT_PROVIDER_ORDER);

/**
 * 鍒ゆ柇缁欏畾瀛楃涓叉槸鍚︿负鏈夋晥鐨?ProviderKind 绫诲瀷銆? *
 * @param value - 寰呭垽鏂殑瀛楃涓? * @returns 鏄惁涓烘湁鏁堢殑 ProviderKind
 */
export function isProviderKind(value: string): value is ProviderKind {
  return PROVIDER_KIND_SET.has(value as ProviderKind);
}

/**
 * 鏍囧噯鍖栭殣钘忕殑 Provider 鍒楄〃銆? * 杩囨护鏃犳晥鍊煎拰閲嶅椤癸紝浠呬繚鐣欐湁鏁堢殑 ProviderKind銆? *
 * @param hiddenProviders - 鍘熷闅愯棌 Provider 鍒楄〃
 * @returns 鍘婚噸鍚庣殑鏈夋晥 ProviderKind 鏁扮粍
 */
export function normalizeHiddenProviders(hiddenProviders: ReadonlyArray<string>): ProviderKind[] {
  const seen = new Set<ProviderKind>();
  const result: ProviderKind[] = [];
  for (const candidate of hiddenProviders) {
    if (isProviderKind(candidate) && !seen.has(candidate)) {
      seen.add(candidate);
      result.push(candidate);
    }
  }
  return result;
}

/**
 * 鏍囧噯鍖?Provider 鎺掑簭鍒楄〃銆? * 杩囨护鏃犳晥鍊煎拰閲嶅椤癸紝骞跺皢鐢ㄦ埛鏈寚瀹氱殑 Provider 鎸夐粯璁ら『搴忚拷鍔犲埌鏈熬銆? *
 * @param providerOrder - 鍘熷 Provider 鎺掑簭鍒楄〃
 * @returns 鏍囧噯鍖栧悗鐨勫畬鏁?ProviderKind 鎺掑簭鏁扮粍
 */
export function normalizeProviderOrder(providerOrder: ReadonlyArray<string>): ProviderKind[] {
  const seen = new Set<ProviderKind>();
  const result: ProviderKind[] = [];
  for (const candidate of providerOrder) {
    if (isProviderKind(candidate) && !seen.has(candidate)) {
      seen.add(candidate);
      result.push(candidate);
    }
  }
  for (const provider of DEFAULT_PROVIDER_ORDER) {
    if (!seen.has(provider)) {
      result.push(provider);
    }
  }
  return result;
}

/**
 * 鍒ゆ柇涓や釜 Provider 鎺掑簭鍒楄〃鏄惁瀹屽叏鐩稿悓锛堥『搴忓拰鍏冪礌涓€鑷达級銆? *
 * @param left - 绗竴涓帓搴忓垪琛? * @param right - 绗簩涓帓搴忓垪琛? * @returns 鏄惁鐩稿悓
 */
export function sameProviderOrder(
  left: ReadonlyArray<ProviderKind>,
  right: ReadonlyArray<ProviderKind>,
): boolean {
  return left.length === right.length && left.every((provider, index) => provider === right[index]);
}

/**
 * 鎸夌収鎸囧畾鎺掑簭姣旇緝涓や釜 Provider 鐨勫厛鍚庨『搴忋€? * 涓嶅湪鎺掑簭鍒楄〃涓殑 Provider 鎺掑湪鏈熬锛屾寜榛樿椤哄簭鎺掑垪銆? *
 * @param providerOrder - 鎺掑簭瑙勫垯鍒楄〃
 * @param left - 绗竴涓?Provider
 * @param right - 绗簩涓?Provider
 * @returns 璐熸暟琛ㄧず left 鍦ㄥ墠锛屾鏁拌〃绀?right 鍦ㄥ墠锛? 琛ㄧず鐩稿悓
 */
export function compareProvidersByOrder(
  providerOrder: ReadonlyArray<ProviderKind>,
  left: ProviderKind,
  right: ProviderKind,
): number {
  const leftIndex = providerOrder.indexOf(left);
  const rightIndex = providerOrder.indexOf(right);
  const normalizedLeftIndex =
    leftIndex >= 0 ? leftIndex : DEFAULT_PROVIDER_ORDER.indexOf(left) + providerOrder.length;
  const normalizedRightIndex =
    rightIndex >= 0 ? rightIndex : DEFAULT_PROVIDER_ORDER.indexOf(right) + providerOrder.length;
  return normalizedLeftIndex - normalizedRightIndex;
}
