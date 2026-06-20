/**
 * @file 瀵板懐鏁ら幋鐤翻閸忋儻绱橮ending User Input閿涘顦╅悶? *
 * 婢跺嫮鎮?AI Provider 鐠囬攱鐪伴悽銊﹀煕鏉堟挸鍙嗛弮鍓佹畱閼藉枪缁涙梹顢嶇粻锛勬倞閸滃矁绻樻惔锕侇吀缁犳ぜ鈧? * 閺€顖涘瘮閸楁洟鈧鎷版径姘垛偓澶愭６妫版﹫绱濋幓鎰返缁涙梹顢嶇憴锝嗙€介妴渚€鈧銆嶉崚鍥ㄥ床閵嗕浇绻樻惔锔藉腹鐎佃偐鐡戦崝鐔诲厴閿? * 娓?ChatView 閸滃瞼绱潏鎴濇珤闂堛垺婢樻担璺ㄦ暏閵? */

import type { ProviderUserInputAnswers, UserInputQuestion } from "~/contracts";

/**
 * 瀵板懐鏁ら幋鐤翻閸忋儳娈戦懡澶屒圭粵鏃€顢嶉敍宀冾唶瑜版洜鏁ら幋宄扮秼閸撳秶娈戦柅澶嬪閻樿埖鈧降鈧? */
export interface PendingUserInputDraftAnswer {
  /** 瀹告煡鈧瀚ㄩ惃鍕偓澶愩€嶉弽鍥╊劮閸掓銆?*/
  selectedOptionLabels?: string[];
  /** 閼奉亜鐣炬稊澶庣翻閸忋儳娈戠粵鏃€顢嶉弬鍥ㄦ拱 */
  customAnswer?: string;
}

/**
 * 瀵板懐鏁ら幋鐤翻閸忋儳娈戞潻娑樺娣団剝浼呴敍灞惧伎鏉╂澘缍嬮崜宥夋６妫版娈戦崶鐐电摕閻樿埖鈧礁鎷扮€佃壈鍩呮穱鈩冧紖閵? */
export interface PendingUserInputProgress {
  /** 瑜版挸澧犻梻顕€顣界槐銏犵穿 */
  questionIndex: number;
  /** 瑜版挸澧犲ú鏄忕┈閻ㄥ嫰妫舵０姗堢礉閺冪娀妫舵０妯绘娑?null */
  activeQuestion: UserInputQuestion | null;
  /** 瑜版挸澧犻梻顕€顣介惃鍕磸缁嬭法鐡熷?*/
  activeDraft: PendingUserInputDraftAnswer | undefined;
  /** 瀹告煡鈧瀚ㄩ惃鍕偓澶愩€嶉弽鍥╊劮閸掓銆冮敍鍫熺垼閸戝棗瀵查崥搴礆 */
  selectedOptionLabels: string[];
  /** 閼奉亜鐣炬稊澶岀摕濡楀牊鏋冮張?*/
  customAnswer: string;
  /** 瀹歌尪袙閺嬫劗娈戠粵鏃€顢嶉崐纭风礉閸楁洟鈧璐熺€涙顑佹稉璇х礉婢舵岸鈧璐熺€涙顑佹稉鍙夋殶缂佸嫸绱濋張顏勬礀缁涙柧璐?null */
  resolvedAnswer: string | string[] | null;
  /** 閺勵垰鎯佸锝呮躬娴ｈ法鏁ら懛顏勭暰娑斿鐡熷?*/
  usingCustomAnswer: boolean;
  /** 瀹告彃娲栫粵鏃傛畱闂傤噣顣介弫浼村櫤 */
  answeredQuestionCount: number;
  /** 閺勵垰鎯佹稉鐑樻付閸氬簼绔存稉顏堟６妫?*/
  isLastQuestion: boolean;
  /** 閹碘偓閺堝妫舵０妯绘Ц閸氾箑鍑￠崶鐐电摕鐎瑰本鐦?*/
  isComplete: boolean;
  /** 閺勵垰鎯侀崣顖欎簰閸撳秷绻橀崚棰佺瑓娑撯偓妫?*/
  canAdvance: boolean;
}

/**
 * 閺嶅洤鍣崠鏍磸缁嬭法鐡熷鍫熸瀮閺堫剨绱濋崢濠氭珟妫ｆ牕鐔粚鐑樼壐閿涘瞼鈹栫€涙顑佹稉鑼剁箲閸?null閵? *
 * @param value - 閸樼喎顫愮粵鏃€顢嶉弬鍥ㄦ拱
 * @returns 閺嶅洤鍣崠鏍ф倵閻ㄥ嫭鏋冮張顒婄礉閺冪姵鏅ラ弮鎯扮箲閸?null
 */
function normalizeDraftAnswer(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * 閺嶅洤鍣崠鏍偓澶愩€嶉柅澶嬪閸掓銆冮敍宀冪箖濠娿倖妫ら弫鍫濃偓绗衡偓浣稿箵闂勩倗鈹栭弽鐓庤嫙閸樺鍣搁妴? * 娴?UI 閸滃本褰佹禍銈夆偓鏄忕帆閸忓彉闊╅崥灞肩閺嶅洤鍣崚妤勩€冮妴? *
 * @param value - 閸樼喎顫愰柅澶愩€嶉弽鍥╊劮閸掓銆? * @returns 閺嶅洤鍣崠鏍ф倵閻ㄥ嫰鈧銆嶉弽鍥╊劮閺佹壆绮? */
function normalizeSelectedOptionLabels(value: string[] | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return Array.from(new Set(normalized));
}

/**
 * 鐟欙絾鐎介崡鏇氶嚋闂傤噣顣介惃鍕付缂佸牏鐡熷鍫涒偓鍌欑喘閸忓牅濞囬悽銊ㄥ殰鐎规矮绠熺粵鏃€顢嶉敍灞藉従濞嗏€插▏閻劑鈧銆嶉柅澶嬪閵? * 婢舵岸鈧妫舵０妯跨箲閸ョ偛鐡х粭锔胯閺佹壆绮嶉敍灞藉礋闁妫舵０妯跨箲閸ョ偛鐡х粭锔胯閵? *
 * @param question - 閻劍鍩涙潏鎾冲弳闂傤噣顣? * @param draft - 閼藉枪缁涙梹顢? * @returns 鐟欙絾鐎介崥搴ｆ畱缁涙梹顢嶉敍灞炬弓閸ョ偟鐡熸潻鏂挎礀 null
 */
export function resolvePendingUserInputAnswer(
  question: UserInputQuestion,
  draft: PendingUserInputDraftAnswer | undefined,
): string | string[] | null {
  const customAnswer = normalizeDraftAnswer(draft?.customAnswer);
  if (customAnswer) {
    return customAnswer;
  }

  const selectedOptionLabels = normalizeSelectedOptionLabels(draft?.selectedOptionLabels);
  if (question.multiSelect) {
    return selectedOptionLabels.length > 0 ? selectedOptionLabels : null;
  }

  return selectedOptionLabels[0] ?? null;
}

/**
 * 鐠佸墽鐤嗛懛顏勭暰娑斿鐡熷鍫涒偓鍌氱秼閼奉亜鐣炬稊澶岀摕濡楀牓娼粚鐑樻濞撳懘娅庨柅澶愩€嶉柅澶嬪閿涘苯鎯侀崚娆庣箽閻ｆ瑤绠ｉ崜宥囨畱闁銆嶉妴? *
 * @param draft - 瑜版挸澧犻懡澶屒圭粵鏃€顢? * @param customAnswer - 閺傛壆娈戦懛顏勭暰娑斿鐡熷鍫熸瀮閺? * @returns 閺囧瓨鏌婇崥搴ｆ畱閼藉枪缁涙梹顢? */
export function setPendingUserInputCustomAnswer(
  draft: PendingUserInputDraftAnswer | undefined,
  customAnswer: string,
): PendingUserInputDraftAnswer {
  const selectedOptionLabels =
    customAnswer.trim().length > 0
      ? undefined
      : normalizeSelectedOptionLabels(draft?.selectedOptionLabels);

  return {
    customAnswer,
    ...(selectedOptionLabels && selectedOptionLabels.length > 0 ? { selectedOptionLabels } : {}),
  };
}

/**
 * 閸掑洦宕查柅澶愩€嶉惃鍕偓澶嬪閻樿埖鈧降鈧倸顦块柅澶嬆佸蹇庣瑓閸︺劌鍨悰銊よ厬濞ｈ濮為幋鏍╅梽銈夆偓澶愩€嶉敍? * 閸楁洟鈧膩瀵繋绗呴惄瀛樺复閺囨寧宕叉稉鍝勭秼閸撳秹鈧銆嶉妴鍌氬瀼閹广垽鈧銆嶉弮鑸电闂勩倛鍤滅€规矮绠熺粵鏃€顢嶉妴? *
 * @param question - 閻劍鍩涙潏鎾冲弳闂傤噣顣? * @param draft - 瑜版挸澧犻懡澶屒圭粵鏃€顢? * @param optionLabel - 鐟曚礁鍨忛幑銏㈡畱闁銆嶉弽鍥╊劮
 * @returns 閺囧瓨鏌婇崥搴ｆ畱閼藉枪缁涙梹顢? */
export function togglePendingUserInputOptionSelection(
  question: UserInputQuestion,
  draft: PendingUserInputDraftAnswer | undefined,
  optionLabel: string,
): PendingUserInputDraftAnswer {
  if (question.multiSelect) {
    const selectedOptionLabels = normalizeSelectedOptionLabels(draft?.selectedOptionLabels);
    const nextSelectedOptionLabels = selectedOptionLabels.includes(optionLabel)
      ? selectedOptionLabels.filter((label) => label !== optionLabel)
      : [...selectedOptionLabels, optionLabel];

    return {
      customAnswer: "",
      ...(nextSelectedOptionLabels.length > 0
        ? { selectedOptionLabels: nextSelectedOptionLabels }
        : {}),
    };
  }

  return {
    customAnswer: "",
    selectedOptionLabels: [optionLabel],
  };
}

/**
 * 閺嬪嫬缂撻幍鈧張澶愭６妫版娈戦張鈧紒鍫㈢摕濡楀牊妲х亸鍕┾偓鍌欐崲娑撯偓闂傤噣顣介張顏勬礀缁涙柨鍨潻鏂挎礀 null閵? *
 * @param questions - 闂傤噣顣介崚妤勩€? * @param draftAnswers - 閸氬嫰妫舵０妯兼畱閼藉枪缁涙梹顢嶉弰鐘茬殸
 * @returns 缁涙梹顢嶉弰鐘茬殸閿涘牓妫舵０?ID 閳?缁涙梹顢嶉崐纭风礆閿涘苯鐡ㄩ崷銊︽弓閸ョ偟鐡熼梻顕€顣介弮鎯扮箲閸?null
 */
export function buildPendingUserInputAnswers(
  questions: ReadonlyArray<UserInputQuestion>,
  draftAnswers: Record<string, PendingUserInputDraftAnswer>,
): Record<string, string | string[]> | null {
  const answers: Record<string, string | string[]> = {};

  for (const question of questions) {
    const answer = resolvePendingUserInputAnswer(question, draftAnswers[question.id]);
    if (!answer) {
      return null;
    }
    answers[question.id] = answer;
  }

  return answers;
}

/**
 * 閸掋倖鏌囩粵鏃€顢嶉弰鐘茬殸閺勵垰鎯佺€瑰本鏆ｉ敍鍫熷閺堝妫舵０姗€鍏橀張澶嬫箒閺佸牏鐡熷鍫礆閵? *
 * @param answers - 缁涙梹顢嶉弰鐘茬殸
 * @returns 閺勵垰鎯侀幍鈧張澶愭６妫版﹢鍏樺鎻掓礀缁? */
export function hasCompletePendingUserInputAnswers(answers: ProviderUserInputAnswers): boolean {
  const entries = Object.entries(answers);
  if (entries.length === 0) {
    return false;
  }

  return entries.every(([, answer]) => {
    if (typeof answer === "string") {
      return answer.trim().length > 0;
    }

    if (Array.isArray(answer)) {
      return answer.some((entry) => typeof entry === "string" && entry.trim().length > 0);
    }

    return false;
  });
}

/**
 * 娴犲海鐡熷鍫熸Ё鐏忓嫪鑵戠粔濠氭珟閸婇棿璐?null 閹?undefined 閻ㄥ嫭娼惄顔衡偓? *
 * @param answers - 閸樼喎顫愮粵鏃€顢嶉弰鐘茬殸
 * @returns 鏉╁洦鎶ら崥搴ｆ畱缁涙梹顢嶉弰鐘茬殸
 */
export function omitNullPendingUserInputAnswers(
  answers: ProviderUserInputAnswers,
): ProviderUserInputAnswers {
  return Object.fromEntries(
    Object.entries(answers).filter(([, answer]) => answer !== null && answer !== undefined),
  );
}

/**
 * 缂佺喕顓稿鎻掓礀缁涙梻娈戦梻顕€顣介弫浼村櫤閵? *
 * @param questions - 闂傤噣顣介崚妤勩€? * @param draftAnswers - 閸氬嫰妫舵０妯兼畱閼藉枪缁涙梹顢嶉弰鐘茬殸
 * @returns 瀹告彃娲栫粵鏃傛畱闂傤噣顣介弫浼村櫤
 */
export function countAnsweredPendingUserInputQuestions(
  questions: ReadonlyArray<UserInputQuestion>,
  draftAnswers: Record<string, PendingUserInputDraftAnswer>,
): number {
  return questions.reduce((count, question) => {
    return resolvePendingUserInputAnswer(question, draftAnswers[question.id]) ? count + 1 : count;
  }, 0);
}

/**
 * 閺屻儲澹樼粭顑跨娑擃亝婀崶鐐电摕闂傤噣顣介惃鍕偍瀵洏鈧倹澧嶉張澶愭６妫版﹢鍏樺鎻掓礀缁涙梹妞傛潻鏂挎礀閺堚偓閸氬簼绔存稉顏堟６妫版娈戠槐銏犵穿閵? *
 * @param questions - 闂傤噣顣介崚妤勩€? * @param draftAnswers - 閸氬嫰妫舵０妯兼畱閼藉枪缁涙梹顢嶉弰鐘茬殸
 * @returns 缁楊兛绔存稉顏呮弓閸ョ偟鐡熼梻顕€顣介惃鍕偍瀵? */
export function findFirstUnansweredPendingUserInputQuestionIndex(
  questions: ReadonlyArray<UserInputQuestion>,
  draftAnswers: Record<string, PendingUserInputDraftAnswer>,
): number {
  const unansweredIndex = questions.findIndex(
    (question) => !resolvePendingUserInputAnswer(question, draftAnswers[question.id]),
  );

  return unansweredIndex === -1 ? Math.max(questions.length - 1, 0) : unansweredIndex;
}

/**
 * 閹恒劌顕卞鍛暏閹寸柉绶崗銉ф畱鐎瑰本鏆ｆ潻娑樺娣団剝浼呴妴? * 鐠侊紕鐣昏ぐ鎾冲闂傤噣顣介妴浣虹摕濡楀牏濮搁幀浣碘偓浣哥暚閹存劕瀹崇粵澶涚礉娓?UI 濞撳弶鐓嬫担璺ㄦ暏閵? *
 * @param questions - 闂傤噣顣介崚妤勩€? * @param draftAnswers - 閸氬嫰妫舵０妯兼畱閼藉枪缁涙梹顢嶉弰鐘茬殸
 * @param questionIndex - 瑜版挸澧犻梻顕€顣界槐銏犵穿
 * @returns 鐎瑰本鏆ｉ惃鍕箻鎼达缚淇婇幁顖氼嚠鐠? */
export function derivePendingUserInputProgress(
  questions: ReadonlyArray<UserInputQuestion>,
  draftAnswers: Record<string, PendingUserInputDraftAnswer>,
  questionIndex: number,
): PendingUserInputProgress {
  const normalizedQuestionIndex =
    questions.length === 0 ? 0 : Math.max(0, Math.min(questionIndex, questions.length - 1));
  const activeQuestion = questions[normalizedQuestionIndex] ?? null;
  const activeDraft = activeQuestion ? draftAnswers[activeQuestion.id] : undefined;
  const resolvedAnswer = activeQuestion
    ? resolvePendingUserInputAnswer(activeQuestion, activeDraft)
    : null;
  const customAnswer = activeDraft?.customAnswer ?? "";
  const answeredQuestionCount = countAnsweredPendingUserInputQuestions(questions, draftAnswers);
  const isLastQuestion =
    questions.length === 0 ? true : normalizedQuestionIndex >= questions.length - 1;

  return {
    questionIndex: normalizedQuestionIndex,
    activeQuestion,
    activeDraft,
    selectedOptionLabels: normalizeSelectedOptionLabels(activeDraft?.selectedOptionLabels),
    customAnswer,
    resolvedAnswer,
    usingCustomAnswer: customAnswer.trim().length > 0,
    answeredQuestionCount,
    isLastQuestion,
    isComplete: buildPendingUserInputAnswers(questions, draftAnswers) !== null,
    canAdvance: Boolean(resolvedAnswer),
  };
}
