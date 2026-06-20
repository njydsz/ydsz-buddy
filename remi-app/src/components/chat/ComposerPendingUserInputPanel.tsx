/**
 * @file ComposerPendingUserInputPanel
 * @description ç¼–è¾‘å™¨ä¸­å¾…å¤„ç†ç”¨æˆ·è¾“å…¥çš„é¢æ¿ç»„ä»¶ï¼Œç”¨äºŽå±•ç¤ºè®¡åˆ’ç¡®è®¤é—®é¢˜ã€
 *              é€‰é¡¹åˆ—è¡¨å’Œå¿«æ·é”®é€‰æ‹©ï¼Œæ”¯æŒå•é€‰å’Œå¤šé€‰æ¨¡å¼åŠè‡ªåŠ¨æŽ¨è¿›ã€‚
 */

import { type ApprovalRequestId } from "~/contracts";
import { memo, useEffect, useEffectEvent, useRef } from "react";
import { type PendingUserInput } from "../../session-logic";
import {
  derivePendingUserInputProgress,
  type PendingUserInputDraftAnswer,
} from "../../pendingUserInput";
import { CheckIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";

/** ComposerPendingUserInputPanel ç»„ä»¶çš„å±žæ€§æŽ¥å£ */
interface PendingUserInputPanelProps {
  /** å¾…å¤„ç†çš„ç”¨æˆ·è¾“å…¥åˆ—è¡¨ */
  pendingUserInputs: PendingUserInput[];
  /** æ­£åœ¨å“åº”çš„å®¡æ‰¹è¯·æ±‚ ID åˆ—è¡¨ */
  respondingRequestIds: ApprovalRequestId[];
  /** å„é—®é¢˜çš„è‰ç¨¿ç­”æ¡ˆæ˜ å°„ */
  answers: Record<string, PendingUserInputDraftAnswer>;
  /** å½“å‰æ´»è·ƒé—®é¢˜çš„ç´¢å¼• */
  questionIndex: number;
  /** åˆ‡æ¢é€‰é¡¹é€‰ä¸­çŠ¶æ€çš„å›žè°ƒ */
  onToggleOption: (questionId: string, optionLabel: string) => PendingUserInputDraftAnswer | null;
  /** æŽ¨è¿›åˆ°ä¸‹ä¸€ä¸ªé—®é¢˜çš„å›žè°ƒ */
  onAdvance: (answerOverrides?: Record<string, PendingUserInputDraftAnswer>) => void;
}

/**
 * å¾…å¤„ç†ç”¨æˆ·è¾“å…¥é¢æ¿ç»„ä»¶ã€‚
 * å±•ç¤ºå½“å‰å¾…ç¡®è®¤çš„è®¡åˆ’é—®é¢˜ï¼Œæä¾›é€‰é¡¹åˆ—è¡¨å’Œå¿«æ·é”®æ“ä½œï¼Œ
 * å•é€‰æ¨¡å¼ä¸‹é€‰ä¸­åŽè‡ªåŠ¨æŽ¨è¿›ï¼Œå¤šé€‰æ¨¡å¼ä¸‹éœ€æ‰‹åŠ¨æäº¤ã€‚
 *
 * @param props.pendingUserInputs - å¾…å¤„ç†çš„ç”¨æˆ·è¾“å…¥åˆ—è¡¨
 * @param props.respondingRequestIds - æ­£åœ¨å“åº”çš„è¯·æ±‚ ID
 * @param props.answers - è‰ç¨¿ç­”æ¡ˆæ˜ å°„
 * @param props.questionIndex - å½“å‰é—®é¢˜ç´¢å¼•
 * @param props.onToggleOption - åˆ‡æ¢é€‰é¡¹å›žè°ƒ
 * @param props.onAdvance - æŽ¨è¿›å›žè°ƒ
 */
export const ComposerPendingUserInputPanel = memo(function ComposerPendingUserInputPanel({
  pendingUserInputs,
  respondingRequestIds,
  answers,
  questionIndex,
  onToggleOption,
  onAdvance,
}: PendingUserInputPanelProps) {
  if (pendingUserInputs.length === 0) return null;
  const activePrompt = pendingUserInputs[0];
  if (!activePrompt) return null;

  return (
    <ComposerPendingUserInputCard
      key={activePrompt.requestId}
      prompt={activePrompt}
      isResponding={respondingRequestIds.includes(activePrompt.requestId)}
      answers={answers}
      questionIndex={questionIndex}
      onToggleOption={onToggleOption}
      onAdvance={onAdvance}
    />
  );
});

/**
 * å¾…å¤„ç†ç”¨æˆ·è¾“å…¥å¡ç‰‡ç»„ä»¶ã€‚
 * æ¸²æŸ“å•ä¸ªå¾…ç¡®è®¤é—®é¢˜çš„é€‰é¡¹åˆ—è¡¨ï¼Œæ”¯æŒé”®ç›˜å¿«æ·é”®å’Œè‡ªåŠ¨æŽ¨è¿›é€»è¾‘ã€‚
 */
const ComposerPendingUserInputCard = memo(function ComposerPendingUserInputCard({
  prompt,
  isResponding,
  answers,
  questionIndex,
  onToggleOption,
  onAdvance,
}: {
  prompt: PendingUserInput;
  isResponding: boolean;
  answers: Record<string, PendingUserInputDraftAnswer>;
  questionIndex: number;
  onToggleOption: (questionId: string, optionLabel: string) => PendingUserInputDraftAnswer | null;
  onAdvance: (answerOverrides?: Record<string, PendingUserInputDraftAnswer>) => void;
}) {
  const progress = derivePendingUserInputProgress(prompt.questions, answers, questionIndex);
  const activeQuestion = progress.activeQuestion;
  const autoAdvanceTimerRef = useRef<number | null>(null);
  const onAdvanceRef = useRef(onAdvance);
  useEffect(() => {
    onAdvanceRef.current = onAdvance;
  }, [onAdvance]);

  // Cancel a pending auto-advance on unmount, and whenever the active question
  // changes or a response goes in flight ï¿½?otherwise a manual Next/Submit landing
  // inside the 200ms window leaves a stale timer that advances or submits again.
  useEffect(() => {
    return () => {
      if (autoAdvanceTimerRef.current !== null) {
        window.clearTimeout(autoAdvanceTimerRef.current);
        autoAdvanceTimerRef.current = null;
      }
    };
  }, [activeQuestion?.id, isResponding]);

  const handleOptionSelection = useEffectEvent((questionId: string, optionLabel: string) => {
    const nextDraftAnswer = onToggleOption(questionId, optionLabel);
    if (activeQuestion?.multiSelect) {
      return;
    }
    if (autoAdvanceTimerRef.current !== null) {
      window.clearTimeout(autoAdvanceTimerRef.current);
    }
    autoAdvanceTimerRef.current = window.setTimeout(() => {
      autoAdvanceTimerRef.current = null;
      onAdvanceRef.current(nextDraftAnswer ? { [questionId]: nextDraftAnswer } : undefined);
    }, 200);
  });

  // Keyboard shortcut: digits toggle options for multi-select prompts and preserve
  // the current auto-advance behavior for single-select questions.
  useEffect(() => {
    if (!activeQuestion || isResponding) return;
    const handler = (event: globalThis.KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        return;
      }
      // Let digit input pass through whenever focus is inside an editable region,
      // including nested contenteditable descendants inside the composer.
      if (
        target instanceof HTMLElement &&
        target.closest('[contenteditable]:not([contenteditable="false"])')
      ) {
        return;
      }
      const digit = Number.parseInt(event.key, 10);
      if (Number.isNaN(digit) || digit < 1 || digit > 9) return;
      const optionIndex = digit - 1;
      if (optionIndex >= activeQuestion.options.length) return;
      const option = activeQuestion.options[optionIndex];
      if (!option) return;
      event.preventDefault();
      handleOptionSelection(activeQuestion.id, option.label);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [activeQuestion, isResponding]);

  if (!activeQuestion) {
    return null;
  }

  return (
    <div className="px-4 py-3 sm:px-5">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          {prompt.questions.length > 1 ? (
            <span className="flex h-5 items-center rounded-md bg-[var(--color-background-elevated-secondary)] px-1.5 text-[10px] font-medium tabular-nums text-[var(--color-text-foreground-secondary)]">
              {questionIndex + 1}/{prompt.questions.length}
            </span>
          ) : null}
          <span className="text-[11px] font-semibold tracking-widest text-muted-foreground/50 uppercase">
            {activeQuestion.header}
          </span>
        </div>
      </div>
      <p className="mt-1.5 text-sm text-foreground/90">{activeQuestion.question}</p>
      {activeQuestion.multiSelect ? (
        <p className="mt-1 text-xs text-muted-foreground/65">Select one or more options.</p>
      ) : null}
      <div className="mt-3 space-y-1">
        {activeQuestion.options.map((option, index) => {
          const isSelected = progress.selectedOptionLabels.includes(option.label);
          const shortcutKey = index < 9 ? index + 1 : null;
          return (
            <button
              key={`${activeQuestion.id}:${option.label}`}
              type="button"
              disabled={isResponding}
              onClick={() => handleOptionSelection(activeQuestion.id, option.label)}
              className={cn(
                "group flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-all duration-150",
                isSelected
                  ? "border-[color:var(--color-border)] bg-[var(--color-background-button-secondary)] text-[var(--color-text-foreground)]"
                  : "border-transparent bg-[var(--color-background-elevated-secondary)] text-[var(--color-text-foreground)]/80 hover:border-[color:var(--color-border-light)] hover:bg-[var(--color-background-button-secondary-hover)]",
                isResponding && "opacity-50 cursor-not-allowed",
              )}
            >
              {shortcutKey !== null ? (
                <kbd
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded text-[11px] font-medium tabular-nums transition-colors duration-150",
                    isSelected
                      ? "bg-[var(--color-background-elevated-secondary)] text-[var(--color-text-foreground)]"
                      : "bg-[var(--color-background-elevated-secondary)] text-[var(--color-text-foreground-secondary)] group-hover:bg-[var(--color-background-button-secondary)] group-hover:text-[var(--color-text-foreground)]",
                  )}
                >
                  {shortcutKey}
                </kbd>
              ) : null}
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium">{option.label}</span>
                {option.description && option.description !== option.label ? (
                  <span className="ml-2 text-xs text-muted-foreground/50">
                    {option.description}
                  </span>
                ) : null}
              </div>
              {isSelected ? (
                <CheckIcon className="size-3.5 shrink-0 text-[var(--color-text-foreground)]" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
});
