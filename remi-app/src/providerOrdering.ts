/**
 * @file Provider 閹烘帒绨粻锛勬倞
 *
 * 缂佸瓨濮?Provider 闁瀚ㄩ崳銊よ厬閻ㄥ嫭甯撴惔蹇暻旂€规碍鈧嶇礉绾喕绻氱拋鍓х枂妞ょ敻娼伴妴浣规偝缁便垹鎷伴懣婊冨礋娑擃厾娈戞い鍝勭碍娑撯偓閼锋番鈧? * 閹绘劒绶垫妯款吇閹烘帒绨妴浣瑰笓鎼村繑鐖ｉ崙鍡楀閵嗕焦甯撴惔蹇旂槷鏉堝啰鐡戝銉ュ徔閸戣姤鏆熼妴? */

import type { ProviderKind } from "~/contracts";

/**
 * Provider 閻ㄥ嫰绮拋銈嗘▔缁€娲€庢惔蹇嬧偓? * 濮濄倝銆庢惔蹇撳枀鐎规矮绨℃笟褑绔熼弽蹇嬧偓渚€鈧瀚ㄩ崳銊х搼 UI 娑?Provider 閻ㄥ嫭甯撻崚妞剧秴缂冾喓鈧? */
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

/** 閸╄桨绨?DEFAULT_PROVIDER_ORDER 閺嬪嫬缂撻惃?Provider 缁鐎烽梿鍡楁値閿涘瞼鏁ゆ禍搴℃彥闁喐鐓￠幍?*/
const PROVIDER_KIND_SET: ReadonlySet<ProviderKind> = new Set(DEFAULT_PROVIDER_ORDER);

/**
 * 閸掋倖鏌囩紒娆忕暰鐎涙顑佹稉鍙夋Ц閸氾缚璐熼張澶嬫櫏閻?ProviderKind 缁鐎烽妴? *
 * @param value - 瀵板懎鍨介弬顓犳畱鐎涙顑佹稉? * @returns 閺勵垰鎯佹稉鐑樻箒閺佸牏娈?ProviderKind
 */
export function isProviderKind(value: string): value is ProviderKind {
  return PROVIDER_KIND_SET.has(value as ProviderKind);
}

/**
 * 閺嶅洤鍣崠鏍閽樺繒娈?Provider 閸掓銆冮妴? * 鏉╁洦鎶ら弮鐘虫櫏閸婄厧鎷伴柌宥咁槻妞ょ櫢绱濇禒鍛箽閻ｆ瑦婀侀弫鍫㈡畱 ProviderKind閵? *
 * @param hiddenProviders - 閸樼喎顫愰梾鎰 Provider 閸掓銆? * @returns 閸樺鍣搁崥搴ｆ畱閺堝鏅?ProviderKind 閺佹壆绮? */
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
 * 閺嶅洤鍣崠?Provider 閹烘帒绨崚妤勩€冮妴? * 鏉╁洦鎶ら弮鐘虫櫏閸婄厧鎷伴柌宥咁槻妞ょ櫢绱濋獮璺虹殺閻劍鍩涢張顏呭瘹鐎规氨娈?Provider 閹稿绮拋銈夈€庢惔蹇氭嫹閸旂姴鍩岄張顐㈢啲閵? *
 * @param providerOrder - 閸樼喎顫?Provider 閹烘帒绨崚妤勩€? * @returns 閺嶅洤鍣崠鏍ф倵閻ㄥ嫬鐣弫?ProviderKind 閹烘帒绨弫鎵矋
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
 * 閸掋倖鏌囨稉銈勯嚋 Provider 閹烘帒绨崚妤勩€冮弰顖氭儊鐎瑰苯鍙忛惄绋挎倱閿涘牓銆庢惔蹇撴嫲閸忓啰绀屾稉鈧懛杈剧礆閵? *
 * @param left - 缁楊兛绔存稉顏呭笓鎼村繐鍨悰? * @param right - 缁楊兛绨╂稉顏呭笓鎼村繐鍨悰? * @returns 閺勵垰鎯侀惄绋挎倱
 */
export function sameProviderOrder(
  left: ReadonlyArray<ProviderKind>,
  right: ReadonlyArray<ProviderKind>,
): boolean {
  return left.length === right.length && left.every((provider, index) => provider === right[index]);
}

/**
 * 閹稿鍙庨幐鍥х暰閹烘帒绨В鏃囩窛娑撱倓閲?Provider 閻ㄥ嫬鍘涢崥搴ㄣ€庢惔蹇嬧偓? * 娑撳秴婀幒鎺戠碍閸掓銆冩稉顓犳畱 Provider 閹烘帒婀張顐㈢啲閿涘本瀵滄妯款吇妞ゅ搫绨幒鎺戝灙閵? *
 * @param providerOrder - 閹烘帒绨憴鍕灟閸掓銆? * @param left - 缁楊兛绔存稉?Provider
 * @param right - 缁楊兛绨╂稉?Provider
 * @returns 鐠愮喐鏆熺悰銊с仛 left 閸︺劌澧犻敍灞绢劀閺佹媽銆冪粈?right 閸︺劌澧犻敍? 鐞涖劎銇氶惄绋挎倱
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
