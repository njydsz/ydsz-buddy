//! # disposableThread 单元测试
//!
//! 覆盖 `resolveDisposableThreadIdToDispose` 的核心决策逻辑:
//! - 无 previousThreadId → null
//! - previous === next → null
//! - non-temporary 旧线程 → null
//! - temporary 旧线程 → 返回旧线程 ID

import { describe, it, expect } from "vitest";
import type { ThreadId } from "@ydsz-buddy/contracts";

import { resolveDisposableThreadIdToDispose } from "./disposableThread";

const tid = (id: string) => id as ThreadId;

describe("resolveDisposableThreadIdToDispose", () => {
  it("previousThreadId 为 null → 返回 null", () => {
    expect(
      resolveDisposableThreadIdToDispose({
        previousThreadId: null,
        nextThreadId: tid("t1"),
        previousThreadWasTemporary: true,
        draftThreadsByThreadId: {},
      }),
    ).toBeNull();
  });

  it("previousThreadId === nextThreadId → 返回 null(同一线程,不清理)", () => {
    expect(
      resolveDisposableThreadIdToDispose({
        previousThreadId: tid("t1"),
        nextThreadId: tid("t1"),
        previousThreadWasTemporary: true,
        draftThreadsByThreadId: {},
      }),
    ).toBeNull();
  });

  it("previousThreadId 非临时 + draft 也非临时 → null", () => {
    expect(
      resolveDisposableThreadIdToDispose({
        previousThreadId: tid("t1"),
        nextThreadId: tid("t2"),
        previousThreadWasTemporary: false,
        draftThreadsByThreadId: {
          t1: { isTemporary: false, /* 其他字段为占位 */ } as never,
        },
      }),
    ).toBeNull();
  });

  it("previousThreadWasTemporary=true → 返回 previousThreadId", () => {
    expect(
      resolveDisposableThreadIdToDispose({
        previousThreadId: tid("t1"),
        nextThreadId: tid("t2"),
        previousThreadWasTemporary: true,
        draftThreadsByThreadId: {},
      }),
    ).toBe(tid("t1"));
  });

  it("draftThreadsByThreadId[previous].isTemporary=true → 返回 previousThreadId", () => {
    expect(
      resolveDisposableThreadIdToDispose({
        previousThreadId: tid("t1"),
        nextThreadId: tid("t2"),
        previousThreadWasTemporary: false,
        draftThreadsByThreadId: {
          t1: { isTemporary: true } as never,
        },
      }),
    ).toBe(tid("t1"));
  });

  it("previousThreadWasTemporary 未传 + draft 非临时 → null", () => {
    expect(
      resolveDisposableThreadIdToDispose({
        previousThreadId: tid("t1"),
        nextThreadId: tid("t2"),
        draftThreadsByThreadId: {},
      }),
    ).toBeNull();
  });

  it("previousThreadWasTemporary 未传 + draft 是临时 → 返回 previousThreadId", () => {
    expect(
      resolveDisposableThreadIdToDispose({
        previousThreadId: tid("t1"),
        nextThreadId: tid("t2"),
        draftThreadsByThreadId: {
          t1: { isTemporary: true } as never,
        },
      }),
    ).toBe(tid("t1"));
  });

  it("nextThreadId 为 null(切到无线程态)+ 旧线程是临时 → 返回 previousThreadId", () => {
    expect(
      resolveDisposableThreadIdToDispose({
        previousThreadId: tid("t1"),
        nextThreadId: null,
        previousThreadWasTemporary: true,
        draftThreadsByThreadId: {},
      }),
    ).toBe(tid("t1"));
  });
});
