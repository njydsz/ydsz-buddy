/**
 * @file composerSlashCommands.ts
 * @description Composer 鏂滄潬鍛戒护鐨勫畾涔夈€佽В鏋愬拰杩囨护妯″潡銆? * 绠＄悊鍐呯疆鏂滄潬鍛戒护鍒楄〃锛堝 /clear銆?compact銆?model 绛夛級锛? * 鎻愪緵鍛戒护瑙ｆ瀽銆佹悳绱㈣繃婊ゃ€丳rovider 鍘熺敓鍛戒护鍏煎绛夊姛鑳姐€? */

import type { GitBranch, ProviderKind } from "~/contracts";

/**
 * 鍐呯疆 Composer 鏂滄潬鍛戒护鍒楄〃銆? * - `clear`锛氭竻闄ゅ綋鍓嶅璇濅笂涓嬫枃
 * - `compact`锛氬帇缂╁綋鍓嶇嚎绋嬩笂涓嬫枃浠ラ噴鏀剧┖闂? * - `model`锛氬垏鎹㈠綋鍓嶇嚎绋嬬殑鍝嶅簲妯″瀷
 * - `plan`锛氬垏鎹㈠埌璁″垝妯″紡
 * - `default`锛氬垏鎹㈠洖鏅€氳亰澶╂ā寮? * - `review`锛氬惎鍔ㄤ唬鐮佸鏌? * - `fork`锛氬皢绾跨▼鍒嗗弶鍒版湰鍦版垨鏂?worktree
 * - `side`锛氫粠褰撳墠绾跨▼鎵撳紑鍙椾繚鎶ょ殑渚ц竟鑱婂ぉ
 * - `status`锛氭樉绀轰笂涓嬫枃浣跨敤閲忓拰閫熺巼闄愬埗鐘舵€? * - `subagents`锛氭彃鍏ュ鎵樺瓙浠ｇ悊宸ヤ綔鐨勬彁绀? * - `fast`锛氬紑鍚垨鍏抽棴蹇€熸ā寮? */
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

/** 鍐呯疆 Composer 鏂滄潬鍛戒护绫诲瀷锛屼粠 BUILT_IN_COMPOSER_SLASH_COMMANDS 鎺ㄥ */
export type ComposerSlashCommand = (typeof BUILT_IN_COMPOSER_SLASH_COMMANDS)[number];

/**
 * 鏂滄潬鍛戒护瀹氫箟锛屽寘鍚懡浠ゅ悕銆佹爣绛俱€佹弿杩板拰鏉ユ簮
 */
export interface ComposerSlashCommandDefinition {
  /** 鍛戒护鍚?*/
  command: ComposerSlashCommand;
  /** 鏄剧ず鏍囩锛堝 `/clear`锛?*/
  label: `/${ComposerSlashCommand}`;
  /** 鍛戒护鎻忚堪 */
  description: string;
  /** 鍛戒护鏉ユ簮锛歚"app"` 涓哄簲鐢ㄧ骇鍛戒护锛宍"shared"` 涓哄叡浜懡浠?*/
  source: "app" | "shared";
}

/**
 * 鏂滄潬鍛戒护璋冪敤缁撴灉锛屽寘鍚懡浠ゅ悕鍜屽弬鏁? */
export interface ComposerSlashInvocation {
  /** 鍛戒护鍚?*/
  command: ComposerSlashCommand;
  /** 鍛戒护鍙傛暟鏂囨湰 */
  args: string;
}

/** `/fast` 鍛戒护鐨勬搷浣滅被鍨?*/
export type FastSlashCommandAction = "toggle" | "on" | "off" | "status" | "invalid";
/** `/fork` 鍛戒护鐨勭洰鏍囩被鍨?*/
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
 * 鍒ゆ柇鏄惁搴斿湪 Composer 鑿滃崟涓殣钘?Provider 鍘熺敓鍛戒护銆? * 渚嬪 Codex 鐨?`/review` 鍛戒护鐢卞簲鐢ㄥ唴缃懡浠ゆ浛浠ｏ紝涓嶅簲閲嶅鏄剧ず銆? *
 * @param provider - Provider 绫诲瀷
 * @param command - 鍛戒护鍚? * @returns 鏄惁搴旈殣钘? */
export function shouldHideProviderNativeCommandFromComposerMenu(
  provider: ProviderKind,
  command: string,
): boolean {
  const normalizedCommand = normalizeSlashCommandName(command);
  return provider === "codex" && normalizedCommand === "review";
}

/**
 * 鑾峰彇 Provider 鍘熺敓鍛戒护鐨勬悳绱㈣瘝锛堝寘鍚懡浠ゅ悕鍙婂叾鍒悕锛夈€? * 鐢ㄤ簬鍦?Composer 鍛戒护闈㈡澘涓敮鎸佹寜鍒悕鎼滅储銆? *
 * @param provider - Provider 绫诲瀷
 * @param command - 鍛戒护鍚? * @returns 鎼滅储璇嶆暟缁勶紙鍛戒护鍚?+ 鍒悕锛? */
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
 * 鍒ゆ柇缁欏畾鍊兼槸鍚︿负鍐呯疆 Composer 鏂滄潬鍛戒护
 *
 * @param value - 寰呭垽鏂殑瀛楃涓? * @returns 鏄惁涓哄唴缃懡浠わ紙绫诲瀷瀹堝崼锛? */
export function isBuiltInComposerSlashCommand(value: string): value is ComposerSlashCommand {
  const normalizedValue = normalizeSlashCommandName(value);
  return BUILT_IN_COMPOSER_SLASH_COMMANDS.some((command) => command === normalizedValue);
}

/**
 * 瑙ｆ瀽鏂囨湰涓烘枩鏉犲懡浠よ皟鐢紙浣跨敤鍏ㄩ儴鍐呯疆鍛戒护锛? *
 * @param text - 寰呰В鏋愮殑鏂囨湰
 * @returns 鍛戒护璋冪敤缁撴灉锛屼笉鍖归厤鏃惰繑鍥?null
 */
export function parseComposerSlashInvocation(text: string): ComposerSlashInvocation | null {
  return parseComposerSlashInvocationForCommands(text, BUILT_IN_COMPOSER_SLASH_COMMANDS);
}

/**
 * 瑙ｆ瀽鏂囨湰涓烘寚瀹氬懡浠ゅ垪琛ㄤ腑鐨勬枩鏉犲懡浠よ皟鐢? *
 * @param text - 寰呰В鏋愮殑鏂囨湰
 * @param commands - 鍏佽鐨勫懡浠ゅ垪琛? * @returns 鍛戒护璋冪敤缁撴灉锛屼笉鍖归厤鏃惰繑鍥?null
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
 * 鑾峰彇鎸囧畾鏂滄潬鍛戒护鐨勫畾涔? *
 * @param command - 鍛戒护鍚? * @returns 鍛戒护瀹氫箟
 */
export function getComposerSlashCommandDefinition(
  command: ComposerSlashCommand,
): ComposerSlashCommandDefinition {
  return COMPOSER_SLASH_COMMAND_DEFINITIONS[command];
}

/**
 * 鏍规嵁鏌ヨ鏂囨湰杩囨护鍖归厤鐨勬枩鏉犲懡浠ゃ€? * 鏀寔鎸夊懡浠ゅ悕銆佹爣绛炬垨鎻忚堪杩涜妯＄硦鎼滅储銆? *
 * @param query - 鎼滅储鏌ヨ鏂囨湰
 * @param commands - 寰呰繃婊ょ殑鍛戒护鍒楄〃锛岄粯璁や负鍏ㄩ儴鍐呯疆鍛戒护
 * @returns 鍖归厤鐨勫懡浠ゅ畾涔夊垪琛? */
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
 * 鍒ゆ柇鏄惁鍙互鎻愪緵 `/fork` 鍛戒护銆? * 浠呭湪 Composer 涓虹┖锛堟棤鏂囨湰銆佹棤闄勪欢銆佹棤涓婁笅鏂囷級涓斿浜庨粯璁や氦浜掓ā寮忔椂鍙敤銆? *
 * @param input - Composer 鐘舵€佷俊鎭? * @returns 鏄惁鍙互鎻愪緵 `/fork` 鍛戒护
 */
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
 * 鍒ゆ柇鏄惁鍙互鎻愪緵 `/side` 鍛戒护銆? * 浠呭湪 Composer 涓虹┖銆佸浜庨粯璁や氦浜掓ā寮忎笖褰撳墠涓嶆槸渚ц竟鑱婂ぉ鏃跺彲鐢ㄣ€? *
 * @param input - Composer 鐘舵€佷俊鎭? * @returns 鏄惁鍙互鎻愪緵 `/side` 鍛戒护
 */
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
 * 鍒ゆ柇鏄惁鍙互鎻愪緵 `/review` 鍛戒护銆? * 浠呭湪 Composer 涓虹┖锛堟棤鏂囨湰銆佹棤闄勪欢銆佹棤涓婁笅鏂囷級鏃跺彲鐢ㄣ€? *
 * @param input - Composer 鐘舵€佷俊鎭? * @returns 鏄惁鍙互鎻愪緵 `/review` 鍛戒护
 */
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
 * 鏋勫缓 `/subagents` 鍛戒护鐨勬彁绀烘枃鏈€? * 濡傛灉宸叉湁鐢ㄦ埛杈撳叆锛屽垯鍦ㄦ湯灏捐拷鍔犲瓙浠ｇ悊濮旀墭鎸囦护銆? *
 * @param existingPrompt - 鐢ㄦ埛宸叉湁鐨勬彁绀烘枃鏈? * @returns 鍖呭惈瀛愪唬鐞嗗鎵樻寚浠ょ殑瀹屾暣鎻愮ず
 */
export function buildSubagentsPrompt(existingPrompt: string): string {
  const cannedPrompt =
    "Run subagents for different tasks. Delegate distinct work in parallel when helpful and then synthesize the results.";
  const trimmedPrompt = existingPrompt.trim();
  return trimmedPrompt.length > 0 ? `${trimmedPrompt}\n\n${cannedPrompt}` : cannedPrompt;
}

/**
 * 鏋勫缓 `/review` 鍛戒护鐨勬彁绀烘枃鏈€? * 鏍规嵁瀹℃煡鐩爣锛堟湭鎻愪氦鏇存敼鎴栧垎鏀樊寮傦級鐢熸垚涓嶅悓鐨勫鏌ユ寚浠ゃ€? *
 * @param input.target - 瀹℃煡鐩爣锛歚"changes"` 瀹℃煡鏈彁浜ゆ洿鏀癸紝`"base-branch"` 瀹℃煡鍒嗘敮宸紓
 * @returns 瀹℃煡鎻愮ず鏂囨湰
 */
export function buildReviewPrompt(input: { target: "changes" | "base-branch" }): string {
  const baseInstruction =
    "Review the local code changes for bugs, risks, behavioural regressions, and missing tests. Findings first, ordered by severity.";
  if (input.target === "base-branch") {
    return `${baseInstruction}\nFocus on the current branch diff against its base branch.`;
  }
  return `${baseInstruction}\nFocus on the current uncommitted changes.`;
}

/**
 * 瑙ｆ瀽 `/fast` 鍛戒护鐨勬搷浣滅被鍨? *
 * @param text - 鍛戒护鏂囨湰
 * @returns 鎿嶄綔绫诲瀷锛岄潪 `/fast` 鍛戒护鏃惰繑鍥?null
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
 * 瑙ｆ瀽 `/fork` 鏂滄潬鍛戒护鐨勬牴鍒嗘敮銆? * 鎸変紭鍏堢骇鏌ユ壘锛氬綋鍓?worktree 鍖归厤鐨勫垎鏀?鈫?褰撳墠鍒嗘敮 鈫?娲昏穬绾跨▼鍒嗘敮銆? *
 * @param input.branches - Git 鍒嗘敮鍒楄〃
 * @param input.activeProjectCwd - 娲昏穬椤圭洰鐨勫伐浣滅洰褰? * @param input.activeThreadBranch - 娲昏穬绾跨▼鐨勫垎鏀悕
 * @returns 鏍瑰垎鏀悕锛屾棤娉曠‘瀹氭椂杩斿洖 null
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
 * 鑾峰彇褰撳墠鍙敤鐨?Composer 鏂滄潬鍛戒护鍒楄〃銆? * 鏍规嵁 Provider 绫诲瀷鍜屽姛鑳芥敮鎸佹儏鍐佃繃婊ゅ彲鐢ㄥ懡浠わ紝
 * 鍚屾椂鎺掗櫎涓?Provider 鍘熺敓鍛戒护鍐茬獊鐨勫唴缃懡浠ゃ€? *
 * @param input.provider - 褰撳墠 Provider 绫诲瀷
 * @param input.supportsFastSlashCommand - 鏄惁鏀寔 `/fast` 鍛戒护
 * @param input.canOfferCompactCommand - 鏄惁鍙互鎻愪緵 `/compact` 鍛戒护
 * @param input.canOfferReviewCommand - 鏄惁鍙互鎻愪緵 `/review` 鍛戒护
 * @param input.canOfferForkCommand - 鏄惁鍙互鎻愪緵 `/fork` 鍛戒护
 * @param input.canOfferSideCommand - 鏄惁鍙互鎻愪緵 `/side` 鍛戒护
 * @param input.providerNativeCommandNames - Provider 鍘熺敓鍛戒护鍚嶅垪琛? * @returns 鍙敤鐨勫懡浠ゅ垪琛? */
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
 * 鍒ゆ柇鎸囧畾鍛戒护鏄惁涓?Provider 鍘熺敓鍛戒护锛堝寘鍚埆鍚嶅尮閰嶏級
 *
 * @param provider - Provider 绫诲瀷
 * @param commandNames - Provider 鍘熺敓鍛戒护鍚嶅垪琛? * @param command - 寰呭垽鏂殑鍛戒护鍚? * @returns 鏄惁涓?Provider 鍘熺敓鍛戒护
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
 * 鏋勫缓 `/review` 鏂滄潬鍛戒护鐨勫畬鏁存彁绀烘枃鏈€? * 鏀寔鎸囧畾瀹℃煡鐩爣锛堟湭鎻愪氦鏇存敼鎴栧熀鍑嗗垎鏀級鍜岄澶栧叧娉ㄧ偣銆? *
 * @param args - 鍛戒护鍙傛暟锛屽彲鍖呭惈 `base` 鍏抽敭瀛楁寚瀹氬鏌ュ熀鍑嗗垎鏀? * @returns 瀹屾暣鐨勫鏌ユ彁绀烘枃鏈? */
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
 * 瑙ｆ瀽 `/fork` 鍛戒护鐨勭洰鏍囧弬鏁般€? * 浠呮帴鍙?`local` 鎴?`worktree` 浣滀负鏈夋晥鍙傛暟銆? *
 * @param args - 鍛戒护鍙傛暟鏂囨湰
 * @returns 瑙ｆ瀽缁撴灉锛屽寘鍚洰鏍囩被鍨嬪拰鏄惁鏃犳晥
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
