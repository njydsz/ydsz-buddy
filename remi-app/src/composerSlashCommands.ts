/**
 * @file composerSlashCommands.ts
 * @description Composer 閺傛粍娼崨鎴掓姢閻ㄥ嫬鐣炬稊澶堚偓浣叫掗弸鎰嫲鏉╁洦鎶ゅΟ鈥虫健閵? * 缁狅紕鎮婇崘鍛枂閺傛粍娼崨鎴掓姢閸掓銆冮敍鍫濐洤 /clear閵?compact閵?model 缁涘绱氶敍? * 閹绘劒绶甸崨鎴掓姢鐟欙絾鐎介妴浣规偝缁便垼绻冨銈冣偓涓硆ovider 閸樼喓鏁撻崨鎴掓姢閸忕厧顔愮粵澶婂閼冲鈧? */

import type { GitBranch, ProviderKind } from "~/contracts";

/**
 * 閸愬懐鐤?Composer 閺傛粍娼崨鎴掓姢閸掓銆冮妴? * - `clear`閿涙碍绔婚梽銈呯秼閸撳秴顕拠婵呯瑐娑撳鏋? * - `compact`閿涙艾甯囩紓鈺佺秼閸撳秶鍤庣粙瀣╃瑐娑撳鏋冩禒銉╁櫞閺€鍓р敄闂? * - `model`閿涙艾鍨忛幑銏犵秼閸撳秶鍤庣粙瀣畱閸濆秴绨插Ο鈥崇€? * - `plan`閿涙艾鍨忛幑銏犲煂鐠佲€冲灊濡€崇础
 * - `default`閿涙艾鍨忛幑銏犳礀閺咁噣鈧俺浜版径鈺偰佸? * - `review`閿涙艾鎯庨崝銊ゅ敩閻礁顓搁弻? * - `fork`閿涙艾鐨㈢痪璺ㄢ柤閸掑棗寮堕崚鐗堟拱閸︾増鍨ㄩ弬?worktree
 * - `side`閿涙矮绮犺ぐ鎾冲缁捐法鈻奸幍鎾崇磻閸欐ぞ绻氶幎銈囨畱娓氀嗙珶閼卞﹤銇? * - `status`閿涙碍妯夌粈杞扮瑐娑撳鏋冩担璺ㄦ暏闁插繐鎷伴柅鐔哄芳闂勬劕鍩楅悩鑸碘偓? * - `subagents`閿涙碍褰冮崗銉ヮ潤閹垫ê鐡欐禒锝囨倞瀹搞儰缍旈惃鍕絹缁€? * - `fast`閿涙艾绱戦崥顖涘灗閸忔娊妫磋箛顐︹偓鐔改佸? */
export const BUILT_IN_COMPOSER_SLASH_COMMANDS = [
  "clear",
  "compact",
  "model",
  "plan",
  "default",
  "review",
  "fork",
  "side",
  "status",
  "subagents",
  "fast",
] as const;

/** 閸愬懐鐤?Composer 閺傛粍娼崨鎴掓姢缁鐎烽敍灞肩矤 BUILT_IN_COMPOSER_SLASH_COMMANDS 閹恒劌顕?*/
export type ComposerSlashCommand = (typeof BUILT_IN_COMPOSER_SLASH_COMMANDS)[number];

/**
 * 閺傛粍娼崨鎴掓姢鐎规矮绠熼敍灞藉瘶閸氼偄鎳℃禒銈呮倳閵嗕焦鐖ｇ粵淇扁偓浣瑰伎鏉╂澘鎷伴弶銉︾爱
 */
export interface ComposerSlashCommandDefinition {
  /** 閸涙垝鎶ら崥?*/
  command: ComposerSlashCommand;
  /** 閺勫墽銇氶弽鍥╊劮閿涘牆顩?`/clear`閿?*/
  label: `/${ComposerSlashCommand}`;
  /** 閸涙垝鎶ら幓蹇氬牚 */
  description: string;
  /** 閸涙垝鎶ら弶銉︾爱閿涙瓪"app"` 娑撳搫绨查悽銊ч獓閸涙垝鎶ら敍瀹?shared"` 娑撳搫鍙℃禍顐㈡嚒娴?*/
  source: "app" | "shared";
}

/**
 * 閺傛粍娼崨鎴掓姢鐠嬪啰鏁ょ紒鎾寸亯閿涘苯瀵橀崥顐㈡嚒娴犮倕鎮曢崪灞藉棘閺? */
export interface ComposerSlashInvocation {
  /** 閸涙垝鎶ら崥?*/
  command: ComposerSlashCommand;
  /** 閸涙垝鎶ら崣鍌涙殶閺傚洦婀?*/
  args: string;
}

/** `/fast` 閸涙垝鎶ら惃鍕惙娴ｆ粎琚崹?*/
export type FastSlashCommandAction = "toggle" | "on" | "off" | "status" | "invalid";
/** `/fork` 閸涙垝鎶ら惃鍕窗閺嶅洨琚崹?*/
export type ForkSlashCommandTarget = "local" | "worktree";

function normalizeSlashCommandName(value: string): string {
  return value.trim().replace(/^\/+/, "").toLowerCase();
}

const CLAUDE_NATIVE_COMMAND_ALIASES: Record<string, readonly string[]> = {
  clear: ["reset", "new"],
  config: ["settings"],
  desktop: ["app"],
  exit: ["quit"],
  feedback: ["bug"],
  branch: ["fork"],
  mobile: ["ios", "android"],
  permissions: ["allowed-tools"],
  "remote-control": ["rc"],
  resume: ["continue"],
};

function getProviderNativeSlashCommandAliases(
  provider: ProviderKind,
  command: string,
): readonly string[] {
  const normalizedCommand = normalizeSlashCommandName(command);
  if (provider !== "claudeAgent") {
    return [];
  }
  return CLAUDE_NATIVE_COMMAND_ALIASES[normalizedCommand] ?? [];
}

function expandProviderNativeSlashCommandNames(
  provider: ProviderKind,
  commandNames: ReadonlyArray<string>,
): string[] {
  const expandedNames = new Set<string>();
  for (const commandName of commandNames) {
    const normalizedCommandName = normalizeSlashCommandName(commandName);
    if (!normalizedCommandName) {
      continue;
    }
    expandedNames.add(normalizedCommandName);
    for (const alias of getProviderNativeSlashCommandAliases(provider, normalizedCommandName)) {
      expandedNames.add(alias);
    }
  }
  return [...expandedNames];
}

function shouldKeepBuiltInSlashCommandDespiteNativeCollision(
  provider: ProviderKind,
  command: ComposerSlashCommand,
): boolean {
  return provider === "codex" && command === "review";
}

/**
 * 閸掋倖鏌囬弰顖氭儊鎼存柨婀?Composer 閼挎粌宕熸稉顓㈡閽?Provider 閸樼喓鏁撻崨鎴掓姢閵? * 娓氬顩?Codex 閻?`/review` 閸涙垝鎶ら悽鍗炵安閻劌鍞寸純顔兼嚒娴犮倖娴涙禒锝忕礉娑撳秴绨查柌宥咁槻閺勫墽銇氶妴? *
 * @param provider - Provider 缁鐎? * @param command - 閸涙垝鎶ら崥? * @returns 閺勵垰鎯佹惔鏃堟閽? */
export function shouldHideProviderNativeCommandFromComposerMenu(
  provider: ProviderKind,
  command: string,
): boolean {
  const normalizedCommand = normalizeSlashCommandName(command);
  return provider === "codex" && normalizedCommand === "review";
}

/**
 * 閼惧嘲褰?Provider 閸樼喓鏁撻崨鎴掓姢閻ㄥ嫭鎮崇槐銏ｇ槤閿涘牆瀵橀崥顐㈡嚒娴犮倕鎮曢崣濠傚従閸掝偄鎮曢敍澶堚偓? * 閻劋绨崷?Composer 閸涙垝鎶ら棃銏℃緲娑擃厽鏁幐浣瑰瘻閸掝偄鎮曢幖婊呭偍閵? *
 * @param provider - Provider 缁鐎? * @param command - 閸涙垝鎶ら崥? * @returns 閹兼粎鍌ㄧ拠宥嗘殶缂佸嫸绱欓崨鎴掓姢閸?+ 閸掝偄鎮曢敍? */
export function getProviderNativeSlashCommandSearchTerms(
  provider: ProviderKind,
  command: string,
): readonly string[] {
  const normalizedCommand = normalizeSlashCommandName(command);
  return [normalizedCommand, ...getProviderNativeSlashCommandAliases(provider, normalizedCommand)];
}

const COMPOSER_SLASH_COMMAND_DEFINITIONS: Record<
  ComposerSlashCommand,
  ComposerSlashCommandDefinition
> = {
  clear: {
    command: "clear",
    label: "/clear",
    description: "Start a fresh thread and clear the current conversation context",
    source: "shared",
  },
  compact: {
    command: "compact",
    label: "/compact",
    description: "Compact the current thread context to free space",
    source: "app",
  },
  model: {
    command: "model",
    label: "/model",
    description: "Switch response model for this thread",
    source: "shared",
  },
  plan: {
    command: "plan",
    label: "/plan",
    description: "Switch this thread into plan mode",
    source: "app",
  },
  default: {
    command: "default",
    label: "/default",
    description: "Switch this thread back to normal chat mode",
    source: "app",
  },
  review: {
    command: "review",
    label: "/review",
    description: "Start a code review for current changes",
    source: "app",
  },
  fork: {
    command: "fork",
    label: "/fork",
    description: "Fork this thread into local or a new worktree",
    source: "app",
  },
  side: {
    command: "side",
    label: "/side",
    description: "Open a guarded sidechat from this thread",
    source: "app",
  },
  status: {
    command: "status",
    label: "/status",
    description: "Show context usage and rate-limit status",
    source: "app",
  },
  subagents: {
    command: "subagents",
    label: "/subagents",
    description: "Insert a prompt that asks the assistant to delegate work",
    source: "app",
  },
  fast: {
    command: "fast",
    label: "/fast",
    description: "Turn fast mode on or off for this thread",
    source: "app",
  },
};

/**
 * 閸掋倖鏌囩紒娆忕暰閸婂吋妲搁崥锔胯礋閸愬懐鐤?Composer 閺傛粍娼崨鎴掓姢
 *
 * @param value - 瀵板懎鍨介弬顓犳畱鐎涙顑佹稉? * @returns 閺勵垰鎯佹稉鍝勫敶缂冾喖鎳℃禒銈忕礄缁鐎风€瑰牆宕奸敍? */
export function isBuiltInComposerSlashCommand(value: string): value is ComposerSlashCommand {
  const normalizedValue = normalizeSlashCommandName(value);
  return BUILT_IN_COMPOSER_SLASH_COMMANDS.some((command) => command === normalizedValue);
}

/**
 * 鐟欙絾鐎介弬鍥ㄦ拱娑撶儤鏋╅弶鐘叉嚒娴犮倛鐨熼悽顭掔礄娴ｈ法鏁ら崗銊╁劥閸愬懐鐤嗛崨鎴掓姢閿? *
 * @param text - 瀵板懓袙閺嬫劗娈戦弬鍥ㄦ拱
 * @returns 閸涙垝鎶ょ拫鍐暏缂佹挻鐏夐敍灞肩瑝閸栧綊鍘ら弮鎯扮箲閸?null
 */
export function parseComposerSlashInvocation(text: string): ComposerSlashInvocation | null {
  return parseComposerSlashInvocationForCommands(text, BUILT_IN_COMPOSER_SLASH_COMMANDS);
}

/**
 * 鐟欙絾鐎介弬鍥ㄦ拱娑撶儤瀵氱€规艾鎳℃禒銈呭灙鐞涖劋鑵戦惃鍕灘閺夌姴鎳℃禒銈堢殶閻? *
 * @param text - 瀵板懓袙閺嬫劗娈戦弬鍥ㄦ拱
 * @param commands - 閸忎浇顔忛惃鍕嚒娴犮倕鍨悰? * @returns 閸涙垝鎶ょ拫鍐暏缂佹挻鐏夐敍灞肩瑝閸栧綊鍘ら弮鎯扮箲閸?null
 */
export function parseComposerSlashInvocationForCommands(
  text: string,
  commands: ReadonlyArray<ComposerSlashCommand>,
): ComposerSlashInvocation | null {
  const match = /^\/([a-z-]+)(?:\s+(.*))?$/i.exec(text.trim());
  if (!match) {
    return null;
  }
  const command = normalizeSlashCommandName(match[1] ?? "");
  if (!command || !commands.includes(command as ComposerSlashCommand)) {
    return null;
  }
  return {
    command: command as ComposerSlashCommand,
    args: (match[2] ?? "").trim(),
  };
}

/**
 * 閼惧嘲褰囬幐鍥х暰閺傛粍娼崨鎴掓姢閻ㄥ嫬鐣炬稊? *
 * @param command - 閸涙垝鎶ら崥? * @returns 閸涙垝鎶ょ€规矮绠? */
export function getComposerSlashCommandDefinition(
  command: ComposerSlashCommand,
): ComposerSlashCommandDefinition {
  return COMPOSER_SLASH_COMMAND_DEFINITIONS[command];
}

/**
 * 閺嶈宓侀弻銉嚄閺傚洦婀版潻鍥ㄦ姢閸栧綊鍘ら惃鍕灘閺夌姴鎳℃禒銈冣偓? * 閺€顖涘瘮閹稿鎳℃禒銈呮倳閵嗕焦鐖ｇ粵鐐灗閹诲繗鍫潻娑滎攽濡紕纭﹂幖婊呭偍閵? *
 * @param query - 閹兼粎鍌ㄩ弻銉嚄閺傚洦婀? * @param commands - 瀵板懓绻冨銈囨畱閸涙垝鎶ら崚妤勩€冮敍宀勭帛鐠併倓璐熼崗銊╁劥閸愬懐鐤嗛崨鎴掓姢
 * @returns 閸栧綊鍘ら惃鍕嚒娴犮倕鐣炬稊澶婂灙鐞? */
export function filterComposerSlashCommands(
  query: string,
  commands: ReadonlyArray<ComposerSlashCommand> = BUILT_IN_COMPOSER_SLASH_COMMANDS,
): ComposerSlashCommandDefinition[] {
  const normalizedQuery = query.trim().toLowerCase();
  const matches = commands.filter((command) => {
    if (!normalizedQuery) {
      return true;
    }
    const definition = COMPOSER_SLASH_COMMAND_DEFINITIONS[command];
    return (
      command.includes(normalizedQuery) ||
      definition.label.slice(1).includes(normalizedQuery) ||
      definition.description.toLowerCase().includes(normalizedQuery)
    );
  });

  return matches.map((command) => COMPOSER_SLASH_COMMAND_DEFINITIONS[command]);
}

function hasMeaningfulComposerText(prompt: string): boolean {
  return prompt.trim().length > 0;
}

/**
 * 閸掋倖鏌囬弰顖氭儊閸欘垯浜掗幓鎰返 `/fork` 閸涙垝鎶ら妴? * 娴犲懎婀?Composer 娑撹櫣鈹栭敍鍫熸￥閺傚洦婀伴妴浣规￥闂勫嫪娆㈤妴浣规￥娑撳﹣绗呴弬鍥风礆娑撴柨顦╂禍搴ㄧ帛鐠併倓姘︽禍鎺撃佸蹇旀閸欘垳鏁ら妴? *
 * @param input - Composer 閻樿埖鈧椒淇婇幁? * @returns 閺勵垰鎯侀崣顖欎簰閹绘劒绶?`/fork` 閸涙垝鎶? */
export function canOfferForkSlashCommand(input: {
  prompt: string;
  imageCount: number;
  terminalContextCount: number;
  selectedSkillCount: number;
  selectedMentionCount: number;
  interactionMode: "default" | "plan";
}): boolean {
  return (
    !hasMeaningfulComposerText(input.prompt) &&
    input.imageCount === 0 &&
    input.terminalContextCount === 0 &&
    input.selectedSkillCount === 0 &&
    input.selectedMentionCount === 0 &&
    input.interactionMode === "default"
  );
}

/**
 * 閸掋倖鏌囬弰顖氭儊閸欘垯浜掗幓鎰返 `/side` 閸涙垝鎶ら妴? * 娴犲懎婀?Composer 娑撹櫣鈹栭妴浣割槱娴滃酣绮拋銈勬唉娴滄帗膩瀵繋绗栬ぐ鎾冲娑撳秵妲告笟褑绔熼懕濠傘亯閺冭泛褰查悽銊ｂ偓? *
 * @param input - Composer 閻樿埖鈧椒淇婇幁? * @returns 閺勵垰鎯侀崣顖欎簰閹绘劒绶?`/side` 閸涙垝鎶? */
export function canOfferSideSlashCommand(input: {
  prompt: string;
  imageCount: number;
  terminalContextCount: number;
  selectedSkillCount: number;
  selectedMentionCount: number;
  interactionMode: "default" | "plan";
  isSidechat: boolean;
}): boolean {
  return (
    !hasMeaningfulComposerText(input.prompt) &&
    input.imageCount === 0 &&
    input.terminalContextCount === 0 &&
    input.selectedSkillCount === 0 &&
    input.selectedMentionCount === 0 &&
    input.interactionMode === "default" &&
    !input.isSidechat
  );
}

/**
 * 閸掋倖鏌囬弰顖氭儊閸欘垯浜掗幓鎰返 `/review` 閸涙垝鎶ら妴? * 娴犲懎婀?Composer 娑撹櫣鈹栭敍鍫熸￥閺傚洦婀伴妴浣规￥闂勫嫪娆㈤妴浣规￥娑撳﹣绗呴弬鍥风礆閺冭泛褰查悽銊ｂ偓? *
 * @param input - Composer 閻樿埖鈧椒淇婇幁? * @returns 閺勵垰鎯侀崣顖欎簰閹绘劒绶?`/review` 閸涙垝鎶? */
export function canOfferReviewSlashCommand(input: {
  prompt: string;
  imageCount: number;
  terminalContextCount: number;
  selectedSkillCount: number;
  selectedMentionCount: number;
}): boolean {
  return (
    !hasMeaningfulComposerText(input.prompt) &&
    input.imageCount === 0 &&
    input.terminalContextCount === 0 &&
    input.selectedSkillCount === 0 &&
    input.selectedMentionCount === 0
  );
}

/**
 * 閺嬪嫬缂?`/subagents` 閸涙垝鎶ら惃鍕絹缁€鐑樻瀮閺堫兙鈧? * 婵″倹鐏夊鍙夋箒閻劍鍩涙潏鎾冲弳閿涘苯鍨崷銊︽汞鐏忔崘鎷烽崝鐘茬摍娴狅絿鎮婃慨鏃€澧幐鍥︽姢閵? *
 * @param existingPrompt - 閻劍鍩涘鍙夋箒閻ㄥ嫭褰佺粈鐑樻瀮閺? * @returns 閸栧懎鎯堢€涙劒鍞悶鍡楊潤閹垫ɑ瀵氭禒銈囨畱鐎瑰本鏆ｉ幓鎰仛
 */
export function buildSubagentsPrompt(existingPrompt: string): string {
  const cannedPrompt =
    "Run subagents for different tasks. Delegate distinct work in parallel when helpful and then synthesize the results.";
  const trimmedPrompt = existingPrompt.trim();
  return trimmedPrompt.length > 0 ? `${trimmedPrompt}\n\n${cannedPrompt}` : cannedPrompt;
}

/**
 * 閺嬪嫬缂?`/review` 閸涙垝鎶ら惃鍕絹缁€鐑樻瀮閺堫兙鈧? * 閺嶈宓佺€光剝鐓￠惄顔界垼閿涘牊婀幓鎰唉閺囧瓨鏁奸幋鏍у瀻閺€顖氭▕瀵偊绱氶悽鐔稿灇娑撳秴鎮撻惃鍕吀閺屻儲瀵氭禒銈冣偓? *
 * @param input.target - 鐎光剝鐓￠惄顔界垼閿涙瓪"changes"` 鐎光剝鐓￠張顏呭絹娴溿倖娲块弨鐧哥礉`"base-branch"` 鐎光剝鐓￠崚鍡樻暜瀹割喖绱? * @returns 鐎光剝鐓￠幓鎰仛閺傚洦婀? */
export function buildReviewPrompt(input: { target: "changes" | "base-branch" }): string {
  const baseInstruction =
    "Review the local code changes for bugs, risks, behavioural regressions, and missing tests. Findings first, ordered by severity.";
  if (input.target === "base-branch") {
    return `${baseInstruction}\nFocus on the current branch diff against its base branch.`;
  }
  return `${baseInstruction}\nFocus on the current uncommitted changes.`;
}

/**
 * 鐟欙絾鐎?`/fast` 閸涙垝鎶ら惃鍕惙娴ｆ粎琚崹? *
 * @param text - 閸涙垝鎶ら弬鍥ㄦ拱
 * @returns 閹垮秳缍旂猾璇茬€烽敍宀勬姜 `/fast` 閸涙垝鎶ら弮鎯扮箲閸?null
 */
export function parseFastSlashCommandAction(text: string): FastSlashCommandAction | null {
  const invocation = parseComposerSlashInvocation(text);
  if (!invocation || invocation.command !== "fast") {
    return null;
  }
  const arg = invocation.args.toLowerCase();
  if (!arg) {
    return "toggle";
  }
  if (arg === "on") {
    return "on";
  }
  if (arg === "off") {
    return "off";
  }
  if (arg === "status") {
    return "status";
  }
  return "invalid";
}

/**
 * 鐟欙絾鐎?`/fork` 閺傛粍娼崨鎴掓姢閻ㄥ嫭鐗撮崚鍡樻暜閵? * 閹稿绱崗鍫㈤獓閺屻儲澹橀敍姘秼閸?worktree 閸栧綊鍘ら惃鍕瀻閺€?閳?瑜版挸澧犻崚鍡樻暜 閳?濞叉槒绌痪璺ㄢ柤閸掑棙鏁妴? *
 * @param input.branches - Git 閸掑棙鏁崚妤勩€? * @param input.activeProjectCwd - 濞叉槒绌い鍦窗閻ㄥ嫬浼愭担婊呮窗瑜? * @param input.activeThreadBranch - 濞叉槒绌痪璺ㄢ柤閻ㄥ嫬鍨庨弨顖氭倳
 * @returns 閺嶇懓鍨庨弨顖氭倳閿涘本妫ゅ▔鏇犫€樼€规碍妞傛潻鏂挎礀 null
 */
export function resolveComposerSlashRootBranch(input: {
  branches: ReadonlyArray<GitBranch> | null | undefined;
  activeProjectCwd: string | null | undefined;
  activeThreadBranch: string | null | undefined;
}): string | null {
  return (
    input.branches?.find(
      (branch) =>
        branch.current === true &&
        (branch.worktreePath === null ||
          branch.worktreePath === undefined ||
          branch.worktreePath === input.activeProjectCwd),
    )?.name ??
    input.branches?.find((branch) => branch.current === true)?.name ??
    input.activeThreadBranch ??
    null
  );
}

/**
 * 閼惧嘲褰囪ぐ鎾冲閸欘垳鏁ら惃?Composer 閺傛粍娼崨鎴掓姢閸掓銆冮妴? * 閺嶈宓?Provider 缁鐎烽崪灞藉閼宠姤鏁幐浣瑰剰閸愪絻绻冨銈呭讲閻劌鎳℃禒銈忕礉
 * 閸氬本妞傞幒鎺楁珟娑?Provider 閸樼喓鏁撻崨鎴掓姢閸愯尙鐛婇惃鍕敶缂冾喖鎳℃禒銈冣偓? *
 * @param input.provider - 瑜版挸澧?Provider 缁鐎? * @param input.supportsFastSlashCommand - 閺勵垰鎯侀弨顖涘瘮 `/fast` 閸涙垝鎶? * @param input.canOfferCompactCommand - 閺勵垰鎯侀崣顖欎簰閹绘劒绶?`/compact` 閸涙垝鎶? * @param input.canOfferReviewCommand - 閺勵垰鎯侀崣顖欎簰閹绘劒绶?`/review` 閸涙垝鎶? * @param input.canOfferForkCommand - 閺勵垰鎯侀崣顖欎簰閹绘劒绶?`/fork` 閸涙垝鎶? * @param input.canOfferSideCommand - 閺勵垰鎯侀崣顖欎簰閹绘劒绶?`/side` 閸涙垝鎶? * @param input.providerNativeCommandNames - Provider 閸樼喓鏁撻崨鎴掓姢閸氬秴鍨悰? * @returns 閸欘垳鏁ら惃鍕嚒娴犮倕鍨悰? */
export function getAvailableComposerSlashCommands(input: {
  provider: ProviderKind;
  supportsFastSlashCommand: boolean;
  canOfferCompactCommand: boolean;
  canOfferReviewCommand: boolean;
  canOfferForkCommand: boolean;
  canOfferSideCommand: boolean;
  providerNativeCommandNames?: ReadonlyArray<string>;
}): ComposerSlashCommand[] {
  const collidingNativeCommandNames = new Set<ComposerSlashCommand>(
    expandProviderNativeSlashCommandNames(
      input.provider,
      input.providerNativeCommandNames ?? [],
    ).filter(
      (name): name is ComposerSlashCommand =>
        isBuiltInComposerSlashCommand(name) &&
        !shouldKeepBuiltInSlashCommandDespiteNativeCollision(input.provider, name),
    ),
  );

  const availableCommands: ComposerSlashCommand[] =
    input.provider !== "claudeAgent"
      ? [
          "clear",
          ...(input.canOfferCompactCommand ? (["compact"] as const) : []),
          "model",
          ...(input.supportsFastSlashCommand ? (["fast"] as const) : []),
          "plan",
          "default",
          ...(input.canOfferReviewCommand ? (["review"] as const) : []),
          ...(input.canOfferForkCommand ? (["fork"] as const) : []),
          ...(input.canOfferSideCommand ? (["side"] as const) : []),
          "status",
          "subagents",
        ]
      : [
          // Claude owns most slash-command UX natively; sidechat remains app-level because it
          // creates a Remi Code split/context clone before the provider sees the first turn.
          ...(input.canOfferSideCommand ? (["side"] as const) : []),
        ];
  return availableCommands.filter((command) => !collidingNativeCommandNames.has(command));
}

/**
 * 閸掋倖鏌囬幐鍥х暰閸涙垝鎶ら弰顖氭儊娑?Provider 閸樼喓鏁撻崨鎴掓姢閿涘牆瀵橀崥顐㈠焼閸氬秴灏柊宥忕礆
 *
 * @param provider - Provider 缁鐎? * @param commandNames - Provider 閸樼喓鏁撻崨鎴掓姢閸氬秴鍨悰? * @param command - 瀵板懎鍨介弬顓犳畱閸涙垝鎶ら崥? * @returns 閺勵垰鎯佹稉?Provider 閸樼喓鏁撻崨鎴掓姢
 */
export function hasProviderNativeSlashCommand(
  provider: ProviderKind,
  commandNames: ReadonlyArray<string>,
  command: string,
): boolean {
  const normalizedCommand = normalizeSlashCommandName(command);
  return expandProviderNativeSlashCommandNames(provider, commandNames).includes(normalizedCommand);
}

/**
 * 閺嬪嫬缂?`/review` 閺傛粍娼崨鎴掓姢閻ㄥ嫬鐣弫瀛樺絹缁€鐑樻瀮閺堫兙鈧? * 閺€顖涘瘮閹稿洤鐣剧€光剝鐓￠惄顔界垼閿涘牊婀幓鎰唉閺囧瓨鏁奸幋鏍х唨閸戝棗鍨庨弨顖ょ礆閸滃矂顤傛径鏍у彠濞夈劎鍋ｉ妴? *
 * @param args - 閸涙垝鎶ら崣鍌涙殶閿涘苯褰查崠鍛儓 `base` 閸忔娊鏁€涙瀵氱€规艾顓搁弻銉ョ唨閸戝棗鍨庨弨? * @returns 鐎瑰本鏆ｉ惃鍕吀閺屻儲褰佺粈鐑樻瀮閺? */
export function buildSlashReviewComposerPrompt(args: string): string {
  const trimmedArgs = args.trim();
  const normalizedArgs = trimmedArgs.toLowerCase();
  const reviewTarget =
    normalizedArgs === "base" || normalizedArgs.startsWith("base ") ? "base-branch" : "changes";
  const basePrompt = buildReviewPrompt({ target: reviewTarget });
  if (!trimmedArgs) {
    return basePrompt;
  }
  if (reviewTarget === "base-branch") {
    const baseBranchHint = trimmedArgs.replace(/^base\b/i, "").trim();
    return baseBranchHint.length > 0
      ? `${basePrompt}\nUse ${baseBranchHint} as the base branch if needed.`
      : basePrompt;
  }
  return `${basePrompt}\nFocus especially on: ${trimmedArgs}`;
}

/**
 * 鐟欙絾鐎?`/fork` 閸涙垝鎶ら惃鍕窗閺嶅洤寮弫鑸偓? * 娴犲懏甯撮崣?`local` 閹?`worktree` 娴ｆ粈璐熼張澶嬫櫏閸欏倹鏆熼妴? *
 * @param args - 閸涙垝鎶ら崣鍌涙殶閺傚洦婀? * @returns 鐟欙絾鐎界紒鎾寸亯閿涘苯瀵橀崥顐ゆ窗閺嶅洨琚崹瀣嫲閺勵垰鎯侀弮鐘虫櫏
 */
export function parseForkSlashCommandArgs(args: string): {
  target: ForkSlashCommandTarget | null;
  invalid: boolean;
} {
  const trimmedArgs = args.trim();
  if (!trimmedArgs) {
    return { target: null, invalid: false };
  }

  const match = /^(local|worktree)$/i.exec(trimmedArgs);
  if (!match) {
    return { target: null, invalid: true };
  }

  return {
    target: match[1]!.toLowerCase() as ForkSlashCommandTarget,
    invalid: false,
  };
}
