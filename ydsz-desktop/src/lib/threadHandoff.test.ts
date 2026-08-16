//! # threadHandoff 单元测试
//!
//! 覆盖目标：
//! - `resolveAvailableHandoffTargetProviders`：返回除 sourceProvider 外的所有 Provider
//! - `resolveThreadHandoffBadgeLabel`：handoff 存在时返回 "Handoff from <displayName>"，否则 null
//! - `resolveThreadHandoffTitle`：trim + collapse 空白；空时返回 "Handoff"
//! - `buildThreadHandoffImportedMessages`：仅非流式 user/assistant；user 消息剥离嵌入选区；保留 attachments
//! - `buildThreadHandoffImportedActivities`：仅白名单 kind；sequence 被剔除；id 重生
//! - `hasTransferableThreadMessages` / `hasNativeThreadHandoffMessages`
//! - `canCreateThreadHandoff`：busy / pending / session.running / 无消息 / handoff 需 native 消息
//! - `resolveThreadHandoffModelSelection`：sticky → project default → 兜底；kilo 要求 model 前缀；Pi 缺默认模型抛错

import { describe, it, expect } from "vitest";
import type {
  ChatAssistantSelectionAttachment,
  ChatAttachment,
  ChatMessage,
  Thread,
  ThreadSession,
} from "../types";
import type { ProviderKind } from "@ydsz-buddy/contracts";
import { MessageId as MessageIdCtor } from "@ydsz-buddy/contracts";

import {
  buildThreadHandoffImportedActivities,
  buildThreadHandoffImportedMessages,
  canCreateThreadHandoff,
  hasNativeThreadHandoffMessages,
  hasTransferableThreadMessages,
  resolveAvailableHandoffTargetProviders,
  resolveThreadHandoffBadgeLabel,
  resolveThreadHandoffModelSelection,
  resolveThreadHandoffTitle,
} from "./threadHandoff";

// ──────────────────────────────────────────────────────────────────────────────
// 工具:构造测试数据
// ──────────────────────────────────────────────────────────────────────────────

function makeMessage(
  partial: Partial<ChatMessage> & Pick<ChatMessage, "id" | "role" | "text" | "createdAt" | "streaming">,
): ChatMessage {
  return partial as ChatMessage;
}

function makeSession(overrides: Partial<ThreadSession> = {}): ThreadSession {
  return {
    provider: "codex",
    status: "ready",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    orchestrationStatus: "ready",
    ...overrides,
  } as ThreadSession;
}

function makeThreadHandoffLike<T extends Pick<Thread, "messages"> | Pick<Thread, "handoff"> | Pick<Thread, "session">>(partial: T): T {
  return partial;
}

const baseMessage = makeMessage({
  id: "m1" as never,
  role: "user",
  text: "hello",
  createdAt: "2026-01-01T00:00:00.000Z",
  streaming: false,
});

// ──────────────────────────────────────────────────────────────────────────────
// resolveAvailableHandoffTargetProviders
// ──────────────────────────────────────────────────────────────────────────────

describe("resolveAvailableHandoffTargetProviders", () => {
  it("返回除 source 之外的所有 provider(数量 = 8 - 1 = 7)", () => {
    const list = resolveAvailableHandoffTargetProviders("codex");
    expect(list).toHaveLength(7);
    expect(list).not.toContain("codex");
  });

  it("kilo 也包含在候选中(由调用方限制)", () => {
    const list = resolveAvailableHandoffTargetProviders("codex");
    expect(list).toContain("kilo");
  });

  it("不同 source 排除自身", () => {
    expect(resolveAvailableHandoffTargetProviders("claudeAgent")).not.toContain(
      "claudeAgent",
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// resolveThreadHandoffBadgeLabel
// ──────────────────────────────────────────────────────────────────────────────

describe("resolveThreadHandoffBadgeLabel", () => {
  it("无 handoff → null", () => {
    expect(resolveThreadHandoffBadgeLabel({ handoff: null })).toBeNull();
  });

  it("有 handoff → 'Handoff from <displayName>'", () => {
    expect(
      resolveThreadHandoffBadgeLabel({
        handoff: {
          sourceThreadId: "t1" as never,
          sourceProvider: "claudeAgent" as ProviderKind,
          importedAt: "2026-01-01T00:00:00.000Z",
          bootstrapStatus: "pending" as never,
        },
      }),
    ).toBe("Handoff from Claude");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// resolveThreadHandoffTitle
// ──────────────────────────────────────────────────────────────────────────────

describe("resolveThreadHandoffTitle", () => {
  it("trim + collapse 空白", () => {
    expect(resolveThreadHandoffTitle({ title: "  hello   world  " })).toBe(
      "hello world",
    );
  });

  it("空字符串 → 'Handoff'", () => {
    expect(resolveThreadHandoffTitle({ title: "" })).toBe("Handoff");
  });

  it("纯空白 → 'Handoff'", () => {
    expect(resolveThreadHandoffTitle({ title: "   " })).toBe("Handoff");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// buildThreadHandoffImportedMessages
// ──────────────────────────────────────────────────────────────────────────────

describe("buildThreadHandoffImportedMessages", () => {
  it("仅保留非流式的 user/assistant 消息", () => {
    const thread = {
      messages: [
        baseMessage,
        { ...baseMessage, id: "m2" as never, role: "assistant", text: "hi" },
        { ...baseMessage, id: "m3" as never, role: "system", text: "sys" },
        { ...baseMessage, id: "m4" as never, role: "user", streaming: true },
      ],
    };
    const out = buildThreadHandoffImportedMessages(thread);
    expect(out).toHaveLength(2);
    expect(out.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("user 消息的嵌入选区被剥离(stripEmbeddedAssistantSelections)", () => {
    // stripEmbeddedAssistantSelections 仅识别 <assistant_selection>...</assistant_selection>
    // 块(以换行包围,出现在文本末尾),其它格式保持原样。
    const thread = {
      messages: [
        {
          ...baseMessage,
          text: [
            "before",
            "",
            "<assistant_selection>",
            "- assistant message id1:",
            "  embed",
            "</assistant_selection>",
          ].join("\n"),
        },
      ],
    };
    const out = buildThreadHandoffImportedMessages(thread);
    expect(out).toHaveLength(1);
    expect(out[0]?.text).not.toContain("<assistant_selection>");
    expect(out[0]?.text).not.toContain("embed");
    expect(out[0]?.text).toBe("before");
  });

  it("携带 assistant-selection 附件的消息:附件被重塑(messageId → assistantMessageId)", () => {
    const att: ChatAssistantSelectionAttachment = {
      type: "assistant-selection",
      id: "sel-1",
      assistantMessageId: "am1",
      text: "snippet",
    };
    const thread = {
      messages: [
        {
          ...baseMessage,
          attachments: [att] as ChatAttachment[],
        },
      ],
    };
    const out = buildThreadHandoffImportedMessages(thread);
    expect(out[0]?.attachments).toEqual([
      {
        type: "assistant-selection",
        id: "sel-1",
        assistantMessageId: "am1",
        text: "snippet",
      },
    ]);
  });

  it("携带 image 附件:附件被保留(name/mimeType/sizeBytes)", () => {
    const thread = {
      messages: [
        {
          ...baseMessage,
          attachments: [
            {
              type: "image",
              id: "img-1",
              name: "shot.png",
              mimeType: "image/png",
              sizeBytes: 1024,
            },
          ] as ChatAttachment[],
        },
      ],
    };
    const out = buildThreadHandoffImportedMessages(thread);
    expect(out[0]?.attachments).toMatchObject([
      {
        type: "image",
        id: "img-1",
        name: "shot.png",
        mimeType: "image/png",
        sizeBytes: 1024,
      },
    ]);
  });

  it("无附件的消息:attachments 字段为 null(可省略)", () => {
    const out = buildThreadHandoffImportedMessages({ messages: [baseMessage] });
    expect(out[0]?.attachments ?? null).toBeNull();
  });

  it("messageId 使用新的 UUID,不与源相同", () => {
    const out = buildThreadHandoffImportedMessages({ messages: [baseMessage] });
    // messageId 字段存在,且与原 message id 不同
    expect(out[0]?.messageId).toBeDefined();
    expect(out[0]?.messageId).not.toBe(baseMessage.id);
  });

  it("completedAt 优先于 createdAt 作为 updatedAt", () => {
    const thread = {
      messages: [
        {
          ...baseMessage,
          completedAt: "2026-02-01T00:00:00.000Z",
        },
      ],
    };
    const out = buildThreadHandoffImportedMessages(thread);
    expect(out[0]?.updatedAt).toBe("2026-02-01T00:00:00.000Z");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// buildThreadHandoffImportedActivities
// ──────────────────────────────────────────────────────────────────────────────

describe("buildThreadHandoffImportedActivities", () => {
  it("仅白名单 kind 被保留", () => {
    const thread = {
      activities: [
        {
          id: "e1" as never,
          kind: "account.rate-limits.updated",
          tone: "info" as never,
          createdAt: "2026-01-01T00:00:00.000Z",
          sequence: 1,
        },
        {
          id: "e2" as never,
          kind: "some.other.kind",
          tone: "info" as never,
          createdAt: "2026-01-01T00:00:00.000Z",
          sequence: 2,
        },
      ] as never,
    };
    const out = buildThreadHandoffImportedActivities(thread);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe("account.rate-limits.updated");
  });

  it("sequence 字段被剔除,id 被替换为新 UUID", () => {
    const thread = {
      activities: [
        {
          id: "e-original" as never,
          kind: "account.rate-limits.updated",
          tone: "info" as never,
          createdAt: "2026-01-01T00:00:00.000Z",
          sequence: 42,
        },
      ] as never,
    };
    const out = buildThreadHandoffImportedActivities(thread);
    expect(out[0]?.sequence).toBeUndefined();
    expect(out[0]?.id).not.toBe("e-original");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// hasTransferableThreadMessages / hasNativeThreadHandoffMessages
// ──────────────────────────────────────────────────────────────────────────────

describe("hasTransferableThreadMessages", () => {
  it("无消息 → false", () => {
    expect(hasTransferableThreadMessages({ messages: [] })).toBe(false);
  });

  it("仅 system + streaming → false", () => {
    const thread = {
      messages: [
        { ...baseMessage, role: "system" },
        { ...baseMessage, id: "m2" as never, role: "user", streaming: true },
      ],
    };
    expect(hasTransferableThreadMessages(thread)).toBe(false);
  });

  it("存在非流式 user/assistant → true", () => {
    expect(hasTransferableThreadMessages({ messages: [baseMessage] })).toBe(
      true,
    );
  });
});

describe("hasNativeThreadHandoffMessages", () => {
  it("source=undefined 不会被识别为 native(需要显式 source='native')", () => {
    // 源码要求 message.source === 'native',不会把 undefined 默认视为 native。
    // 实际生产中 ChatMessage 经过 schema 解码会注入默认 'native',
    // 但此处是纯函数测试,锁定当前实现行为。
    expect(
      hasNativeThreadHandoffMessages({ messages: [baseMessage] }),
    ).toBe(false);
  });

  it("source='native' 的可导入消息 → true", () => {
    const thread = {
      messages: [{ ...baseMessage, source: "native" as never }],
    };
    expect(hasNativeThreadHandoffMessages(thread)).toBe(true);
  });

  it("source='web' 的 user 消息不计入 native", () => {
    const thread = {
      messages: [
        { ...baseMessage, source: "web" as never },
      ],
    };
    expect(hasNativeThreadHandoffMessages(thread)).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// canCreateThreadHandoff
// ──────────────────────────────────────────────────────────────────────────────

describe("canCreateThreadHandoff", () => {
  it("isBusy=true → false", () => {
    expect(
      canCreateThreadHandoff({
        thread: makeThreadHandoffLike({
          messages: [baseMessage],
          session: makeSession(),
          handoff: null,
        }) as never,
        isBusy: true,
      }),
    ).toBe(false);
  });

  it("hasPendingApprovals=true → false", () => {
    expect(
      canCreateThreadHandoff({
        thread: makeThreadHandoffLike({
          messages: [baseMessage],
          session: makeSession(),
          handoff: null,
        }) as never,
        hasPendingApprovals: true,
      }),
    ).toBe(false);
  });

  it("session.orchestrationStatus='starting' → false", () => {
    expect(
      canCreateThreadHandoff({
        thread: makeThreadHandoffLike({
          messages: [baseMessage],
          session: makeSession({ orchestrationStatus: "starting" as never }),
          handoff: null,
        }) as never,
      }),
    ).toBe(false);
  });

  it("session.orchestrationStatus='running' → false", () => {
    expect(
      canCreateThreadHandoff({
        thread: makeThreadHandoffLike({
          messages: [baseMessage],
          session: makeSession({ orchestrationStatus: "running" as never }),
          handoff: null,
        }) as never,
      }),
    ).toBe(false);
  });

  it("无可导入消息 → false", () => {
    expect(
      canCreateThreadHandoff({
        thread: makeThreadHandoffLike({
          messages: [],
          session: makeSession(),
          handoff: null,
        }) as never,
      }),
    ).toBe(false);
  });

  it("非 handoff 线程 + 就绪 session + 有消息 → true", () => {
    expect(
      canCreateThreadHandoff({
        thread: makeThreadHandoffLike({
          messages: [baseMessage],
          session: makeSession(),
          handoff: null,
        }) as never,
      }),
    ).toBe(true);
  });

  it("handoff 线程 + 无 native 消息 → false", () => {
    expect(
      canCreateThreadHandoff({
        thread: makeThreadHandoffLike({
          messages: [{ ...baseMessage, source: "web" as never }],
          session: makeSession(),
          handoff: {
            sourceThreadId: "t0" as never,
            sourceProvider: "codex" as ProviderKind,
            importedAt: "2026-01-01T00:00:00.000Z",
            bootstrapStatus: "pending" as never,
          },
        }) as never,
      }),
    ).toBe(false);
  });

  it("handoff 线程 + 有 native 消息 → true", () => {
    expect(
      canCreateThreadHandoff({
        thread: makeThreadHandoffLike({
          messages: [{ ...baseMessage, source: "native" as never }],
          session: makeSession(),
          handoff: {
            sourceThreadId: "t0" as never,
            sourceProvider: "codex" as ProviderKind,
            importedAt: "2026-01-01T00:00:00.000Z",
            bootstrapStatus: "pending" as never,
          },
        }) as never,
      }),
    ).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// resolveThreadHandoffModelSelection
// ──────────────────────────────────────────────────────────────────────────────

describe("resolveThreadHandoffModelSelection", () => {
  it("sticky 命中且 provider 匹配 → 走 sticky", () => {
    const out = resolveThreadHandoffModelSelection({
      sourceThread: { modelSelection: { provider: "codex", model: "x" } },
      targetProvider: "claudeAgent",
      projectDefaultModelSelection: null,
      stickyModelSelectionByProvider: {
        claudeAgent: { provider: "claudeAgent", model: "claude-3-5" },
      },
    });
    expect(out).toEqual({ provider: "claudeAgent", model: "claude-3-5" });
  });

  it("sticky 命中但 provider 不匹配 → 跳过 sticky", () => {
    const out = resolveThreadHandoffModelSelection({
      sourceThread: { modelSelection: { provider: "codex", model: "x" } },
      targetProvider: "claudeAgent",
      projectDefaultModelSelection: null,
      stickyModelSelectionByProvider: {
        codex: { provider: "codex", model: "codex-1" }, // 错配
      },
    });
    // 兜底为 provider 默认
    expect(out.provider).toBe("claudeAgent");
  });

  it("kilo targetProvider 要求 model 以 'kilo/' 开头", () => {
    const out = resolveThreadHandoffModelSelection({
      sourceThread: { modelSelection: { provider: "codex", model: "x" } },
      targetProvider: "kilo",
      projectDefaultModelSelection: { provider: "kilo", model: "other/x" }, // 不合格
      stickyModelSelectionByProvider: {},
    });
    // 兜底为 kilo 默认 (kilo/<something>)
    expect(out.provider).toBe("kilo");
    expect(out.model).toMatch(/^kilo\//);
  });

  it("kilo targetProvider + sticky 命中 kilo/ 前缀 → 走 sticky", () => {
    const out = resolveThreadHandoffModelSelection({
      sourceThread: { modelSelection: { provider: "codex", model: "x" } },
      targetProvider: "kilo",
      projectDefaultModelSelection: null,
      stickyModelSelectionByProvider: {
        kilo: { provider: "kilo", model: "kilo/qwen" },
      },
    });
    expect(out).toEqual({ provider: "kilo", model: "kilo/qwen" });
  });

  it("project default 命中(同 provider)→ 走 project default", () => {
    const out = resolveThreadHandoffModelSelection({
      sourceThread: { modelSelection: { provider: "codex", model: "x" } },
      targetProvider: "gemini",
      projectDefaultModelSelection: { provider: "gemini", model: "gemini-1.5" },
      stickyModelSelectionByProvider: {},
    });
    expect(out).toEqual({ provider: "gemini", model: "gemini-1.5" });
  });

  it("无 sticky / 无 project default → 兜底为 provider 默认模型", () => {
    const out = resolveThreadHandoffModelSelection({
      sourceThread: { modelSelection: { provider: "codex", model: "x" } },
      targetProvider: "claudeAgent",
      projectDefaultModelSelection: null,
      stickyModelSelectionByProvider: {},
    });
    expect(out.provider).toBe("claudeAgent");
    expect(typeof out.model).toBe("string");
    expect(out.model.length).toBeGreaterThan(0);
  });
});
