/**
 * @file subagentPresentation 单元测试
 *
 * 覆盖子代理展示归一化函数：
 * 1. subagentAccentColor - 哈希 → 调色板
 * 2. resolveSubagentPresentation - 主标签/昵称/角色/标题的优先级
 * 3. resolveSubagentPresentationForThread - 线程对象 + 父线程身份目录
 * 4. normalizeSubagentStatusKind - 状态字符串归一化
 * 5. humanizeSubagentStatus - 状态 → 人可读标签
 * 6. formatSubagentModelLabel - 模型显示名称
 */

import { describe, expect, it } from "vitest";

import {
  formatSubagentModelLabel,
  humanizeSubagentStatus,
  normalizeSubagentStatusKind,
  resolveSubagentPresentation,
  resolveSubagentPresentationForThread,
  subagentAccentColor,
  type SubagentStatusKind,
} from "./subagentPresentation";

describe("subagentPresentation", () => {
  describe("subagentAccentColor", () => {
    it("相同种子返回相同颜色", () => {
      expect(subagentAccentColor("alpha")).toBe(subagentAccentColor("alpha"));
    });

    it("null / undefined 使用默认 'subagent' 种子", () => {
      expect(subagentAccentColor(null)).toBe(subagentAccentColor(undefined));
      expect(subagentAccentColor(null)).toBe(subagentAccentColor("subagent"));
    });

    it("大写/小写不区分", () => {
      expect(subagentAccentColor("Alpha")).toBe(subagentAccentColor("alpha"));
    });

    it("返回调色板中的颜色", () => {
      const palette = [
        "#b84e44",
        "#2f7a5d",
        "#345fa8",
        "#a86834",
        "#7352a8",
        "#2f7480",
        "#a84d71",
        "#6a8531",
      ];
      for (const seed of ["a", "b", "c", "long-name", "xyz", "abc-def", "foo bar", "z"]) {
        expect(palette).toContain(subagentAccentColor(seed));
      }
    });

    it("纯空白种子被视为 'subagent'", () => {
      expect(subagentAccentColor("   ")).toBe(subagentAccentColor("subagent"));
    });
  });

  describe("resolveSubagentPresentation", () => {
    it("全部缺失时返回 fallbackId 的 basename", () => {
      const result = resolveSubagentPresentation({
        fallbackId: "thread-1",
      });
      expect(result.primaryLabel).toBe("thread-1");
      expect(result.nickname).toBeNull();
      expect(result.role).toBeNull();
    });

    it("显式 nickname 优先于 fallbackId", () => {
      const result = resolveSubagentPresentation({
        nickname: "alpha",
        fallbackId: "thread-1",
      });
      expect(result.primaryLabel).toBe("alpha");
      expect(result.nickname).toBe("alpha");
    });

    it("显式 role 单独存在时使用首字母大写", () => {
      const result = resolveSubagentPresentation({
        role: "researcher",
        fallbackId: "thread-1",
      });
      expect(result.primaryLabel).toBe("Researcher");
      expect(result.role).toBe("researcher");
    });

    it("role 缺失显式时通过 title 解析 'nickname [role]'", () => {
      const result = resolveSubagentPresentation({
        title: "alpha [researcher]",
        fallbackId: "thread-1",
      });
      expect(result.nickname).toBe("alpha");
      expect(result.role).toBe("researcher");
      expect(result.fullLabel).toBe("alpha [researcher]");
    });

    it("title 仅为通用词时被忽略", () => {
      const result = resolveSubagentPresentation({
        title: "subagent",
        fallbackId: "thread-1",
      });
      expect(result.title).toBeNull();
      expect(result.primaryLabel).toBe("thread-1");
    });

    it("title 'new thread' 视为通用", () => {
      const result = resolveSubagentPresentation({
        title: "new thread",
        fallbackId: "thread-1",
      });
      expect(result.title).toBeNull();
    });

    it("title 是非通用且无 [role] 时作为 title", () => {
      const result = resolveSubagentPresentation({
        title: "Build pipeline",
        fallbackId: "thread-1",
      });
      expect(result.title).toBe("Build pipeline");
      expect(result.primaryLabel).toBe("Build pipeline");
    });

    it("nickname 已解析时不再使用 title 文本", () => {
      const result = resolveSubagentPresentation({
        title: "Build pipeline [researcher]",
        fallbackId: "thread-1",
      });
      expect(result.nickname).toBe("Build pipeline");
      expect(result.role).toBe("researcher");
      expect(result.title).toBeNull();
      expect(result.primaryLabel).toBe("Build pipeline");
    });

    it("fallbackId 是 subagent:xxx 形式时取最后段", () => {
      const result = resolveSubagentPresentation({
        fallbackId: "subagent:parent:child-1",
      });
      expect(result.primaryLabel).toBe("child-1");
    });

    it("fallbackId 是路径时取 basename", () => {
      const result = resolveSubagentPresentation({
        fallbackId: "/threads/sub-1/agent-2",
      });
      expect(result.primaryLabel).toBe("agent-2");
    });

    it("全 fallback 缺失时返回 'Subagent'", () => {
      const result = resolveSubagentPresentation({});
      expect(result.primaryLabel).toBe("Subagent");
    });

    it("accentColor 与 nickname 关联", () => {
      const result = resolveSubagentPresentation({ nickname: "alpha" });
      expect(result.accentColor).toBe(subagentAccentColor("alpha"));
    });
  });

  describe("resolveSubagentPresentationForThread", () => {
    it("无 threads 时只使用 thread 自有字段", () => {
      const result = resolveSubagentPresentationForThread({
        thread: {
          id: "thread-1",
          title: null,
          parentThreadId: null,
          subagentAgentId: null,
          subagentNickname: "alpha",
          subagentRole: "researcher",
        },
      });
      expect(result.nickname).toBe("alpha");
      expect(result.role).toBe("researcher");
    });

    it("thread 缺 nickname/role 时从父线程活动目录补充", () => {
      const result = resolveSubagentPresentationForThread({
        thread: {
          id: "sub-thread-1",
          title: null,
          parentThreadId: "parent-thread",
          subagentAgentId: "agent-1",
          subagentNickname: null,
          subagentRole: null,
        },
        threads: [
          {
            id: "parent-thread",
            activities: [
              {
                payload: {
                  data: {
                    item: {
                      threadId: "sub-thread-1",
                      agentId: "agent-1",
                      nickname: "alpha",
                      agentRole: "researcher",
                    },
                  },
                },
              },
            ],
          },
        ],
      });
      expect(result.nickname).toBe("alpha");
      expect(result.role).toBe("researcher");
    });

    it("父线程含 subagent:parentThread: 前缀时 prefix 被剥离", () => {
      const result = resolveSubagentPresentationForThread({
        thread: {
          id: "subagent:parent-thread:sub-1",
          title: null,
          parentThreadId: "parent-thread",
          subagentAgentId: "agent-1",
          subagentNickname: null,
          subagentRole: null,
        },
        threads: [
          {
            id: "parent-thread",
            activities: [
              {
                payload: {
                  data: {
                    item: {
                      providerThreadId: "sub-1",
                      agentId: "agent-1",
                      nickname: "alpha",
                      role: "researcher",
                    },
                  },
                },
              },
            ],
          },
        ],
      });
      expect(result.nickname).toBe("alpha");
    });

    it("父线程缺失时 derived identity 为 null", () => {
      const result = resolveSubagentPresentationForThread({
        thread: {
          id: "sub-1",
          title: null,
          parentThreadId: "missing-parent",
          subagentAgentId: "agent-1",
          subagentNickname: null,
          subagentRole: null,
        },
        threads: [],
      });
      expect(result.primaryLabel).toBe("sub-1");
    });

    it("thread 显式 nickname 覆盖父目录", () => {
      const result = resolveSubagentPresentationForThread({
        thread: {
          id: "sub-1",
          title: null,
          parentThreadId: "parent-thread",
          subagentAgentId: "agent-1",
          subagentNickname: "explicit",
          subagentRole: "researcher",
        },
        threads: [
          {
            id: "parent-thread",
            activities: [
              {
                payload: {
                  data: {
                    item: {
                      threadId: "sub-1",
                      agentId: "agent-1",
                      nickname: "from-directory",
                      agentRole: "ignored",
                    },
                  },
                },
              },
            ],
          },
        ],
      });
      expect(result.nickname).toBe("explicit");
    });
  });

  describe("normalizeSubagentStatusKind", () => {
    it("isActive=true 强制返回 running", () => {
      expect(normalizeSubagentStatusKind("completed", true)).toBe("running");
      expect(normalizeSubagentStatusKind(null, true)).toBe("running");
    });

    it("null / undefined / unknown 返回 null", () => {
      expect(normalizeSubagentStatusKind(null)).toBeNull();
      expect(normalizeSubagentStatusKind(undefined)).toBeNull();
      expect(normalizeSubagentStatusKind("")).toBeNull();
      expect(normalizeSubagentStatusKind("unknown")).toBeNull();
    });

    it("识别 running 变体", () => {
      const expected: SubagentStatusKind = "running";
      expect(normalizeSubagentStatusKind("running")).toBe(expected);
      expect(normalizeSubagentStatusKind("RUNNING")).toBe(expected);
      expect(normalizeSubagentStatusKind("working")).toBe(expected);
      expect(normalizeSubagentStatusKind("in_progress")).toBe(expected);
      expect(normalizeSubagentStatusKind("in-progress")).toBe(expected);
      expect(normalizeSubagentStatusKind("in progress")).toBe(expected);
      expect(normalizeSubagentStatusKind("active")).toBe(expected);
    });

    it("识别 completed 变体", () => {
      const expected: SubagentStatusKind = "completed";
      expect(normalizeSubagentStatusKind("completed")).toBe(expected);
      expect(normalizeSubagentStatusKind("done")).toBe(expected);
      expect(normalizeSubagentStatusKind("finished")).toBe(expected);
      expect(normalizeSubagentStatusKind("success")).toBe(expected);
      expect(normalizeSubagentStatusKind("succeeded")).toBe(expected);
    });

    it("识别 failed 变体", () => {
      const expected: SubagentStatusKind = "failed";
      expect(normalizeSubagentStatusKind("failed")).toBe(expected);
      expect(normalizeSubagentStatusKind("error")).toBe(expected);
      expect(normalizeSubagentStatusKind("errored")).toBe(expected);
      expect(normalizeSubagentStatusKind("failure")).toBe(expected);
    });

    it("识别 stopped 变体", () => {
      const expected: SubagentStatusKind = "stopped";
      expect(normalizeSubagentStatusKind("stopped")).toBe(expected);
      expect(normalizeSubagentStatusKind("cancelled")).toBe(expected);
      expect(normalizeSubagentStatusKind("canceled")).toBe(expected);
      expect(normalizeSubagentStatusKind("interrupted")).toBe(expected);
      expect(normalizeSubagentStatusKind("aborted")).toBe(expected);
    });

    it("识别 queued 变体", () => {
      const expected: SubagentStatusKind = "queued";
      expect(normalizeSubagentStatusKind("queued")).toBe(expected);
      expect(normalizeSubagentStatusKind("pending")).toBe(expected);
      expect(normalizeSubagentStatusKind("waiting")).toBe(expected);
      expect(normalizeSubagentStatusKind("starting")).toBe(expected);
    });

    it("识别 idle", () => {
      expect(normalizeSubagentStatusKind("idle")).toBe<SubagentStatusKind>("idle");
    });

    it("下划线 / 短横线归一化", () => {
      expect(normalizeSubagentStatusKind("in_progress")).toBe("running");
      expect(normalizeSubagentStatusKind("in-progress")).toBe("running");
    });

    it("未识别状态返回 null", () => {
      expect(normalizeSubagentStatusKind("random")).toBeNull();
    });
  });

  describe("humanizeSubagentStatus", () => {
    it("返回各状态的人可读标签", () => {
      expect(humanizeSubagentStatus("running")).toBe("Running");
      expect(humanizeSubagentStatus("completed")).toBe("Completed");
      expect(humanizeSubagentStatus("failed")).toBe("Failed");
      expect(humanizeSubagentStatus("stopped")).toBe("Stopped");
      expect(humanizeSubagentStatus("queued")).toBe("Queued");
      expect(humanizeSubagentStatus("idle")).toBe("Idle");
    });

    it("未识别状态返回 undefined", () => {
      expect(humanizeSubagentStatus("unknown")).toBeUndefined();
      expect(humanizeSubagentStatus(null)).toBeUndefined();
    });

    it("isActive 强制 Running", () => {
      expect(humanizeSubagentStatus("completed", true)).toBe("Running");
    });
  });

  describe("formatSubagentModelLabel", () => {
    it("null / undefined 返回 undefined", () => {
      expect(formatSubagentModelLabel(null)).toBeUndefined();
      expect(formatSubagentModelLabel(undefined)).toBeUndefined();
    });

    it("纯空白返回 undefined", () => {
      expect(formatSubagentModelLabel("   ")).toBeUndefined();
    });

    it("非空字符串委托给 formatModelDisplayName", () => {
      // formatModelDisplayName 是来自 ~/shared/model
      // 我们只验证它不会抛错并返回字符串
      const result = formatSubagentModelLabel("gpt-4o");
      expect(typeof result === "string" || result === undefined).toBe(true);
    });
  });
});
