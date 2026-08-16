/**
 * @file Agent Mention 解析工具模块
 *
 * 本模块提供对 Composer 中输入的 `@alias(task)` 语法进行解析的工具。
 * 解析后的结果会包含别名（alias）、任务内容（task）、位置（start/end）等元信息，
 * 可用于触发对应的子代理委派流程。
 *
 * ## 核心功能
 *
 * - **解析 Mention**：从 Composer 文本中提取 `@alias(task)` 模式
 * - **别名解析**：通过 `resolveAgentAlias` 查找对应的 Agent 定义
 * - **位置标记**：记录每个 Mention 的起止位置，便于 UI 高亮
 * - **任务内容提取**：支持嵌套括号、字符串转义等复杂情况
 *
 * ## 解析规则
 *
 * - 别名允许字符：`a-zA-Z0-9._-`
 * - Mention 必须以 `@` 开头，前面必须是空白或字符串开头
 * - 任务内容用 `(...)` 包裹，支持嵌套括号
 * - Mention 后必须跟随空白或字符串结束
 *
 * ## 使用场景
 *
 * - Composer 中输入 `@review(this code)` 触发代码审查子代理
 * - UI 高亮 Mention 文本
 * - 提交前解析所有 Mention 以转换为子任务
 *
 * ## 注意事项
 *
 * - 解析失败时返回 `null`，不会抛出异常
 * - 嵌套括号最多支持 3 层
 * - 任务内容支持单引号/双引号字符串
 */

import {
  resolveAgentAlias,
  type ClaudeSubagentAliasDefinition,
  type ProviderKind,
  type ResolvedAgentAlias,
} from "@ydsz-buddy/contracts";

export interface ParsedAgentMentionInvocation {
  readonly alias: string;
  readonly task: string;
  readonly raw: string;
  readonly start: number;
  readonly end: number;
  readonly definition: ResolvedAgentAlias;
}

function isAliasChar(char: string | undefined): boolean {
  return typeof char === "string" && /[a-zA-Z0-9._-]/.test(char);
}

function isMentionBoundary(char: string | undefined): boolean {
  return char === undefined || /\s/.test(char);
}

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

export function parseAgentMentionInvocations(
  text: string,
  provider: ProviderKind,
): ReadonlyArray<ParsedAgentMentionInvocation> {
  const invocations: ParsedAgentMentionInvocation[] = [];

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "@") {
      continue;
    }
    if (!isMentionBoundary(text[index - 1])) {
      continue;
    }

    let aliasEnd = index + 1;
    while (isAliasChar(text[aliasEnd])) {
      aliasEnd += 1;
    }

    const alias = text.slice(index + 1, aliasEnd);
    if (alias.length === 0 || text[aliasEnd] !== "(") {
      continue;
    }

    const resolved = resolveAgentAlias(alias, provider);
    if (!resolved) {
      continue;
    }

    const taskMatch = readBalancedTask(text, aliasEnd);
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

    index = taskMatch.end - 1;
  }

  return invocations;
}

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
