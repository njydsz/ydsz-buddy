/**
 * @file 妞ゅ湱娲伴懘姘拱瀹搞儱鍙垮Ο鈥虫健
 * @description 閹绘劒绶垫い鍦窗閼存碍婀伴惃?ID 閻㈢喐鍨氶妴浣告嚒娴犮倖妲х亸鍕┾偓浣镐紣娴ｆ粎娲拌ぐ鏇⌒掗弸鎰嫲閻滎垰顣ㄩ崣姗€鍣洪弸鍕紦缁涘浼愰崗宄板毐閺佽埇鈧? */

import {
  MAX_SCRIPT_ID_LENGTH,
  SCRIPT_RUN_COMMAND_PATTERN,
  type KeybindingCommand,
  type ProjectScript,
} from "~/contracts";

/**
 * 瑜版帊绔撮崠鏍壖閺?ID閿涙俺娴嗙亸蹇撳晸閵嗕焦娴涢幑銏ゆ姜濞夋洖鐡х粭锔胯礋鏉╃偛鐡х粭锔衡偓浣稿箵闂勩倝顩荤亸鎹愮箾鐎涙顑侀妴浣瑰焻閺傤叀鍤﹂張鈧径褔鏆辨惔? * @param value - 閸樼喎顫愰懘姘拱閸氬秶袨
 * @returns 瑜版帊绔撮崠鏍ф倵閻ㄥ嫯鍓奸張?ID
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
 * 閺嶈宓侀懘姘拱 ID 閻㈢喐鍨氳箛顐ｅ祹闁款喖鎳℃禒銈嗙垼鐠? * @param scriptId - 閼存碍婀?ID
 * @returns 韫囶偅宓庨柨顔兼嚒娴? */
export const commandForProjectScript = (scriptId: string): KeybindingCommand =>
  SCRIPT_RUN_COMMAND_PATTERN.makeUnsafe(`script.${scriptId}.run`);

/**
 * 娴犲骸鎻╅幑鐑芥暛閸涙垝鎶ゆ稉顓熷絹閸欐牞鍓奸張?ID
 * @param command - 韫囶偅宓庨柨顔兼嚒娴犮倕鐡х粭锔胯
 * @returns 閼存碍婀?ID閿涘矂娼懘姘拱閸涙垝鎶ゆ潻鏂挎礀 null
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
 * 閻㈢喐鍨氭稉瀣╃娑擃亜褰查悽銊ф畱妞ゅ湱娲伴懘姘拱 ID
 * 閸╄桨绨懘姘拱閸氬秶袨閻㈢喐鍨?ID閿涘矁瀚㈠鎻掔摠閸︺劌鍨ǎ璇插閺佹澘鐡ч崥搴ｇ磻閿涘瞼娲块崚鐗堝閸掓澘褰查悽?ID
 * @param name - 閼存碍婀伴崥宥囆? * @param existingIds - 瀹告彃鐡ㄩ崷銊ф畱閼存碍婀?ID 闂嗗棗鎮? * @returns 閸烆垯绔撮惃鍕壖閺?ID
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

  // 閸忔粌绨抽弬瑙勵攳閿涙矮绮庨崷銊︽殶閸楀啩閲滈崥搴ｇ磻闁€熲偓妤€鏁栭弮鎯靶曢崣?  return `${baseId}-${Date.now()}`.slice(0, MAX_SCRIPT_ID_LENGTH);
}

/**
 * 妞ゅ湱娲伴懘姘拱鏉╂劘顢戦弮鍓佸箚婢у啫褰夐柌蹇氱翻閸? * @property project.cwd - 妞ゅ湱娲伴弽鍦窗瑜? * @property worktreePath - 瀹搞儰缍旈弽鎴ｇ熅瀵板嫸绱欓崣顖炩偓澶涚礆
 * @property extraEnv - 妫版繂顦婚悳顖氼暔閸欐﹢鍣洪敍鍫濆讲闁绱? */
interface ProjectScriptRuntimeEnvInput {
  project: {
    cwd: string;
  };
  worktreePath?: string | null;
  extraEnv?: Record<string, string>;
}

/**
 * 鐟欙絾鐎芥い鍦窗閼存碍婀伴惃鍕紣娴ｆ粎娲拌ぐ? * 娴兼ê鍘涙担璺ㄦ暏瀹搞儰缍旈弽鎴ｇ熅瀵板嫸绱濋崥锕€鍨担璺ㄦ暏妞ゅ湱娲伴弽鍦窗瑜? * @param input - 閸栧懎鎯堟い鍦窗閸滃苯浼愭担婊勭埐鐠侯垰绶為惃鍕翻閸? * @returns 閼存碍婀版潻鎰攽閻ㄥ嫬浼愭担婊呮窗瑜? */
export function projectScriptCwd(input: {
  project: {
    cwd: string;
  };
  worktreePath?: string | null;
}): string {
  return input.worktreePath ?? input.project.cwd;
}

/**
 * 閺嬪嫬缂撴い鍦窗閼存碍婀伴惃鍕箥鐞涘本妞傞悳顖氼暔閸欐﹢鍣? * 閸栧懎鎯堟い鍦窗閺嶅湱娲拌ぐ鏇樷偓浣镐紣娴ｆ粍鐖茬捄顖氱窞缁涘鐖ｉ崙鍡楀綁闁插骏绱濋崣顖欑瑢妫版繂顦婚悳顖氼暔閸欐﹢鍣洪崥鍫濊嫙
 * @param input - 鏉╂劘顢戦弮鍓佸箚婢у啫褰夐柌蹇氱翻閸? * @returns 閻滎垰顣ㄩ崣姗€鍣洪柨顔尖偓鐓庮嚠
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
 * 閼惧嘲褰囨稉鏄忣洣閻ㄥ嫰銆嶉惄顔垮壖閺堫剨绱欓棃鐐蹭紣娴ｆ粍鐖查崚娑樼紦閺冩儼绻嶇悰宀€娈戦懘姘拱閿? * 娴兼ê鍘涙潻鏂挎礀缁楊兛绔存稉顏堟姜 runOnWorktreeCreate 閻ㄥ嫯鍓奸張? * @param scripts - 妞ゅ湱娲伴懘姘拱閸掓銆? * @returns 娑撴槒顩﹂懘姘拱閿涘本妫ら崠褰掑帳閺冩儼绻戦崶鐐殿儑娑撯偓娑擃亣鍓奸張顒佸灗 null
 */
export function primaryProjectScript(scripts: ProjectScript[]): ProjectScript | null {
  const regular = scripts.find((script) => !script.runOnWorktreeCreate);
  return regular ?? scripts[0] ?? null;
}

/**
 * 閼惧嘲褰囧銉ょ稊閺嶆垵鍨卞鐑樻閻ㄥ嫯顔曠純顔垮壖閺? * @param scripts - 妞ゅ湱娲伴懘姘拱閸掓銆? * @returns 鐠佸墽鐤嗛懘姘拱閿涘本妫ら崠褰掑帳閺冩儼绻戦崶?null
 */
export function setupProjectScript(scripts: ProjectScript[]): ProjectScript | null {
  return scripts.find((script) => script.runOnWorktreeCreate) ?? null;
}
