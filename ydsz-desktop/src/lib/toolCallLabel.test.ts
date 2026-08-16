/**
 * @file toolCallLabel 单元测试
 *
 * 覆盖：
 * - normalizeCompactToolLabel：去除后缀状态词
 * - deriveReadableToolTitle：各种输入组合
 * - deriveReadableCommandDisplay：cat/grep/ls/find/mkdir/rm/cp/mv/git/default
 * - deriveInlineCommandCall：解 shell 包装
 *
 * 策略：纯函数，构造各种输入，断言输出。
 */

import { describe, expect, it } from "vitest";
import {
  normalizeCompactToolLabel,
  deriveReadableToolTitle,
  deriveReadableCommandDisplay,
  deriveInlineCommandCall,
} from "./toolCallLabel";

// =============================================================================
// 1. normalizeCompactToolLabel
// =============================================================================

describe("normalizeCompactToolLabel", () => {
  it("去除后缀 'completed'", () => {
    expect(normalizeCompactToolLabel("Read file completed")).toBe("Read file");
  });
  it("去除后缀 'running'（大小写不敏感）", () => {
    expect(normalizeCompactToolLabel("npm install RUNNING")).toBe("npm install");
  });
  it("去除后缀 'started'", () => {
    expect(normalizeCompactToolLabel("Build started")).toBe("Build");
  });
  it("去除后缀 'success'", () => {
    expect(normalizeCompactToolLabel("Deploy success")).toBe("Deploy");
  });
  it("没有后缀时不变", () => {
    expect(normalizeCompactToolLabel("Read file")).toBe("Read file");
  });
  it("trim 前后空格", () => {
    expect(normalizeCompactToolLabel("  Read file  ")).toBe("Read file");
  });
  it("空字符串 → 空", () => {
    expect(normalizeCompactToolLabel("")).toBe("");
  });
});

// =============================================================================
// 2. deriveReadableToolTitle
// =============================================================================

describe("deriveReadableToolTitle", () => {
  it("有具体 title → 用 title", () => {
    expect(
      deriveReadableToolTitle({ title: "Read foo.ts", fallbackLabel: "tool call" }),
    ).toBe("Read foo.ts");
  });

  it("title 为 generic 'tool' → 用 requestKind label", () => {
    expect(
      deriveReadableToolTitle({
        title: "tool",
        fallbackLabel: "tool call",
        requestKind: "file-read",
      }),
    ).toBe("Read");
  });

  it("title 为 'tool call' → 用 itemType label", () => {
    expect(
      deriveReadableToolTitle({
        title: "tool call",
        fallbackLabel: "tool call",
        itemType: "web_search",
      }),
    ).toBe("Searched the web");
  });

  it("commandLike + 有 command → 用 command verb", () => {
    expect(
      deriveReadableToolTitle({
        title: "command run",
        fallbackLabel: "fallback",
        command: "ls -la /tmp",
        itemType: "command_execution",
      }),
    ).toBe("Listed");
  });

  it("无 requestKind 无 command → 用 fallback", () => {
    expect(
      deriveReadableToolTitle({ title: "tool", fallbackLabel: "Custom Tool" }),
    ).toBe("Custom Tool");
  });

  it("title=null, fallback generic → fallback (generic 不被滤掉)", () => {
    // 实现：title=null → normalizedTitle='' 仍会通过 normalizedFallback 兜底
    // 但 normalizedFallback='tool' 也是 generic，所以返回 normalizedTitle（空字符串被 trim 后非空会返回？查代码）
    // 实际行为：title=null → 走 fallback 路径，返回 fallbackLabel
    expect(deriveReadableToolTitle({ title: null, fallbackLabel: "tool" })).toBe("tool");
  });

  it("title 和 fallback 都为 generic → 返回 normalizedTitle", () => {
    // title='tool call' 是 generic，fallback='subagent task' 也是 generic
    // → 走到最后 normalizedTitle.length > 0 路径
    expect(
      deriveReadableToolTitle({ title: "tool call", fallbackLabel: "subagent task" }),
    ).toBe("tool call");
  });

  it("title='subagent task' generic + requestKind=null + 无 command → fallback", () => {
    expect(
      deriveReadableToolTitle({ title: "subagent task", fallbackLabel: "Agent X" }),
    ).toBe("Agent X");
  });

  it("image_generation itemType → 'Generated image'", () => {
    expect(
      deriveReadableToolTitle({ title: "tool", fallbackLabel: "tool", itemType: "image_generation" }),
    ).toBe("Generated image");
  });

  it("file_change itemType → 'Edited'", () => {
    expect(
      deriveReadableToolTitle({ title: "tool", fallbackLabel: "tool", itemType: "file_change" }),
    ).toBe("Edited");
  });

  it("collab_agent_tool_call → 'Agent task'", () => {
    expect(
      deriveReadableToolTitle({
        title: "tool",
        fallbackLabel: "tool",
        itemType: "collab_agent_tool_call",
      }),
    ).toBe("Agent task");
  });
});

// =============================================================================
// 3. deriveReadableCommandDisplay
// =============================================================================

describe("deriveReadableCommandDisplay", () => {
  it("cat foo.ts → 'Read' + file", () => {
    expect(deriveReadableCommandDisplay("cat foo.ts").verb).toBe("Read");
  });
  it("cat foo.ts isRunning=true → 'Reading'", () => {
    expect(deriveReadableCommandDisplay("cat foo.ts", true).verb).toBe("Reading");
  });
  it("grep 'foo' src/ → 'Searched'", () => {
    expect(deriveReadableCommandDisplay("grep 'foo' src/").verb).toBe("Searched");
  });
  it("rg pattern path → 'Searched'", () => {
    expect(deriveReadableCommandDisplay("rg pattern path").verb).toBe("Searched");
  });
  it("ls /tmp → 'Listed'", () => {
    expect(deriveReadableCommandDisplay("ls /tmp").verb).toBe("Listed");
  });
  it("find . -name '*.ts' → 'Found'", () => {
    expect(deriveReadableCommandDisplay("find . -name '*.ts'").verb).toBe("Found");
  });
  it("fd pattern → 'Found'", () => {
    expect(deriveReadableCommandDisplay("fd pattern").verb).toBe("Found");
  });
  it("mkdir new-dir → 'Created'", () => {
    expect(deriveReadableCommandDisplay("mkdir new-dir").verb).toBe("Created");
  });
  it("rm file → 'Removed'", () => {
    expect(deriveReadableCommandDisplay("rm file").verb).toBe("Removed");
  });
  it("cp src dst → 'Copied'", () => {
    expect(deriveReadableCommandDisplay("cp src dst").verb).toBe("Copied");
  });
  it("cp src dst isRunning=true → 'Copying'", () => {
    expect(deriveReadableCommandDisplay("cp src dst", true).verb).toBe("Copying");
  });
  it("mv src dst → 'Moved'", () => {
    expect(deriveReadableCommandDisplay("mv src dst").verb).toBe("Moved");
  });
  it("git status → 'Ran' (delegated to humanizeGitCommand)", () => {
    const r = deriveReadableCommandDisplay("git status");
    expect(r.fullCommand).toBe("git status");
    expect(r.verb).toBeTruthy();
  });
  it("git commit -m 'msg' → 'Committed'", () => {
    expect(deriveReadableCommandDisplay("git commit -m 'msg'").verb).toBe("Committed");
  });
  it("unknown command → 'Ran' + full command", () => {
    expect(deriveReadableCommandDisplay("custom-tool --foo").verb).toBe("Ran");
  });
  it("fullCommand 保留原样", () => {
    expect(deriveReadableCommandDisplay("cat foo.ts").fullCommand).toBe("cat foo.ts");
  });
});

// =============================================================================
// 4. deriveInlineCommandCall
// =============================================================================

describe("deriveInlineCommandCall", () => {
  it("原样返回非 shell wrapper", () => {
    expect(deriveInlineCommandCall("ls -la")).toBe("ls -la");
  });
  it("解 sh -c wrapper", () => {
    expect(deriveInlineCommandCall("sh -c 'echo hello'")).toBe("echo hello");
  });
  it("解 bash -c wrapper", () => {
    expect(deriveInlineCommandCall("bash -c 'pwd'")).toBe("pwd");
  });
  it("解 zsh -c wrapper", () => {
    expect(deriveInlineCommandCall("zsh -c 'ls'")).toBe("ls");
  });
});
