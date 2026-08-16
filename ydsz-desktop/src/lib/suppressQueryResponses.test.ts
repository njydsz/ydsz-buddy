/**
 * @file suppressQueryResponses 单元测试
 *
 * 覆盖终端查询响应抑制的注册与清理。
 */

import { describe, expect, it, vi } from "vitest";

import { suppressQueryResponses } from "./suppressQueryResponses";

interface FakeDisposable {
  disposed: boolean;
  dispose: () => void;
}

interface FakeParser {
  handlers: Array<{ spec: unknown; handler: () => boolean }>;
  registerCsiHandler: (spec: unknown, handler: () => boolean) => FakeDisposable;
}

function makeFakeTerminal() {
  const disposables: FakeDisposable[] = [];
  const parser: FakeParser = {
    handlers: [],
    registerCsiHandler: vi.fn((spec: unknown, handler: () => boolean) => {
      parser.handlers.push({ spec, handler });
      const disposable: FakeDisposable = {
        disposed: false,
        dispose: () => {
          disposable.disposed = true;
        },
      };
      disposables.push(disposable);
      return disposable;
    }),
  };
  return { terminal: { parser }, disposables, parser };
}

describe("suppressQueryResponses", () => {
  it("注册 4 个 CSI handler(CSI R / I / O / $y)", () => {
    const { terminal, parser } = makeFakeTerminal();
    suppressQueryResponses(terminal as never);
    expect(parser.registerCsiHandler).toHaveBeenCalledTimes(4);
    // 所有 handler 返回 true (consumed)
    for (const { handler } of parser.handlers) {
      expect(handler()).toBe(true);
    }
  });

  it("返回的清理函数释放所有 disposable", () => {
    const { terminal, disposables } = makeFakeTerminal();
    const cleanup = suppressQueryResponses(terminal as never);
    expect(disposables.every((d) => !d.disposed)).toBe(true);
    cleanup();
    expect(disposables.every((d) => d.disposed)).toBe(true);
  });

  it("handler 规格符合预期", () => {
    const { terminal, parser } = makeFakeTerminal();
    suppressQueryResponses(terminal as never);
    expect(parser.handlers[0].spec).toEqual({ final: "R" });
    expect(parser.handlers[1].spec).toEqual({ final: "I" });
    expect(parser.handlers[2].spec).toEqual({ final: "O" });
    expect(parser.handlers[3].spec).toEqual({ intermediates: "$", final: "y" });
  });
});
