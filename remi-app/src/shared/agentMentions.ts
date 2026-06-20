/**
 * @file 娴狅絿鎮婇幓鎰挤閿涘湌mention閿涘袙閺嬫劕浼愰崗閿嬆侀崸? *
 * @description
 * 閹绘劒绶甸悽銊﹀煕鏉堟挸鍙嗘稉?`@alias(task)` 閺嶇厧绱￠惃鍕敶閼辨柧鍞悶鍡樺瘹娴犮倛袙閺嬫劕濮涢懗濮愨偓? * 閺€顖涘瘮娴犲孩鏋冮張顑胯厬閹绘劕褰囨禒锝囨倞閹绘劕寮烽敍灞借嫙鐏忓棜绻栨禍娑欏絹閸欏﹨娴嗛幑顫礋缂佹挻鐎崠鏍畱娴狅絿鎮婄拫鍐暏閹稿洣鎶ら敍? * 閻劋绨弸鍕紦 Claude 鐎涙劒鍞悶鍡欐畱閹绘劗銇氱拠宥冣偓? *
 * 閺嶇绺鹃崝鐔诲厴閿? * - 鐟欙絾鐎介弬鍥ㄦ拱娑擃厾娈?`@alias(task)` 閺嶇厧绱￠幓鎰挤閿涘潉parseAgentMentionInvocations`閿? * - 閺嬪嫬缂?Claude 鐎涙劒鍞悶鍡欐畱缂佹挻鐎崠鏍ㄥ絹缁€楦跨槤閿涘潉buildClaudeSubagentPrompt`閿? * - 閺€顖涘瘮閹奉剙褰块獮瀹犮€€閻ㄥ嫪鎹㈤崝鈩冨伎鏉╂媽袙閺? * - 閺€顖涘瘮婢舵氨顫掓禒锝囨倞閸掝偄鎮曢弽鐓庣础
 *
 * 娴ｈ法鏁ら崷鐑樻珯閿? * - 閻劍鍩涢崷銊ㄤ喊婢垛晙鑵戞担璺ㄦ暏 `@agent-name(閹笛嗩攽閺屾劒閲滄禒璇插)` 閺嶇厧绱＄拫鍐暏鐎涙劒鍞悶? * - 鐏忓棛鏁ら幋椋庢畱閼奉亞鍔х拠顓♀枅閹稿洣鎶ゆ潪顒佸床娑撹櫣绮ㄩ弸鍕閻ㄥ嫪鍞悶鍡氱殶閻? * - 娑?Claude 娴狅絿鎮婇悽鐔稿灇閸栧懎鎯堢€涙劒鍞悶鍡樺瘹娴犮倗娈戠€瑰本鏆ｉ幓鎰仛鐠? *
 * @module agentMentions
 * @layer 閸忓彉闊╁銉ュ徔鐏? *
 * @example
 * ```ts
 * import { parseAgentMentionInvocations, buildClaudeSubagentPrompt } from './agentMentions';
 *
 * const text = '鐠囧嘲搴滈幋?@reviewer(鐎光剝鐓℃潻娆愵唽娴狅絿鐖? 閸?@tester(缂傛牕鍟撻崡鏇炲帗濞村鐦?';
 *
 * // 鐟欙絾鐎介幍鈧張澶夊敩閻炲棙褰侀崣? * const invocations = parseAgentMentionInvocations(text, 'claudeAgent');
 * console.log(invocations);
 * // [
 * //   { alias: 'reviewer', task: '鐎光剝鐓℃潻娆愵唽娴狅絿鐖?, ... },
 * //   { alias: 'tester', task: '缂傛牕鍟撻崡鏇炲帗濞村鐦?, ... }
 * // ]
 *
 * // 閺嬪嫬缂?Claude 鐎涙劒鍞悶鍡樺絹缁€楦跨槤
 * const result = buildClaudeSubagentPrompt(text);
 * console.log(result.prompt);
 * // 閻㈢喐鍨氶崠鍛儓鐎涙劒鍞悶鍡樺瘹娴犮倗娈戠€瑰本鏆ｉ幓鎰仛鐠? * ```
 */
import {
  resolveAgentAlias,
  type ClaudeSubagentAliasDefinition,
  type ProviderKind,
  type ResolvedAgentAlias,
} from "~/contracts";

/**
 * 鐟欙絾鐎介崥搴ｆ畱娴狅絿鎮婇幓鎰挤鐠嬪啰鏁ゆ穱鈩冧紖閹恒儱褰? *
 * 閸栧懎鎯堟禒搴㈡瀮閺堫兛鑵戦幓鎰絿閻ㄥ嫬宕熸稉?`@alias(task)` 鐠嬪啰鏁ら惃鍕閺堝淇婇幁顖ょ礉
 * 閻劋绨崥搴ｇ敾閻ㄥ嫪鍞悶鍡氱殶鎼达箑鎷版禒璇插閹笛嗩攽閵? *
 * @interface ParsedAgentMentionInvocation
 *
 * @property {string} alias - 娴狅絿鎮婇崚顐㈡倳閿涘牆顩?"reviewer"閵?tester"閿? * @property {string} task - 娴犺濮熼幓蹇氬牚閿涘牊瀚崣宄板敶閻ㄥ嫬鍞寸€圭櫢绱? * @property {string} raw - 閸樼喎顫愰幓鎰挤閺傚洦婀伴敍鍫濆瘶閹?`@alias(task)` 鐎瑰本鏆ｉ崘鍛啇閿? * @property {number} start - 閹绘劕寮烽崷銊ュ斧閺傚洦婀版稉顓犳畱鐠у嘲顫愭担宥囩枂缁便垹绱? * @property {number} end - 閹绘劕寮烽崷銊ュ斧閺傚洦婀版稉顓犳畱缂佹挻娼担宥囩枂缁便垹绱╅敍鍫滅瑝閸栧懎鎯堥敍? * @property {ResolvedAgentAlias} definition - 鐟欙絾鐎介崥搴ｆ畱娴狅絿鎮婄€规矮绠熸穱鈩冧紖
 *
 * @example
 * ```ts
 * const invocation: ParsedAgentMentionInvocation = {
 *   alias: 'reviewer',
 *   task: '鐎光剝鐓℃潻娆愵唽娴狅絿鐖?,
 *   raw: '@reviewer(鐎光剝鐓℃潻娆愵唽娴狅絿鐖?',
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
 * 閸掋倖鏌囩€涙顑侀弰顖氭儊娑撳搫鎮庡▔鏇犳畱娴狅絿鎮婇崚顐㈡倳鐎涙顑? *
 * 閸氬牊纭堕惃鍕焼閸氬秴鐡х粭锕€瀵橀幏顒婄窗鐎涙鐦濋敍鍧?z, A-Z閿涘鈧焦鏆熺€涙绱?-9閿涘鈧胶鍋ｉ崣鍑ょ礄.閿涘鈧椒绗呴崚鎺斿殠閿涘潈閿涘鈧浇绻涚€涙顑侀敍?閿涘鈧? *
 * @param char - 瀵板懏顥呴弻銉ф畱鐎涙顑? * @returns 婵″倹鐏夐弰顖氭値濞夋洜娈戦崚顐㈡倳鐎涙顑佹潻鏂挎礀 true閿涘苯鎯侀崚娆掔箲閸?false
 *
 * @private 濮濄倕鍤遍弫棰佽礋閸愬懘鍎寸€圭偟骞囩紒鍡氬Ν閿涘奔绗夋惔鏃傛纯閹恒儴鐨熼悽? */
function isAliasChar(char: string | undefined): boolean {
  return typeof char === "string" && /[a-zA-Z0-9._-]/.test(char);
}

/**
 * 閸掋倖鏌囩€涙顑侀弰顖氭儊娑撶儤褰侀崣濠呯珶閻ｅ矉绱欑粚铏规鐎涙顑侀幋鏍х摟缁楋缚瑕嗙紒鎾存将閿? *
 * 閹绘劕寮锋潏鍦櫕鐎规矮绠熸稉鐚寸窗鐎涙顑佹稉?undefined閿涘牆鐡х粭锔胯缂佹挻娼敍澶嬪灗缁岃櫣娅х€涙顑侀敍鍫⑩敄閺嶇鈧礁鍩楃悰銊ь儊閵嗕焦宕茬悰宀€鐡戦敍澶堚偓? * 閻劋绨涵顔荤箽 `@` 缁楋箑褰块崜宥夋桨閺勵垰宕熺拠宥堢珶閻ｅ矉绱濋柆鍨帳閸栧綊鍘ら柇顔绢唸閸︽澘娼冪粵澶婃簚閺咁垬鈧? *
 * @param char - 瀵板懏顥呴弻銉ф畱鐎涙顑? * @returns 婵″倹鐏夐弰顖濈珶閻ｅ苯鐡х粭锕佺箲閸?true閿涘苯鎯侀崚娆掔箲閸?false
 *
 * @private 濮濄倕鍤遍弫棰佽礋閸愬懘鍎寸€圭偟骞囩紒鍡氬Ν閿涘奔绗夋惔鏃傛纯閹恒儴鐨熼悽? */
function isMentionBoundary(char: string | undefined): boolean {
  return char === undefined || /\s/.test(char);
}

/**
 * 鐠囪褰囬幏顒€褰块獮瀹犮€€閻ㄥ嫪鎹㈤崝鈩冨伎鏉? *
 * 娴犲孩瀵氱€规氨娈戝锔藉閸欒渹缍呯純顔肩磻婵绱濈拠璇插絿閹奉剙褰块崘鍛畱娴犺濮熼幓蹇氬牚閿涘本鏁幐浣哥サ婵傛瀚崣鏋偓? * 娴ｈ法鏁ゅǎ鍗炲鐠佲剝鏆熼崳銊ㄦ嫹闊亝瀚崣宄扮サ婵傛鐪扮痪褝绱濈涵顔荤箽濮濓絿鈥橀崠褰掑帳闂傤厼鎮庨幏顒€褰块妴? *
 * 缁犳纭剁拠瀛樻閿? * 1. 娴犲骸涔忛幏顒€褰块惃鍕瑓娑撯偓娑擃亜鐡х粭锕€绱戞慨瀣憾閸? * 2. 闁洤鍩?`(` 閺冭埖绻佹惔锕€濮?1
 * 3. 闁洤鍩?`)` 閺冭埖绻佹惔锕€鍣?1
 * 4. 瑜版挻绻佹惔锕€缍婇梿鑸垫閿涘本澹橀崚鏉垮爱闁板秶娈戦梻顓炴値閹奉剙褰? * 5. 婵″倹鐏夐柆宥呭坊缂佹挻娼ǎ鍗炲娴犲秵婀ぐ鎺楁祩閿涘矁绻戦崶?null閿涘牊瀚崣铚傜瑝閸栧綊鍘ら敍? *
 * @param text - 濠ф劖鏋冮張? * @param openParenIndex - 瀹革附瀚崣宄版躬閺傚洦婀版稉顓犳畱缁便垹绱╂担宥囩枂
 * @returns 閸栧懎鎯堟禒璇插閹诲繗鍫崪宀€绮ㄩ弶鐔剁秴缂冾喚娈戠€电钖勯敍灞筋洤閺嬫粍瀚崣铚傜瑝閸栧綊鍘ゆ潻鏂挎礀 null
 *
 * @private 濮濄倕鍤遍弫棰佽礋閸愬懘鍎寸€圭偟骞囩紒鍡氬Ν閿涘奔绗夋惔鏃傛纯閹恒儴鐨熼悽? *
 * @example
 * ```ts
 * readBalancedTask('@reviewer(鐎光剝鐓℃禒锝囩垳)', 10);
 * // 鏉╂柨娲? { task: '鐎光剝鐓℃禒锝囩垳', end: 19 }
 *
 * readBalancedTask('@agent(娴犺濮?瀹撳苯顨?)', 8);
 * // 鏉╂柨娲? { task: '娴犺濮?瀹撳苯顨?', end: 19 }
 *
 * readBalancedTask('@agent(閺堫亪妫撮崥?, 7);
 * // 鏉╂柨娲? null
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
 * 鐟欙絾鐎介弬鍥ㄦ拱娑擃厽澧嶉張澶屾畱娴狅絿鎮婇幓鎰挤鐠嬪啰鏁? *
 * 閹殿偅寮挎潏鎾冲弳閺傚洦婀伴敍灞惧絹閸欐牗澧嶉張澶岊儊閸?`@alias(task)` 閺嶇厧绱￠惃鍕敩閻炲棙褰侀崣濠忕礉
 * 楠炴儼袙閺嬫劖鐦℃稉顏呭絹閸欏﹦娈戞禒锝囨倞鐎规矮绠熸穱鈩冧紖閵嗗倽袙閺嬫劘绻冪粙瀣紥瀵邦亙浜掓稉瀣潐閸掓瑱绱? *
 * 1. `@` 缁楋箑褰胯箛鍛淬€忛崷銊ュ礋鐠囧秷绔熼悾宀嬬礄閸撳秹娼伴弰顖溾敄閻ц姤鍨ㄧ€涙顑佹稉鎻掔磻婢惰揪绱? * 2. 閸掝偄鎮曢崣顏囧厴閸栧懎鎯堢€涙鐦濋妴浣规殶鐎涙ぜ鈧胶鍋ｉ崣鏋偓浣风瑓閸掓帞鍤庨妴浣界箾鐎涙顑? * 3. 閸掝偄鎮曢崥搴＄箑妞よ崵鎻ｇ捄鐔蜂箯閹奉剙褰?`(`
 * 4. 閹奉剙褰块崘鍛畱娴犺濮熼幓蹇氬牚閺€顖涘瘮瀹撳苯顨滈幏顒€褰? * 5. 娴狅絿鎮婇崚顐㈡倳韫囧懘銆忛懗浠嬧偓姘崇箖 `resolveAgentAlias` 鐟欙絾鐎芥稉鐑樻箒閺佸牏娈戞禒锝囨倞鐎规矮绠? *
 * 缁犳纭舵径宥嗘絽鎼达讣绱? * - 閺冨爼妫挎径宥嗘絽鎼? O(n)閿涘苯鍙炬稉?n 娑撶儤鏋冮張顒勬毐鎼? * - 缁屾椽妫挎径宥嗘絽鎼? O(k)閿涘苯鍙炬稉?k 娑撻缚袙閺嬫劕鍩岄惃鍕絹閸欏﹥鏆熼柌? *
 * @param text - 瀵板懓袙閺嬫劗娈戞潏鎾冲弳閺傚洦婀? * @param provider - 娴狅絿鎮婇幓鎰返閸熷棛琚崹瀣剁礄婵?"claudeAgent"閿? * @returns 鐟欙絾鐎介崥搴ｆ畱娴狅絿鎮婇幓鎰挤鐠嬪啰鏁ら弫鎵矋閿涘本瀵滈崙铏瑰箛妞ゅ搫绨幒鎺戝灙
 *
 * @throws 濮濄倕鍤遍弫棰佺瑝娴兼碍濮忛崙鍝勭磽鐢? *
 * @example
 * ```ts
 * const text = '鐠?@reviewer(鐎光剝鐓℃禒锝囩垳) 閸?@tester(閸愭瑦绁寸拠?';
 * const invocations = parseAgentMentionInvocations(text, 'claudeAgent');
 *
 * console.log(invocations.length); // 2
 * console.log(invocations[0].alias); // 'reviewer'
 * console.log(invocations[0].task);  // '鐎光剝鐓℃禒锝囩垳'
 * console.log(invocations[1].alias); // 'tester'
 * console.log(invocations[1].task);  // '閸愭瑦绁寸拠?
 * ```
 *
 * @example 娑撳秴灏柊宥囨畱閹绘劕寮锋导姘愁潶韫囩晫鏆? * ```ts
 * const text = '闁喚顔?user@example.com 閸?@invalid(閺堫亪妫撮崥?;
 * const invocations = parseAgentMentionInvocations(text, 'claudeAgent');
 * console.log(invocations.length); // 0閿涘牅琚辨稉顏堝厴娑撳秴灏柊宥忕礆
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
    // 濡偓閺?@ 缁楋箑褰块崜宥嗘Ц閸氾缚璐熼崡鏇＄槤鏉堝湱鏅?    if (!isMentionBoundary(text[index - 1])) {
      continue;
    }

    // 鐠囪褰囬崚顐㈡倳
    let aliasEnd = index + 1;
    while (isAliasChar(text[aliasEnd])) {
      aliasEnd += 1;
    }

    const alias = text.slice(index + 1, aliasEnd);
    // 閸掝偄鎮曟稉宥堝厴娑撹櫣鈹栭敍灞肩瑬閸氬酣娼拌箛鍛淬€忕槐褑绐″锔藉閸?    if (alias.length === 0 || text[aliasEnd] !== "(") {
      continue;
    }

    // 鐟欙絾鐎芥禒锝囨倞鐎规矮绠?    const resolved = resolveAgentAlias(alias, provider);
    if (!resolved) {
      continue;
    }

    // 鐠囪褰囬幏顒€褰块獮瀹犮€€閻ㄥ嫪鎹㈤崝鈩冨伎鏉?    const taskMatch = readBalancedTask(text, aliasEnd);
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

    // 鐠哄疇绻冨鑼缎掗弸鎰畱闁劌鍨?    index = taskMatch.end - 1;
  }

  return invocations;
}

/**
 * 閺嬪嫬缂?Claude 鐎涙劒鍞悶鍡欐畱缂佹挻鐎崠鏍ㄥ絹缁€楦跨槤
 *
 * 娴犲氦绶崗銉︽瀮閺堫兛鑵戠憴锝嗙€介幍鈧張?Claude 鐎涙劒鍞悶鍡樺絹閸欏绱檂kind === "claude-subagent"`閿涘绱? * 楠炶泛鐨㈢€瑰啩婊戞潪顒佸床娑撹櫣绮ㄩ弸鍕閻ㄥ嫭瀵氭禒銈嗙壐瀵骏绱濆畵灞藉弳閸掓澘鐣弫瀵告畱閹绘劗銇氱拠宥勮厬閵? *
 * 閻㈢喐鍨氶惃鍕絹缁€楦跨槤閸栧懎鎯堟禒銉ょ瑓闁劌鍨庨敍? * 1. 閹稿洣鎶ょ拠瀛樻閿涙艾鎲￠惌?Claude 閻劍鍩涙担璺ㄦ暏娴滃棗鍞撮懕鏂跨摍娴狅絿鎮婇幐鍥︽姢
 * 2. 閹笛嗩攽鐟曚焦鐪伴敍姘绾喛顩﹀Ч鍌欏▏閻?Agent 瀹搞儱鍙跨拫鍐暏閹稿洤鐣鹃惃鍕摍娴狅絿鎮? * 3. 閸氬海鐢绘径鍕倞閿涙俺顩﹀Ч鍌氱暚閹存劕鐡欐禒锝囨倞娴犺濮熼崥搴ｆ埛缂侇厼顦╅悶鍡樻殻娴ｆ捁顕Ч? * 4. 閸忚渹缍嬮幐鍥︽姢閸掓銆冮敍姘槨娑擃亜鐡欐禒锝囨倞鐠嬪啰鏁ら惃鍕椽閸欏嘲鍨悰? * 5. 閸樼喎顫愰幓鎰仛鐠囧稄绱伴悽銊﹀煕閻ㄥ嫬甯慨瀣翻閸忋儲鏋冮張? *
 * 婵″倹鐏夊▽鈩冩箒鐟欙絾鐎介崚鏉跨摍娴狅絿鎮婇幓鎰挤閿涘瞼娲块幒銉ㄧ箲閸ョ偛甯慨瀣瀮閺堫兙鈧? *
 * @param text - 閻劍鍩涙潏鎾冲弳閻ㄥ嫬甯慨瀣瀮閺? * @returns 閸栧懎鎯堢紒鎾寸€崠鏍ㄥ絹缁€楦跨槤閸滃矁袙閺嬫劕鍩岄惃鍕殶閻劋淇婇幁顖滄畱鐎电钖? *   - `prompt`: 閺嬪嫬缂撶€瑰本鍨氶惃鍕暚閺佸瓨褰佺粈楦跨槤鐎涙顑佹稉? *   - `invocations`: 鐟欙絾鐎介崚鎵畱 Claude 鐎涙劒鍞悶鍡氱殶閻劍鏆熺紒? *
 * @throws 濮濄倕鍤遍弫棰佺瑝娴兼碍濮忛崙鍝勭磽鐢? *
 * @example
 * ```ts
 * const text = '鐠?@reviewer(鐎光剝鐓℃禒锝囩垳) 閸?@tester(閸愭瑦绁寸拠?';
 * const result = buildClaudeSubagentPrompt(text);
 *
 * console.log(result.prompt);
 * // 鏉堟挸鍤敍? * // The user included inline subagent directives in the form @alias(task).
 * // Execute each directive explicitly via the Agent tool using the named subagent below.
 * // After the delegated work completes, continue with the overall request and synthesize the results.
 * // Do not echo the literal @alias(task) syntax back to the user unless it is directly relevant.
 * //
 * // Inline directives:
 * // 1. Use the "Code Reviewer" agent for this task:
 * // 鐎光剝鐓℃禒锝囩垳
 * //
 * // 2. Use the "Test Engineer" agent for this task:
 * // 閸愭瑦绁寸拠? * //
 * // Original user prompt:
 * // 鐠?@reviewer(鐎光剝鐓℃禒锝囩垳) 閸?@tester(閸愭瑦绁寸拠?
 *
 * console.log(result.invocations.length); // 2
 * ```
 *
 * @example 濞屸剝婀佺€涙劒鍞悶鍡樺絹閸欏﹥妞? * ```ts
 * const text = '閺咁噣鈧碍鏋冮張顒婄礉濞屸剝婀佹禒锝囨倞閹绘劕寮?;
 * const result = buildClaudeSubagentPrompt(text);
 *
 * console.log(result.prompt); // '閺咁噣鈧碍鏋冮張顒婄礉濞屸剝婀佹禒锝囨倞閹绘劕寮?閿涘牆甯弽鐤箲閸ョ儑绱? * console.log(result.invocations.length); // 0
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
