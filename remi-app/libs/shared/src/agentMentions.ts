/**
 * @file 代理提及（@mention）解析工具模块
 *
 * @description
 * 提供用户输入中 `@alias(task)` 格式的内联代理指令解析功能。
 * 支持从文本中提取代理提及，并将这些提及转换为结构化的代理调用指令，
 * 用于构建 Claude 子代理的提示词。
 *
 * 核心功能：
 * - 解析文本中的 `@alias(task)` 格式提及（`parseAgentMentionInvocations`）
 * - 构建 Claude 子代理的结构化提示词（`buildClaudeSubagentPrompt`）
 * - 支持括号平衡的任务描述解析
 * - 支持多种代理别名格式
 *
 * 使用场景：
 * - 用户在聊天中使用 `@agent-name(执行某个任务)` 格式调用子代理
 * - 将用户的自然语言指令转换为结构化的代理调用
 * - 为 Claude 代理生成包含子代理指令的完整提示词
 *
 * @module agentMentions
 * @layer 共享工具层
 *
 * @example
 * ```ts
 * import { parseAgentMentionInvocations, buildClaudeSubagentPrompt } from './agentMentions';
 *
 * const text = '请帮我 @reviewer(审查这段代码) 和 @tester(编写单元测试)';
 *
 * // 解析所有代理提及
 * const invocations = parseAgentMentionInvocations(text, 'claudeAgent');
 * console.log(invocations);
 * // [
 * //   { alias: 'reviewer', task: '审查这段代码', ... },
 * //   { alias: 'tester', task: '编写单元测试', ... }
 * // ]
 *
 * // 构建 Claude 子代理提示词
 * const result = buildClaudeSubagentPrompt(text);
 * console.log(result.prompt);
 * // 生成包含子代理指令的完整提示词
 * ```
 */
import {
  resolveAgentAlias,
  type ClaudeSubagentAliasDefinition,
  type ProviderKind,
  type ResolvedAgentAlias,
} from "@remi-code/contracts";

/**
 * 解析后的代理提及调用信息接口
 *
 * 包含从文本中提取的单个 `@alias(task)` 调用的所有信息，
 * 用于后续的代理调度和任务执行。
 *
 * @interface ParsedAgentMentionInvocation
 *
 * @property {string} alias - 代理别名（如 "reviewer"、"tester"）
 * @property {string} task - 任务描述（括号内的内容）
 * @property {string} raw - 原始提及文本（包括 `@alias(task)` 完整内容）
 * @property {number} start - 提及在原文本中的起始位置索引
 * @property {number} end - 提及在原文本中的结束位置索引（不包含）
 * @property {ResolvedAgentAlias} definition - 解析后的代理定义信息
 *
 * @example
 * ```ts
 * const invocation: ParsedAgentMentionInvocation = {
 *   alias: 'reviewer',
 *   task: '审查这段代码',
 *   raw: '@reviewer(审查这段代码)',
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
 * 判断字符是否为合法的代理别名字符
 *
 * 合法的别名字符包括：字母（a-z, A-Z）、数字（0-9）、点号（.）、下划线（_）、连字符（-）。
 *
 * @param char - 待检查的字符
 * @returns 如果是合法的别名字符返回 true，否则返回 false
 *
 * @private 此函数为内部实现细节，不应直接调用
 */
function isAliasChar(char: string | undefined): boolean {
  return typeof char === "string" && /[a-zA-Z0-9._-]/.test(char);
}

/**
 * 判断字符是否为提及边界（空白字符或字符串结束）
 *
 * 提及边界定义为：字符为 undefined（字符串结束）或空白字符（空格、制表符、换行等）。
 * 用于确保 `@` 符号前面是单词边界，避免匹配邮箱地址等场景。
 *
 * @param char - 待检查的字符
 * @returns 如果是边界字符返回 true，否则返回 false
 *
 * @private 此函数为内部实现细节，不应直接调用
 */
function isMentionBoundary(char: string | undefined): boolean {
  return char === undefined || /\s/.test(char);
}

/**
 * 读取括号平衡的任务描述
 *
 * 从指定的左括号位置开始，读取括号内的任务描述，支持嵌套括号。
 * 使用深度计数器追踪括号嵌套层级，确保正确匹配闭合括号。
 *
 * 算法说明：
 * 1. 从左括号的下一个字符开始遍历
 * 2. 遇到 `(` 时深度加 1
 * 3. 遇到 `)` 时深度减 1
 * 4. 当深度归零时，找到匹配的闭合括号
 * 5. 如果遍历结束深度仍未归零，返回 null（括号不匹配）
 *
 * @param text - 源文本
 * @param openParenIndex - 左括号在文本中的索引位置
 * @returns 包含任务描述和结束位置的对象，如果括号不匹配返回 null
 *
 * @private 此函数为内部实现细节，不应直接调用
 *
 * @example
 * ```ts
 * readBalancedTask('@reviewer(审查代码)', 10);
 * // 返回: { task: '审查代码', end: 19 }
 *
 * readBalancedTask('@agent(任务(嵌套))', 8);
 * // 返回: { task: '任务(嵌套)', end: 19 }
 *
 * readBalancedTask('@agent(未闭合', 7);
 * // 返回: null
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
 * 解析文本中所有的代理提及调用
 *
 * 扫描输入文本，提取所有符合 `@alias(task)` 格式的代理提及，
 * 并解析每个提及的代理定义信息。解析过程遵循以下规则：
 *
 * 1. `@` 符号必须在单词边界（前面是空白或字符串开头）
 * 2. 别名只能包含字母、数字、点号、下划线、连字符
 * 3. 别名后必须紧跟左括号 `(`
 * 4. 括号内的任务描述支持嵌套括号
 * 5. 代理别名必须能通过 `resolveAgentAlias` 解析为有效的代理定义
 *
 * 算法复杂度：
 * - 时间复杂度: O(n)，其中 n 为文本长度
 * - 空间复杂度: O(k)，其中 k 为解析到的提及数量
 *
 * @param text - 待解析的输入文本
 * @param provider - 代理提供商类型（如 "claudeAgent"）
 * @returns 解析后的代理提及调用数组，按出现顺序排列
 *
 * @throws 此函数不会抛出异常
 *
 * @example
 * ```ts
 * const text = '请 @reviewer(审查代码) 和 @tester(写测试)';
 * const invocations = parseAgentMentionInvocations(text, 'claudeAgent');
 *
 * console.log(invocations.length); // 2
 * console.log(invocations[0].alias); // 'reviewer'
 * console.log(invocations[0].task);  // '审查代码'
 * console.log(invocations[1].alias); // 'tester'
 * console.log(invocations[1].task);  // '写测试'
 * ```
 *
 * @example 不匹配的提及会被忽略
 * ```ts
 * const text = '邮箱 user@example.com 和 @invalid(未闭合';
 * const invocations = parseAgentMentionInvocations(text, 'claudeAgent');
 * console.log(invocations.length); // 0（两个都不匹配）
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
    // 检查 @ 符号前是否为单词边界
    if (!isMentionBoundary(text[index - 1])) {
      continue;
    }

    // 读取别名
    let aliasEnd = index + 1;
    while (isAliasChar(text[aliasEnd])) {
      aliasEnd += 1;
    }

    const alias = text.slice(index + 1, aliasEnd);
    // 别名不能为空，且后面必须紧跟左括号
    if (alias.length === 0 || text[aliasEnd] !== "(") {
      continue;
    }

    // 解析代理定义
    const resolved = resolveAgentAlias(alias, provider);
    if (!resolved) {
      continue;
    }

    // 读取括号平衡的任务描述
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

    // 跳过已解析的部分
    index = taskMatch.end - 1;
  }

  return invocations;
}

/**
 * 构建 Claude 子代理的结构化提示词
 *
 * 从输入文本中解析所有 Claude 子代理提及（`kind === "claude-subagent"`），
 * 并将它们转换为结构化的指令格式，嵌入到完整的提示词中。
 *
 * 生成的提示词包含以下部分：
 * 1. 指令说明：告知 Claude 用户使用了内联子代理指令
 * 2. 执行要求：明确要求使用 Agent 工具调用指定的子代理
 * 3. 后续处理：要求完成子代理任务后继续处理整体请求
 * 4. 具体指令列表：每个子代理调用的编号列表
 * 5. 原始提示词：用户的原始输入文本
 *
 * 如果没有解析到子代理提及，直接返回原始文本。
 *
 * @param text - 用户输入的原始文本
 * @returns 包含结构化提示词和解析到的调用信息的对象
 *   - `prompt`: 构建完成的完整提示词字符串
 *   - `invocations`: 解析到的 Claude 子代理调用数组
 *
 * @throws 此函数不会抛出异常
 *
 * @example
 * ```ts
 * const text = '请 @reviewer(审查代码) 和 @tester(写测试)';
 * const result = buildClaudeSubagentPrompt(text);
 *
 * console.log(result.prompt);
 * // 输出：
 * // The user included inline subagent directives in the form @alias(task).
 * // Execute each directive explicitly via the Agent tool using the named subagent below.
 * // After the delegated work completes, continue with the overall request and synthesize the results.
 * // Do not echo the literal @alias(task) syntax back to the user unless it is directly relevant.
 * //
 * // Inline directives:
 * // 1. Use the "Code Reviewer" agent for this task:
 * // 审查代码
 * //
 * // 2. Use the "Test Engineer" agent for this task:
 * // 写测试
 * //
 * // Original user prompt:
 * // 请 @reviewer(审查代码) 和 @tester(写测试)
 *
 * console.log(result.invocations.length); // 2
 * ```
 *
 * @example 没有子代理提及时
 * ```ts
 * const text = '普通文本，没有代理提及';
 * const result = buildClaudeSubagentPrompt(text);
 *
 * console.log(result.prompt); // '普通文本，没有代理提及'（原样返回）
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
