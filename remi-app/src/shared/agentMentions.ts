/**
 * @file 浠ｇ悊鎻愬強锛園mention锛夎В鏋愬伐鍏锋ā鍧? *
 * @description
 * 鎻愪緵鐢ㄦ埛杈撳叆涓?`@alias(task)` 鏍煎紡鐨勫唴鑱斾唬鐞嗘寚浠よВ鏋愬姛鑳姐€? * 鏀寔浠庢枃鏈腑鎻愬彇浠ｇ悊鎻愬強锛屽苟灏嗚繖浜涙彁鍙婅浆鎹负缁撴瀯鍖栫殑浠ｇ悊璋冪敤鎸囦护锛? * 鐢ㄤ簬鏋勫缓 Claude 瀛愪唬鐞嗙殑鎻愮ず璇嶃€? *
 * 鏍稿績鍔熻兘锛? * - 瑙ｆ瀽鏂囨湰涓殑 `@alias(task)` 鏍煎紡鎻愬強锛坄parseAgentMentionInvocations`锛? * - 鏋勫缓 Claude 瀛愪唬鐞嗙殑缁撴瀯鍖栨彁绀鸿瘝锛坄buildClaudeSubagentPrompt`锛? * - 鏀寔鎷彿骞宠　鐨勪换鍔℃弿杩拌В鏋? * - 鏀寔澶氱浠ｇ悊鍒悕鏍煎紡
 *
 * 浣跨敤鍦烘櫙锛? * - 鐢ㄦ埛鍦ㄨ亰澶╀腑浣跨敤 `@agent-name(鎵ц鏌愪釜浠诲姟)` 鏍煎紡璋冪敤瀛愪唬鐞? * - 灏嗙敤鎴风殑鑷劧璇█鎸囦护杞崲涓虹粨鏋勫寲鐨勪唬鐞嗚皟鐢? * - 涓?Claude 浠ｇ悊鐢熸垚鍖呭惈瀛愪唬鐞嗘寚浠ょ殑瀹屾暣鎻愮ず璇? *
 * @module agentMentions
 * @layer 鍏变韩宸ュ叿灞? *
 * @example
 * ```ts
 * import { parseAgentMentionInvocations, buildClaudeSubagentPrompt } from './agentMentions';
 *
 * const text = '璇峰府鎴?@reviewer(瀹℃煡杩欐浠ｇ爜) 鍜?@tester(缂栧啓鍗曞厓娴嬭瘯)';
 *
 * // 瑙ｆ瀽鎵€鏈変唬鐞嗘彁鍙? * const invocations = parseAgentMentionInvocations(text, 'claudeAgent');
 * console.log(invocations);
 * // [
 * //   { alias: 'reviewer', task: '瀹℃煡杩欐浠ｇ爜', ... },
 * //   { alias: 'tester', task: '缂栧啓鍗曞厓娴嬭瘯', ... }
 * // ]
 *
 * // 鏋勫缓 Claude 瀛愪唬鐞嗘彁绀鸿瘝
 * const result = buildClaudeSubagentPrompt(text);
 * console.log(result.prompt);
 * // 鐢熸垚鍖呭惈瀛愪唬鐞嗘寚浠ょ殑瀹屾暣鎻愮ず璇? * ```
 */
import {
  resolveAgentAlias,
  type ClaudeSubagentAliasDefinition,
  type ProviderKind,
  type ResolvedAgentAlias,
} from "~/contracts";

/**
 * 瑙ｆ瀽鍚庣殑浠ｇ悊鎻愬強璋冪敤淇℃伅鎺ュ彛
 *
 * 鍖呭惈浠庢枃鏈腑鎻愬彇鐨勫崟涓?`@alias(task)` 璋冪敤鐨勬墍鏈変俊鎭紝
 * 鐢ㄤ簬鍚庣画鐨勪唬鐞嗚皟搴﹀拰浠诲姟鎵ц銆? *
 * @interface ParsedAgentMentionInvocation
 *
 * @property {string} alias - 浠ｇ悊鍒悕锛堝 "reviewer"銆?tester"锛? * @property {string} task - 浠诲姟鎻忚堪锛堟嫭鍙峰唴鐨勫唴瀹癸級
 * @property {string} raw - 鍘熷鎻愬強鏂囨湰锛堝寘鎷?`@alias(task)` 瀹屾暣鍐呭锛? * @property {number} start - 鎻愬強鍦ㄥ師鏂囨湰涓殑璧峰浣嶇疆绱㈠紩
 * @property {number} end - 鎻愬強鍦ㄥ師鏂囨湰涓殑缁撴潫浣嶇疆绱㈠紩锛堜笉鍖呭惈锛? * @property {ResolvedAgentAlias} definition - 瑙ｆ瀽鍚庣殑浠ｇ悊瀹氫箟淇℃伅
 *
 * @example
 * ```ts
 * const invocation: ParsedAgentMentionInvocation = {
 *   alias: 'reviewer',
 *   task: '瀹℃煡杩欐浠ｇ爜',
 *   raw: '@reviewer(瀹℃煡杩欐浠ｇ爜)',
 *   start: 10,
 *   end: 28,
 *   definition: { alias: 'reviewer', kind: 'claude-subagent', ... }
 * };
 * ```
 */
export interface ParsedAgentMentionInvocation {
  readonly alias: string;
  readonly task: string;
  readonly raw: string;
  readonly start: number;
  readonly end: number;
  readonly definition: ResolvedAgentAlias;
}

/**
 * 鍒ゆ柇瀛楃鏄惁涓哄悎娉曠殑浠ｇ悊鍒悕瀛楃
 *
 * 鍚堟硶鐨勫埆鍚嶅瓧绗﹀寘鎷細瀛楁瘝锛坅-z, A-Z锛夈€佹暟瀛楋紙0-9锛夈€佺偣鍙凤紙.锛夈€佷笅鍒掔嚎锛坃锛夈€佽繛瀛楃锛?锛夈€? *
 * @param char - 寰呮鏌ョ殑瀛楃
 * @returns 濡傛灉鏄悎娉曠殑鍒悕瀛楃杩斿洖 true锛屽惁鍒欒繑鍥?false
 *
 * @private 姝ゅ嚱鏁颁负鍐呴儴瀹炵幇缁嗚妭锛屼笉搴旂洿鎺ヨ皟鐢? */
function isAliasChar(char: string | undefined): boolean {
  return typeof char === "string" && /[a-zA-Z0-9._-]/.test(char);
}

/**
 * 鍒ゆ柇瀛楃鏄惁涓烘彁鍙婅竟鐣岋紙绌虹櫧瀛楃鎴栧瓧绗︿覆缁撴潫锛? *
 * 鎻愬強杈圭晫瀹氫箟涓猴細瀛楃涓?undefined锛堝瓧绗︿覆缁撴潫锛夋垨绌虹櫧瀛楃锛堢┖鏍笺€佸埗琛ㄧ銆佹崲琛岀瓑锛夈€? * 鐢ㄤ簬纭繚 `@` 绗﹀彿鍓嶉潰鏄崟璇嶈竟鐣岋紝閬垮厤鍖归厤閭鍦板潃绛夊満鏅€? *
 * @param char - 寰呮鏌ョ殑瀛楃
 * @returns 濡傛灉鏄竟鐣屽瓧绗﹁繑鍥?true锛屽惁鍒欒繑鍥?false
 *
 * @private 姝ゅ嚱鏁颁负鍐呴儴瀹炵幇缁嗚妭锛屼笉搴旂洿鎺ヨ皟鐢? */
function isMentionBoundary(char: string | undefined): boolean {
  return char === undefined || /\s/.test(char);
}

/**
 * 璇诲彇鎷彿骞宠　鐨勪换鍔℃弿杩? *
 * 浠庢寚瀹氱殑宸︽嫭鍙蜂綅缃紑濮嬶紝璇诲彇鎷彿鍐呯殑浠诲姟鎻忚堪锛屾敮鎸佸祵濂楁嫭鍙枫€? * 浣跨敤娣卞害璁℃暟鍣ㄨ拷韪嫭鍙峰祵濂楀眰绾э紝纭繚姝ｇ‘鍖归厤闂悎鎷彿銆? *
 * 绠楁硶璇存槑锛? * 1. 浠庡乏鎷彿鐨勪笅涓€涓瓧绗﹀紑濮嬮亶鍘? * 2. 閬囧埌 `(` 鏃舵繁搴﹀姞 1
 * 3. 閬囧埌 `)` 鏃舵繁搴﹀噺 1
 * 4. 褰撴繁搴﹀綊闆舵椂锛屾壘鍒板尮閰嶇殑闂悎鎷彿
 * 5. 濡傛灉閬嶅巻缁撴潫娣卞害浠嶆湭褰掗浂锛岃繑鍥?null锛堟嫭鍙蜂笉鍖归厤锛? *
 * @param text - 婧愭枃鏈? * @param openParenIndex - 宸︽嫭鍙峰湪鏂囨湰涓殑绱㈠紩浣嶇疆
 * @returns 鍖呭惈浠诲姟鎻忚堪鍜岀粨鏉熶綅缃殑瀵硅薄锛屽鏋滄嫭鍙蜂笉鍖归厤杩斿洖 null
 *
 * @private 姝ゅ嚱鏁颁负鍐呴儴瀹炵幇缁嗚妭锛屼笉搴旂洿鎺ヨ皟鐢? *
 * @example
 * ```ts
 * readBalancedTask('@reviewer(瀹℃煡浠ｇ爜)', 10);
 * // 杩斿洖: { task: '瀹℃煡浠ｇ爜', end: 19 }
 *
 * readBalancedTask('@agent(浠诲姟(宓屽))', 8);
 * // 杩斿洖: { task: '浠诲姟(宓屽)', end: 19 }
 *
 * readBalancedTask('@agent(鏈棴鍚?, 7);
 * // 杩斿洖: null
 * ```
 */
function readBalancedTask(
  text: string,
  openParenIndex: number,
): { task: string; end: number } | null {
  let depth = 1;
  let cursor = openParenIndex + 1;

  while (cursor < text.length) {
    const char = text[cursor];
    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        return {
          task: text.slice(openParenIndex + 1, cursor),
          end: cursor + 1,
        };
      }
    }
    cursor += 1;
  }

  return null;
}

/**
 * 瑙ｆ瀽鏂囨湰涓墍鏈夌殑浠ｇ悊鎻愬強璋冪敤
 *
 * 鎵弿杈撳叆鏂囨湰锛屾彁鍙栨墍鏈夌鍚?`@alias(task)` 鏍煎紡鐨勪唬鐞嗘彁鍙婏紝
 * 骞惰В鏋愭瘡涓彁鍙婄殑浠ｇ悊瀹氫箟淇℃伅銆傝В鏋愯繃绋嬮伒寰互涓嬭鍒欙細
 *
 * 1. `@` 绗﹀彿蹇呴』鍦ㄥ崟璇嶈竟鐣岋紙鍓嶉潰鏄┖鐧芥垨瀛楃涓插紑澶达級
 * 2. 鍒悕鍙兘鍖呭惈瀛楁瘝銆佹暟瀛椼€佺偣鍙枫€佷笅鍒掔嚎銆佽繛瀛楃
 * 3. 鍒悕鍚庡繀椤荤揣璺熷乏鎷彿 `(`
 * 4. 鎷彿鍐呯殑浠诲姟鎻忚堪鏀寔宓屽鎷彿
 * 5. 浠ｇ悊鍒悕蹇呴』鑳介€氳繃 `resolveAgentAlias` 瑙ｆ瀽涓烘湁鏁堢殑浠ｇ悊瀹氫箟
 *
 * 绠楁硶澶嶆潅搴︼細
 * - 鏃堕棿澶嶆潅搴? O(n)锛屽叾涓?n 涓烘枃鏈暱搴? * - 绌洪棿澶嶆潅搴? O(k)锛屽叾涓?k 涓鸿В鏋愬埌鐨勬彁鍙婃暟閲? *
 * @param text - 寰呰В鏋愮殑杈撳叆鏂囨湰
 * @param provider - 浠ｇ悊鎻愪緵鍟嗙被鍨嬶紙濡?"claudeAgent"锛? * @returns 瑙ｆ瀽鍚庣殑浠ｇ悊鎻愬強璋冪敤鏁扮粍锛屾寜鍑虹幇椤哄簭鎺掑垪
 *
 * @throws 姝ゅ嚱鏁颁笉浼氭姏鍑哄紓甯? *
 * @example
 * ```ts
 * const text = '璇?@reviewer(瀹℃煡浠ｇ爜) 鍜?@tester(鍐欐祴璇?';
 * const invocations = parseAgentMentionInvocations(text, 'claudeAgent');
 *
 * console.log(invocations.length); // 2
 * console.log(invocations[0].alias); // 'reviewer'
 * console.log(invocations[0].task);  // '瀹℃煡浠ｇ爜'
 * console.log(invocations[1].alias); // 'tester'
 * console.log(invocations[1].task);  // '鍐欐祴璇?
 * ```
 *
 * @example 涓嶅尮閰嶇殑鎻愬強浼氳蹇界暐
 * ```ts
 * const text = '閭 user@example.com 鍜?@invalid(鏈棴鍚?;
 * const invocations = parseAgentMentionInvocations(text, 'claudeAgent');
 * console.log(invocations.length); // 0锛堜袱涓兘涓嶅尮閰嶏級
 * ```
 */
export function parseAgentMentionInvocations(
  text: string,
  provider: ProviderKind,
): ReadonlyArray<ParsedAgentMentionInvocation> {
  const invocations: ParsedAgentMentionInvocation[] = [];

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "@") {
      continue;
    }
    // 妫€鏌?@ 绗﹀彿鍓嶆槸鍚︿负鍗曡瘝杈圭晫
    if (!isMentionBoundary(text[index - 1])) {
      continue;
    }

    // 璇诲彇鍒悕
    let aliasEnd = index + 1;
    while (isAliasChar(text[aliasEnd])) {
      aliasEnd += 1;
    }

    const alias = text.slice(index + 1, aliasEnd);
    // 鍒悕涓嶈兘涓虹┖锛屼笖鍚庨潰蹇呴』绱ц窡宸︽嫭鍙?    if (alias.length === 0 || text[aliasEnd] !== "(") {
      continue;
    }

    // 瑙ｆ瀽浠ｇ悊瀹氫箟
    const resolved = resolveAgentAlias(alias, provider);
    if (!resolved) {
      continue;
    }

    // 璇诲彇鎷彿骞宠　鐨勪换鍔℃弿杩?    const taskMatch = readBalancedTask(text, aliasEnd);
    if (!taskMatch) {
      continue;
    }

    invocations.push({
      alias,
      task: taskMatch.task.trim(),
      raw: text.slice(index, taskMatch.end),
      start: index,
      end: taskMatch.end,
      definition: {
        alias,
        ...resolved,
      },
    });

    // 璺宠繃宸茶В鏋愮殑閮ㄥ垎
    index = taskMatch.end - 1;
  }

  return invocations;
}

/**
 * 鏋勫缓 Claude 瀛愪唬鐞嗙殑缁撴瀯鍖栨彁绀鸿瘝
 *
 * 浠庤緭鍏ユ枃鏈腑瑙ｆ瀽鎵€鏈?Claude 瀛愪唬鐞嗘彁鍙婏紙`kind === "claude-subagent"`锛夛紝
 * 骞跺皢瀹冧滑杞崲涓虹粨鏋勫寲鐨勬寚浠ゆ牸寮忥紝宓屽叆鍒板畬鏁寸殑鎻愮ず璇嶄腑銆? *
 * 鐢熸垚鐨勬彁绀鸿瘝鍖呭惈浠ヤ笅閮ㄥ垎锛? * 1. 鎸囦护璇存槑锛氬憡鐭?Claude 鐢ㄦ埛浣跨敤浜嗗唴鑱斿瓙浠ｇ悊鎸囦护
 * 2. 鎵ц瑕佹眰锛氭槑纭姹備娇鐢?Agent 宸ュ叿璋冪敤鎸囧畾鐨勫瓙浠ｇ悊
 * 3. 鍚庣画澶勭悊锛氳姹傚畬鎴愬瓙浠ｇ悊浠诲姟鍚庣户缁鐞嗘暣浣撹姹? * 4. 鍏蜂綋鎸囦护鍒楄〃锛氭瘡涓瓙浠ｇ悊璋冪敤鐨勭紪鍙峰垪琛? * 5. 鍘熷鎻愮ず璇嶏細鐢ㄦ埛鐨勫師濮嬭緭鍏ユ枃鏈? *
 * 濡傛灉娌℃湁瑙ｆ瀽鍒板瓙浠ｇ悊鎻愬強锛岀洿鎺ヨ繑鍥炲師濮嬫枃鏈€? *
 * @param text - 鐢ㄦ埛杈撳叆鐨勫師濮嬫枃鏈? * @returns 鍖呭惈缁撴瀯鍖栨彁绀鸿瘝鍜岃В鏋愬埌鐨勮皟鐢ㄤ俊鎭殑瀵硅薄
 *   - `prompt`: 鏋勫缓瀹屾垚鐨勫畬鏁存彁绀鸿瘝瀛楃涓? *   - `invocations`: 瑙ｆ瀽鍒扮殑 Claude 瀛愪唬鐞嗚皟鐢ㄦ暟缁? *
 * @throws 姝ゅ嚱鏁颁笉浼氭姏鍑哄紓甯? *
 * @example
 * ```ts
 * const text = '璇?@reviewer(瀹℃煡浠ｇ爜) 鍜?@tester(鍐欐祴璇?';
 * const result = buildClaudeSubagentPrompt(text);
 *
 * console.log(result.prompt);
 * // 杈撳嚭锛? * // The user included inline subagent directives in the form @alias(task).
 * // Execute each directive explicitly via the Agent tool using the named subagent below.
 * // After the delegated work completes, continue with the overall request and synthesize the results.
 * // Do not echo the literal @alias(task) syntax back to the user unless it is directly relevant.
 * //
 * // Inline directives:
 * // 1. Use the "Code Reviewer" agent for this task:
 * // 瀹℃煡浠ｇ爜
 * //
 * // 2. Use the "Test Engineer" agent for this task:
 * // 鍐欐祴璇? * //
 * // Original user prompt:
 * // 璇?@reviewer(瀹℃煡浠ｇ爜) 鍜?@tester(鍐欐祴璇?
 *
 * console.log(result.invocations.length); // 2
 * ```
 *
 * @example 娌℃湁瀛愪唬鐞嗘彁鍙婃椂
 * ```ts
 * const text = '鏅€氭枃鏈紝娌℃湁浠ｇ悊鎻愬強';
 * const result = buildClaudeSubagentPrompt(text);
 *
 * console.log(result.prompt); // '鏅€氭枃鏈紝娌℃湁浠ｇ悊鎻愬強'锛堝師鏍疯繑鍥烇級
 * console.log(result.invocations.length); // 0
 * ```
 */
export function buildClaudeSubagentPrompt(text: string): {
  readonly prompt: string;
  readonly invocations: ReadonlyArray<
    ParsedAgentMentionInvocation & {
      readonly definition: ResolvedAgentAlias & ClaudeSubagentAliasDefinition;
    }
  >;
} {
  const invocations = parseAgentMentionInvocations(text, "claudeAgent").filter(
    (
      invocation,
    ): invocation is ParsedAgentMentionInvocation & {
      readonly definition: ResolvedAgentAlias & ClaudeSubagentAliasDefinition;
    } => invocation.definition.kind === "claude-subagent",
  );

  if (invocations.length === 0) {
    return {
      prompt: text,
      invocations,
    };
  }

  const directiveLines = invocations
    .map(
      (invocation, index) =>
        `${index + 1}. Use the "${invocation.definition.agentName}" agent for this task:\n${invocation.task}`,
    )
    .join("\n\n");

  return {
    prompt: [
      "The user included inline subagent directives in the form @alias(task).",
      "Execute each directive explicitly via the Agent tool using the named subagent below.",
      "After the delegated work completes, continue with the overall request and synthesize the results.",
      "Do not echo the literal @alias(task) syntax back to the user unless it is directly relevant.",
      "",
      "Inline directives:",
      directiveLines,
      "",
      "Original user prompt:",
      text,
    ].join("\n"),
    invocations,
  };
}
