/**
 * @file 待用户输入（Pending User Input）处理
 *
 * 处理 AI Provider 请求用户输入时的草稿答案管理和进度计算。
 * 支持单选和多选问题，提供答案解析、选项切换、进度推导等功能，
 * 供 ChatView 和编辑器面板使用。
 */

import type { ProviderUserInputAnswers, UserInputQuestion } from "@remi-code/contracts";

/**
 * 待用户输入的草稿答案，记录用户当前的选择状态。
 */
export interface PendingUserInputDraftAnswer {
  /** 已选择的选项标签列表 */
  selectedOptionLabels?: string[];
  /** 自定义输入的答案文本 */
  customAnswer?: string;
}

/**
 * 待用户输入的进度信息，描述当前问题的回答状态和导航信息。
 */
export interface PendingUserInputProgress {
  /** 当前问题索引 */
  questionIndex: number;
  /** 当前活跃的问题，无问题时为 null */
  activeQuestion: UserInputQuestion | null;
  /** 当前问题的草稿答案 */
  activeDraft: PendingUserInputDraftAnswer | undefined;
  /** 已选择的选项标签列表（标准化后） */
  selectedOptionLabels: string[];
  /** 自定义答案文本 */
  customAnswer: string;
  /** 已解析的答案值，单选为字符串，多选为字符串数组，未回答为 null */
  resolvedAnswer: string | string[] | null;
  /** 是否正在使用自定义答案 */
  usingCustomAnswer: boolean;
  /** 已回答的问题数量 */
  answeredQuestionCount: number;
  /** 是否为最后一个问题 */
  isLastQuestion: boolean;
  /** 所有问题是否已回答完毕 */
  isComplete: boolean;
  /** 是否可以前进到下一题 */
  canAdvance: boolean;
}

/**
 * 标准化草稿答案文本，去除首尾空格，空字符串返回 null。
 *
 * @param value - 原始答案文本
 * @returns 标准化后的文本，无效时返回 null
 */
function normalizeDraftAnswer(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * 标准化选项选择列表，过滤无效值、去除空格并去重。
 * 使 UI 和提交逻辑共享同一标准列表。
 *
 * @param value - 原始选项标签列表
 * @returns 标准化后的选项标签数组
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
 * 解析单个问题的最终答案。优先使用自定义答案，其次使用选项选择。
 * 多选问题返回字符串数组，单选问题返回字符串。
 *
 * @param question - 用户输入问题
 * @param draft - 草稿答案
 * @returns 解析后的答案，未回答返回 null
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
 * 设置自定义答案。当自定义答案非空时清除选项选择，否则保留之前的选项。
 *
 * @param draft - 当前草稿答案
 * @param customAnswer - 新的自定义答案文本
 * @returns 更新后的草稿答案
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
 * 切换选项的选择状态。多选模式下在列表中添加或移除选项，
 * 单选模式下直接替换为当前选项。切换选项时清除自定义答案。
 *
 * @param question - 用户输入问题
 * @param draft - 当前草稿答案
 * @param optionLabel - 要切换的选项标签
 * @returns 更新后的草稿答案
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
 * 构建所有问题的最终答案映射。任一问题未回答则返回 null。
 *
 * @param questions - 问题列表
 * @param draftAnswers - 各问题的草稿答案映射
 * @returns 答案映射（问题 ID → 答案值），存在未回答问题时返回 null
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
 * 判断答案映射是否完整（所有问题都有有效答案）。
 *
 * @param answers - 答案映射
 * @returns 是否所有问题都已回答
 */
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
 * 从答案映射中移除值为 null 或 undefined 的条目。
 *
 * @param answers - 原始答案映射
 * @returns 过滤后的答案映射
 */
export function omitNullPendingUserInputAnswers(
  answers: ProviderUserInputAnswers,
): ProviderUserInputAnswers {
  return Object.fromEntries(
    Object.entries(answers).filter(([, answer]) => answer !== null && answer !== undefined),
  );
}

/**
 * 统计已回答的问题数量。
 *
 * @param questions - 问题列表
 * @param draftAnswers - 各问题的草稿答案映射
 * @returns 已回答的问题数量
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
 * 查找第一个未回答问题的索引。所有问题都已回答时返回最后一个问题的索引。
 *
 * @param questions - 问题列表
 * @param draftAnswers - 各问题的草稿答案映射
 * @returns 第一个未回答问题的索引
 */
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
 * 推导待用户输入的完整进度信息。
 * 计算当前问题、答案状态、完成度等，供 UI 渲染使用。
 *
 * @param questions - 问题列表
 * @param draftAnswers - 各问题的草稿答案映射
 * @param questionIndex - 当前问题索引
 * @returns 完整的进度信息对象
 */
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
