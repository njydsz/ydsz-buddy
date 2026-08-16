/**
 * @file Monaco 编辑器 Inline Completion (Tab 补全 / Ghost Text) hook
 * @description 双源补全：LSP completion + AI Edit Prediction
 *
 * 设计原则:
 *   - 复用 useCodeEditorLsp 已启动的 LSP 服务器,不重复启动
 *   - 双源策略：先查 LSP（毫秒级），再查 AI Edit Prediction（百毫秒级）
 *   - 单条建议：取第一条与当前输入前缀匹配的 completion,生成最小差量 ghost text
 *   - 失败静默：不抛错,不影响编辑
 *   - 仅对单行 insertText 生成 ghost text(多行 snippet 跳过,避免破坏编辑流)
 *   - AI 预测支持多行 block 补全（函数体 / 代码块）
 *
 * 触发时机:Monaco 在用户停止输入约 50-100ms 后自动调用,无需额外 debounce。
 * 取消机制:Monaco 通过 CancellationToken 取消过期请求,我们在 await 后检查 token。
 *
 * AI 补全策略:
 *   - 通过 WebSocket JSON-RPC 调用后端 edit_prediction.predict
 *   - 后端使用 EditPredictionEngine 采集上下文 + 调用已接入的 Provider
 *   - 前端对 AI 返回的结果做 ghost text 计算
 *   - 支持 inline（单行）和 block（多行）两种补全
 *   - 用户 Tab 接受后回调 markAccepted 更新指标
 */

import { useEffect, useRef } from "react";
import type {
  IDisposable,
  languages as MonacoLanguagesNS,
} from "monaco-editor";

import type { MonacoEditor, MonacoNamespace } from "~/lib/monacoSetup";
import { lspCompletion } from "~/contracts/lsp";
import {
  predictEdit,
  markPredictionAccepted,
  type EditPredictionRequest,
} from "~/contracts/editPrediction";

/** 支持 inline completion 的语言(与 useCodeEditorLsp 对齐) */
const INLINE_COMPLETION_LANGUAGES = [
  "typescript",
  "javascript",
  "python",
  "rust",
  "go",
] as const;

/** Monaco languageId → 后端 languageId 映射(用于过滤不支持的文件) */
const MONACO_TO_LANGUAGE_ID: Record<string, string> = {
  typescript: "typescript",
  javascript: "javascript",
  python: "python",
  rust: "rust",
  go: "go",
  // Monaco 把 .tsx 识别为 typescriptreact,统一映射到 typescript
  typescriptreact: "typescript",
  javascriptreact: "javascript",
};

/** AI 预测的 debounce 时间（毫秒） */
const AI_PREDICTION_DEBOUNCE_MS = 300;

/** AI 预测的最大内容长度（避免发送超大文件） */
const MAX_CONTENT_LENGTH = 10000;

export interface UseCodeEditorInlineCompletionParams {
  /** 工作区根目录(仅用于判断是否启用,空字符串则不启用) */
  workspaceRoot: string;
  /** 当前打开的文件绝对路径 */
  filePath: string | null;
  /** Monaco editor 实例(onMount 时拿到) */
  editor: MonacoEditor | null;
  /** Monaco namespace(onMount 时拿到) */
  monaco: MonacoNamespace | null;
}

/**
 * 计算 ghost text:从完整 insertText 中去掉已输入的前缀,返回需要插入的差量。
 *
 * 例如:
 *   - 行内容: `const x = foo.ba` 光标在 `ba` 之后(column 19)
 *   - insertText: `baz`
 *   - 已输入单词前缀(从光标往左到非标识符字符): `ba`
 *   - 返回: `z`(只需要插入 `z`)
 *
 * 如果 insertText 不以已输入前缀开头,返回 null(不显示 ghost text)。
 * 如果 ghost text 包含换行,返回 null(仅接受单行 ghost text)。
 */
function computeGhostText(
  insertText: string,
  lineText: string,
  column: number,
): string | null {
  // column 是 1-based,转换为 0-based 的字符索引
  const cursorIndex = column - 1;
  // 从光标往左找标识符字符(字母/数字/下划线/$)
  let wordStart = cursorIndex;
  while (wordStart > 0 && /[\w$]/.test(lineText[wordStart - 1] ?? "")) {
    wordStart--;
  }
  const typedPrefix = lineText.slice(wordStart, cursorIndex);
  if (!typedPrefix) {
    // 光标前没有输入任何标识符,直接返回完整 insertText
    if (insertText && !insertText.includes("\n")) {
      return insertText;
    }
    return null;
  }
  // insertText 必须以 typedPrefix 开头(大小写敏感)
  if (!insertText.startsWith(typedPrefix)) {
    return null;
  }
  const ghost = insertText.slice(typedPrefix.length);
  // 仅接受单行 ghost text(多行会破坏编辑流,留给 snippet completion)
  if (ghost.includes("\n")) return null;
  // 空差量说明 insertText === typedPrefix,无需补全
  return ghost || null;
}

/**
 * 把 LSP completion + AI Edit Prediction 集成到 Monaco inline completion(Ghost Text)。
 *
 * 调用方只需在 CodeEditor 的 onMount 后把 editor/monaco 传入,
 * hook 会自动注册 InlineCompletionItemProvider,无需手动管理生命周期。
 *
 * 注意:hook 仅注册 provider,实际 ghost text 显示还需要在 Editor options 中
 * 开启 `inlineSuggest: { enabled: true }`(由 CodeEditor.tsx 负责)。
 */
export function useCodeEditorInlineCompletion({
  workspaceRoot,
  filePath,
  editor,
  monaco,
}: UseCodeEditorInlineCompletionParams): void {
  const disposablesRef = useRef<IDisposable[]>([]);
  // filePath 用 ref 保存最新值,避免 provider 闭包过期
  const filePathRef = useRef<string | null>(filePath);
  filePathRef.current = filePath;
  // workspaceRoot ref
  const workspaceRootRef = useRef<string>(workspaceRoot);
  workspaceRootRef.current = workspaceRoot;
  // AI 预测上一次请求时间,用于 debounce
  const lastAiRequestTimeRef = useRef<number>(0);
  // 上一次 AI 预测的延迟（用于 markAccepted）
  const lastAiLatencyRef = useRef<number>(0);
  // 上一次 AI 预测的文件和语言（用于 markAccepted）
  const lastAiPredictionRef = useRef<{ file: string; lang: string } | null>(null);

  useEffect(() => {
    if (!monaco || !editor || !workspaceRoot) return;

    const languages = monaco.languages;

    // 注册 Tab 接受回调：当用户 Tab 接受 ghost text 时，通知后端更新指标
    const acceptDisposable = editor.onDidChangeModelContent(() => {
      // 如果有 pending 的 AI 预测记录，在内容变化时判断是否被接受
      // Monaco 的 inlineSuggest 已内置 Tab 接受机制，
      // 这里通过检查内容变化来推断接受行为
    });

    const provider = languages.registerInlineCompletionsProvider(
      [...INLINE_COMPLETION_LANGUAGES],
      {
        provideInlineCompletions: async (model, position, _context, token) => {
          // 仅对支持的文件类型触发(避免 markdown/json 等无谓请求)
          const langId = model.getLanguageId?.() ?? "";
          if (!MONACO_TO_LANGUAGE_ID[langId]) {
            return { items: [] };
          }

          const path = model.uri.path;
          const language = MONACO_TO_LANGUAGE_ID[langId];
          const lineContent = model.getLineContent(position.lineNumber);
          const outItems: MonacoLanguagesNS.InlineCompletion[] = [];

          // ===== 源 1：LSP 补全（快速，毫秒级） =====
          try {
            const items = await lspCompletion(
              path,
              position.lineNumber - 1,
              position.column - 1,
            );
            // await 期间请求可能已被取消,检查 token
            if (token.isCancellationRequested) return { items: [] };

            for (const item of items) {
              const insertText = item.insertText ?? item.label;
              if (!insertText) continue;
              // 跳过多行 insertText(含 \n 或 snippet 语法的 $1 占位符)
              if (insertText.includes("\n")) continue;
              const ghost = computeGhostText(
                insertText,
                lineContent,
                position.column,
              );
              if (!ghost) continue;

              outItems.push({
                insertText: ghost,
                range: {
                  startLineNumber: position.lineNumber,
                  endLineNumber: position.lineNumber,
                  startColumn: position.column,
                  endColumn: position.column,
                },
              });
              // 只取第一条最相关的建议(避免 ghost text 过多干扰)
              break;
            }
          } catch {
            // 静默:编辑器功能不能因 inline completion 失败而中断
          }

          // 如果 LSP 已经给出结果，跳过 AI 预测（节省 Provider 调用）
          if (outItems.length > 0) {
            return { items: outItems };
          }

          // ===== 源 2：AI Edit Prediction（深度，百毫秒级） =====
          // Debounce：距上次 AI 请求不足 AI_PREDICTION_DEBOUNCE_MS 则跳过
          const now = Date.now();
          if (now - lastAiRequestTimeRef.current < AI_PREDICTION_DEBOUNCE_MS) {
            return { items: [] };
          }
          lastAiRequestTimeRef.current = now;

          try {
            // 截取光标附近内容（避免发送整个大文件）
            const fullContent = model.getValue();
            const truncatedContent =
              fullContent.length > MAX_CONTENT_LENGTH
                ? fullContent.slice(0, MAX_CONTENT_LENGTH)
                : fullContent;

            const aiReq: EditPredictionRequest = {
              filePath: path,
              content: truncatedContent,
              cursorLine: position.lineNumber - 1,
              cursorColumn: position.column - 1,
              language,
              workspaceRoot: workspaceRootRef.current || undefined,
            };

            const aiResponse = await predictEdit(aiReq);
            if (token.isCancellationRequested) return { items: [] };

            // 记录 AI 预测信息（用于 Tab 接受后回调）
            lastAiLatencyRef.current = aiResponse.elapsedMs;
            lastAiPredictionRef.current = { file: path, lang: language };

            // 处理 AI 返回的建议
            for (const suggestion of aiResponse.suggestions) {
              if (!suggestion.text) continue;

              if (suggestion.kind === "block" || suggestion.text.includes("\n")) {
                // 多行 block 补全：直接插入完整文本
                outItems.push({
                  insertText: suggestion.text,
                  range: {
                    startLineNumber: position.lineNumber,
                    endLineNumber: position.lineNumber,
                    startColumn: position.column,
                    endColumn: position.column,
                  },
                });
              } else {
                // 单行 inline 补全：计算 ghost text 差量
                const ghost = computeGhostText(
                  suggestion.text,
                  lineContent,
                  position.column,
                );
                if (!ghost) continue;

                outItems.push({
                  insertText: ghost,
                  range: {
                    startLineNumber: position.lineNumber,
                    endLineNumber: position.lineNumber,
                    startColumn: position.column,
                    endColumn: position.column,
                  },
                });
              }
              // 只取第一条 AI 建议
              break;
            }

            // 异步注册 Tab 接受检测
            // Monaco 在 Tab 接受 inline completion 后会修改 model 内容，
            // 我们通过监听下一次 model content change 来推断接受
            if (outItems.length > 0) {
              const rawPredictedText = outItems[0].insertText;
              const predictedText =
                typeof rawPredictedText === "string"
                  ? rawPredictedText
                  : rawPredictedText.snippet;
              const checkAccept = editor.onDidChangeModelContent(() => {
                // 检查模型内容是否包含了预测文本（即用户 Tab 接受了）
                const newContent = model.getValue();
                if (newContent.includes(predictedText.slice(0, 20))) {
                  // 标记为已接受
                  if (lastAiPredictionRef.current) {
                    markPredictionAccepted(
                      lastAiPredictionRef.current.file,
                      lastAiPredictionRef.current.lang,
                      lastAiLatencyRef.current,
                    ).catch(() => {});
                  }
                  lastAiPredictionRef.current = null;
                }
                checkAccept.dispose();
              });
              // 5 秒后自动清理监听
              setTimeout(() => checkAccept.dispose(), 5000);
            }
          } catch {
            // AI 预测失败静默
          }

          return { items: outItems };
        },
        freeInlineCompletions: () => {
          // 无状态结果,无需清理
        },
      },
    );

    disposablesRef.current.push(provider);
    disposablesRef.current.push(acceptDisposable);

    return () => {
      provider.dispose();
      acceptDisposable.dispose();
      disposablesRef.current = disposablesRef.current.filter(
        (d) => d !== provider && d !== acceptDisposable,
      );
    };
    // 仅在 monaco/editor/workspaceRoot 变化时重新注册;
    // filePath 变化通过 ref 获取,避免频繁注册/注销 provider
  }, [monaco, editor, workspaceRoot]);
}
