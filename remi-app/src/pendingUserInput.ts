/**
 * @file 寰呯敤鎴疯緭鍏ワ紙Pending User Input锛夊鐞? *
 * 澶勭悊 AI Provider 璇锋眰鐢ㄦ埛杈撳叆鏃剁殑鑽夌ǹ绛旀绠＄悊鍜岃繘搴﹁绠椼€? * 鏀寔鍗曢€夊拰澶氶€夐棶棰橈紝鎻愪緵绛旀瑙ｆ瀽銆侀€夐」鍒囨崲銆佽繘搴︽帹瀵肩瓑鍔熻兘锛? * 渚?ChatView 鍜岀紪杈戝櫒闈㈡澘浣跨敤銆? */

import type { ProviderUserInputAnswers, UserInputQuestion } from "~/contracts";

/**
 * 寰呯敤鎴疯緭鍏ョ殑鑽夌ǹ绛旀锛岃褰曠敤鎴峰綋鍓嶇殑閫夋嫨鐘舵€併€? */
export interface PendingUserInputDraftAnswer {
  /** 宸查€夋嫨鐨勯€夐」鏍囩鍒楄〃 */
  selectedOptionLabels?: string[];
  /** 鑷畾涔夎緭鍏ョ殑绛旀鏂囨湰 */
  customAnswer?: string;
}

/**
 * 寰呯敤鎴疯緭鍏ョ殑杩涘害淇℃伅锛屾弿杩板綋鍓嶉棶棰樼殑鍥炵瓟鐘舵€佸拰瀵艰埅淇℃伅銆? */
export interface PendingUserInputProgress {
  /** 褰撳墠闂绱㈠紩 */
  questionIndex: number;
  /** 褰撳墠娲昏穬鐨勯棶棰橈紝鏃犻棶棰樻椂涓?null */
  activeQuestion: UserInputQuestion | null;
  /** 褰撳墠闂鐨勮崏绋跨瓟妗?*/
  activeDraft: PendingUserInputDraftAnswer | undefined;
  /** 宸查€夋嫨鐨勯€夐」鏍囩鍒楄〃锛堟爣鍑嗗寲鍚庯級 */
  selectedOptionLabels: string[];
  /** 鑷畾涔夌瓟妗堟枃鏈?*/
  customAnswer: string;
  /** 宸茶В鏋愮殑绛旀鍊硷紝鍗曢€変负瀛楃涓诧紝澶氶€変负瀛楃涓叉暟缁勶紝鏈洖绛斾负 null */
  resolvedAnswer: string | string[] | null;
  /** 鏄惁姝ｅ湪浣跨敤鑷畾涔夌瓟妗?*/
  usingCustomAnswer: boolean;
  /** 宸插洖绛旂殑闂鏁伴噺 */
  answeredQuestionCount: number;
  /** 鏄惁涓烘渶鍚庝竴涓棶棰?*/
  isLastQuestion: boolean;
  /** 鎵€鏈夐棶棰樻槸鍚﹀凡鍥炵瓟瀹屾瘯 */
  isComplete: boolean;
  /** 鏄惁鍙互鍓嶈繘鍒颁笅涓€棰?*/
  canAdvance: boolean;
}

/**
 * 鏍囧噯鍖栬崏绋跨瓟妗堟枃鏈紝鍘婚櫎棣栧熬绌烘牸锛岀┖瀛楃涓茶繑鍥?null銆? *
 * @param value - 鍘熷绛旀鏂囨湰
 * @returns 鏍囧噯鍖栧悗鐨勬枃鏈紝鏃犳晥鏃惰繑鍥?null
 */
function normalizeDraftAnswer(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * 鏍囧噯鍖栭€夐」閫夋嫨鍒楄〃锛岃繃婊ゆ棤鏁堝€笺€佸幓闄ょ┖鏍煎苟鍘婚噸銆? * 浣?UI 鍜屾彁浜ら€昏緫鍏变韩鍚屼竴鏍囧噯鍒楄〃銆? *
 * @param value - 鍘熷閫夐」鏍囩鍒楄〃
 * @returns 鏍囧噯鍖栧悗鐨勯€夐」鏍囩鏁扮粍
 */
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
 * 瑙ｆ瀽鍗曚釜闂鐨勬渶缁堢瓟妗堛€備紭鍏堜娇鐢ㄨ嚜瀹氫箟绛旀锛屽叾娆′娇鐢ㄩ€夐」閫夋嫨銆? * 澶氶€夐棶棰樿繑鍥炲瓧绗︿覆鏁扮粍锛屽崟閫夐棶棰樿繑鍥炲瓧绗︿覆銆? *
 * @param question - 鐢ㄦ埛杈撳叆闂
 * @param draft - 鑽夌ǹ绛旀
 * @returns 瑙ｆ瀽鍚庣殑绛旀锛屾湭鍥炵瓟杩斿洖 null
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
 * 璁剧疆鑷畾涔夌瓟妗堛€傚綋鑷畾涔夌瓟妗堥潪绌烘椂娓呴櫎閫夐」閫夋嫨锛屽惁鍒欎繚鐣欎箣鍓嶇殑閫夐」銆? *
 * @param draft - 褰撳墠鑽夌ǹ绛旀
 * @param customAnswer - 鏂扮殑鑷畾涔夌瓟妗堟枃鏈? * @returns 鏇存柊鍚庣殑鑽夌ǹ绛旀
 */
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
 * 鍒囨崲閫夐」鐨勯€夋嫨鐘舵€併€傚閫夋ā寮忎笅鍦ㄥ垪琛ㄤ腑娣诲姞鎴栫Щ闄ら€夐」锛? * 鍗曢€夋ā寮忎笅鐩存帴鏇挎崲涓哄綋鍓嶉€夐」銆傚垏鎹㈤€夐」鏃舵竻闄よ嚜瀹氫箟绛旀銆? *
 * @param question - 鐢ㄦ埛杈撳叆闂
 * @param draft - 褰撳墠鑽夌ǹ绛旀
 * @param optionLabel - 瑕佸垏鎹㈢殑閫夐」鏍囩
 * @returns 鏇存柊鍚庣殑鑽夌ǹ绛旀
 */
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
 * 鏋勫缓鎵€鏈夐棶棰樼殑鏈€缁堢瓟妗堟槧灏勩€備换涓€闂鏈洖绛斿垯杩斿洖 null銆? *
 * @param questions - 闂鍒楄〃
 * @param draftAnswers - 鍚勯棶棰樼殑鑽夌ǹ绛旀鏄犲皠
 * @returns 绛旀鏄犲皠锛堥棶棰?ID 鈫?绛旀鍊硷級锛屽瓨鍦ㄦ湭鍥炵瓟闂鏃惰繑鍥?null
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
 * 鍒ゆ柇绛旀鏄犲皠鏄惁瀹屾暣锛堟墍鏈夐棶棰橀兘鏈夋湁鏁堢瓟妗堬級銆? *
 * @param answers - 绛旀鏄犲皠
 * @returns 鏄惁鎵€鏈夐棶棰橀兘宸插洖绛? */
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
 * 浠庣瓟妗堟槧灏勪腑绉婚櫎鍊间负 null 鎴?undefined 鐨勬潯鐩€? *
 * @param answers - 鍘熷绛旀鏄犲皠
 * @returns 杩囨护鍚庣殑绛旀鏄犲皠
 */
export function omitNullPendingUserInputAnswers(
  answers: ProviderUserInputAnswers,
): ProviderUserInputAnswers {
  return Object.fromEntries(
    Object.entries(answers).filter(([, answer]) => answer !== null && answer !== undefined),
  );
}

/**
 * 缁熻宸插洖绛旂殑闂鏁伴噺銆? *
 * @param questions - 闂鍒楄〃
 * @param draftAnswers - 鍚勯棶棰樼殑鑽夌ǹ绛旀鏄犲皠
 * @returns 宸插洖绛旂殑闂鏁伴噺
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
 * 鏌ユ壘绗竴涓湭鍥炵瓟闂鐨勭储寮曘€傛墍鏈夐棶棰橀兘宸插洖绛旀椂杩斿洖鏈€鍚庝竴涓棶棰樼殑绱㈠紩銆? *
 * @param questions - 闂鍒楄〃
 * @param draftAnswers - 鍚勯棶棰樼殑鑽夌ǹ绛旀鏄犲皠
 * @returns 绗竴涓湭鍥炵瓟闂鐨勭储寮? */
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
 * 鎺ㄥ寰呯敤鎴疯緭鍏ョ殑瀹屾暣杩涘害淇℃伅銆? * 璁＄畻褰撳墠闂銆佺瓟妗堢姸鎬併€佸畬鎴愬害绛夛紝渚?UI 娓叉煋浣跨敤銆? *
 * @param questions - 闂鍒楄〃
 * @param draftAnswers - 鍚勯棶棰樼殑鑽夌ǹ绛旀鏄犲皠
 * @param questionIndex - 褰撳墠闂绱㈠紩
 * @returns 瀹屾暣鐨勮繘搴︿俊鎭璞? */
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
