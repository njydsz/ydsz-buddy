/**
 * @file 椤圭洰鑴氭湰宸ュ叿妯″潡
 * @description 鎻愪緵椤圭洰鑴氭湰鐨?ID 鐢熸垚銆佸懡浠ゆ槧灏勩€佸伐浣滅洰褰曡В鏋愬拰鐜鍙橀噺鏋勫缓绛夊伐鍏峰嚱鏁般€? */

import {
  MAX_SCRIPT_ID_LENGTH,
  SCRIPT_RUN_COMMAND_PATTERN,
  type KeybindingCommand,
  type ProjectScript,
} from "~/contracts";

/**
 * 褰掍竴鍖栬剼鏈?ID锛氳浆灏忓啓銆佹浛鎹㈤潪娉曞瓧绗︿负杩炲瓧绗︺€佸幓闄ら灏捐繛瀛楃銆佹埅鏂嚦鏈€澶ч暱搴? * @param value - 鍘熷鑴氭湰鍚嶇О
 * @returns 褰掍竴鍖栧悗鐨勮剼鏈?ID
 */
function normalizeScriptId(value: string): string {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (cleaned.length === 0) {
    return "script";
  }
  if (cleaned.length <= MAX_SCRIPT_ID_LENGTH) {
    return cleaned;
  }
  return cleaned.slice(0, MAX_SCRIPT_ID_LENGTH).replace(/-+$/g, "") || "script";
}

/**
 * 鏍规嵁鑴氭湰 ID 鐢熸垚蹇嵎閿懡浠ゆ爣璇? * @param scriptId - 鑴氭湰 ID
 * @returns 蹇嵎閿懡浠? */
export const commandForProjectScript = (scriptId: string): KeybindingCommand =>
  SCRIPT_RUN_COMMAND_PATTERN.makeUnsafe(`script.${scriptId}.run`);

/**
 * 浠庡揩鎹烽敭鍛戒护涓彁鍙栬剼鏈?ID
 * @param command - 蹇嵎閿懡浠ゅ瓧绗︿覆
 * @returns 鑴氭湰 ID锛岄潪鑴氭湰鍛戒护杩斿洖 null
 */
export function projectScriptIdFromCommand(command: string): string | null {
  const trimmed = command.trim();
  if (!SCRIPT_RUN_COMMAND_PATTERN.is(trimmed)) {
    return null;
  }
  const [prefix, , suffix] = SCRIPT_RUN_COMMAND_PATTERN.parts;
  return trimmed.slice(prefix.literal.length, -suffix.literal.length);
}

/**
 * 鐢熸垚涓嬩竴涓彲鐢ㄧ殑椤圭洰鑴氭湰 ID
 * 鍩轰簬鑴氭湰鍚嶇О鐢熸垚 ID锛岃嫢宸插瓨鍦ㄥ垯娣诲姞鏁板瓧鍚庣紑锛岀洿鍒版壘鍒板彲鐢?ID
 * @param name - 鑴氭湰鍚嶇О
 * @param existingIds - 宸插瓨鍦ㄧ殑鑴氭湰 ID 闆嗗悎
 * @returns 鍞竴鐨勮剼鏈?ID
 */
export function nextProjectScriptId(name: string, existingIds: Iterable<string>): string {
  const taken = new Set(Array.from(existingIds));
  const baseId = normalizeScriptId(name);
  if (!taken.has(baseId)) return baseId;

  let suffix = 2;
  while (suffix < 10_000) {
    const candidate = `${baseId}-${suffix}`;
    const safeCandidate =
      candidate.length <= MAX_SCRIPT_ID_LENGTH
        ? candidate
        : `${baseId.slice(0, Math.max(1, MAX_SCRIPT_ID_LENGTH - String(suffix).length - 1))}-${suffix}`;
    if (!taken.has(safeCandidate)) {
      return safeCandidate;
    }
    suffix += 1;
  }

  // 鍏滃簳鏂规锛氫粎鍦ㄦ暟鍗冧釜鍚庣紑閮借€楀敖鏃惰Е鍙?  return `${baseId}-${Date.now()}`.slice(0, MAX_SCRIPT_ID_LENGTH);
}

/**
 * 椤圭洰鑴氭湰杩愯鏃剁幆澧冨彉閲忚緭鍏? * @property project.cwd - 椤圭洰鏍圭洰褰? * @property worktreePath - 宸ヤ綔鏍戣矾寰勶紙鍙€夛級
 * @property extraEnv - 棰濆鐜鍙橀噺锛堝彲閫夛級
 */
interface ProjectScriptRuntimeEnvInput {
  project: {
    cwd: string;
  };
  worktreePath?: string | null;
  extraEnv?: Record<string, string>;
}

/**
 * 瑙ｆ瀽椤圭洰鑴氭湰鐨勫伐浣滅洰褰? * 浼樺厛浣跨敤宸ヤ綔鏍戣矾寰勶紝鍚﹀垯浣跨敤椤圭洰鏍圭洰褰? * @param input - 鍖呭惈椤圭洰鍜屽伐浣滄爲璺緞鐨勮緭鍏? * @returns 鑴氭湰杩愯鐨勫伐浣滅洰褰? */
export function projectScriptCwd(input: {
  project: {
    cwd: string;
  };
  worktreePath?: string | null;
}): string {
  return input.worktreePath ?? input.project.cwd;
}

/**
 * 鏋勫缓椤圭洰鑴氭湰鐨勮繍琛屾椂鐜鍙橀噺
 * 鍖呭惈椤圭洰鏍圭洰褰曘€佸伐浣滄爲璺緞绛夋爣鍑嗗彉閲忥紝鍙笌棰濆鐜鍙橀噺鍚堝苟
 * @param input - 杩愯鏃剁幆澧冨彉閲忚緭鍏? * @returns 鐜鍙橀噺閿€煎
 */
export function projectScriptRuntimeEnv(
  input: ProjectScriptRuntimeEnvInput,
): Record<string, string> {
  const env: Record<string, string> = {
    REMICODE_PROJECT_ROOT: input.project.cwd,
  };
  if (input.worktreePath) {
    env.REMICODE_WORKTREE_PATH = input.worktreePath;
  }
  if (input.extraEnv) {
    return { ...env, ...input.extraEnv };
  }
  return env;
}

/**
 * 鑾峰彇涓昏鐨勯」鐩剼鏈紙闈炲伐浣滄爲鍒涘缓鏃惰繍琛岀殑鑴氭湰锛? * 浼樺厛杩斿洖绗竴涓潪 runOnWorktreeCreate 鐨勮剼鏈? * @param scripts - 椤圭洰鑴氭湰鍒楄〃
 * @returns 涓昏鑴氭湰锛屾棤鍖归厤鏃惰繑鍥炵涓€涓剼鏈垨 null
 */
export function primaryProjectScript(scripts: ProjectScript[]): ProjectScript | null {
  const regular = scripts.find((script) => !script.runOnWorktreeCreate);
  return regular ?? scripts[0] ?? null;
}

/**
 * 鑾峰彇宸ヤ綔鏍戝垱寤烘椂鐨勮缃剼鏈? * @param scripts - 椤圭洰鑴氭湰鍒楄〃
 * @returns 璁剧疆鑴氭湰锛屾棤鍖归厤鏃惰繑鍥?null
 */
export function setupProjectScript(scripts: ProjectScript[]): ProjectScript | null {
  return scripts.find((script) => script.runOnWorktreeCreate) ?? null;
}
