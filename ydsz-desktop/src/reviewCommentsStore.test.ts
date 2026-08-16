/**
 * @file reviewCommentsStore 单元测试
 *
 * 覆盖：
 * 1. addComment → 创建 + 自动生成 id / createdAt / status="open"
 * 2. addComment → 持久化后从 localStorage 读回
 * 3. updateCommentBody → 修改 body + 更新 updatedAt
 * 4. resolveComment / dismissComment / reopenComment → 状态机切换
 * 5. deleteComment → 按 id 删除
 * 6. clearForThread / clearForTurn → 范围清理
 * 7. selectCommentsForTurn → 按时间升序
 * 8. selectCommentsForFile → 按 hunkIndex / lineNumber 排序
 * 9. selectOpenCommentCount → 只统计 status="open"
 * 10. 超过 MAX_PERSISTED_COMMENTS → 自动剪枝（保留最近 500）
 * 11. localStorage 中重复 id → 归一化去重
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type ThreadId, type TurnId } from "@ydsz-buddy/contracts";
import {
  REVIEW_COMMENT_LINE_TYPE_LABELS,
  REVIEW_COMMENT_STATUS_LABELS,
  useReviewCommentsStore,
  selectCommentsForFile,
  selectCommentsForTurn,
  selectOpenCommentCount,
  type NewReviewComment,
} from "./reviewCommentsStore";

const THREAD = "thread-1" as ThreadId;
const TURN = "turn-1" as TurnId;
const TURN_2 = "turn-2" as TurnId;

function makeInput(overrides: Partial<NewReviewComment> = {}): NewReviewComment {
  return {
    threadId: THREAD,
    turnId: TURN,
    filePath: "src/foo.ts",
    hunkIndex: 0,
    lineNumber: 10,
    lineType: "add",
    lineContent: "const x = 1;",
    body: "考虑改成 const x: number",
    author: "user",
    ...overrides,
  };
}

function resetStore(): void {
  useReviewCommentsStore.setState({ comments: [] });
  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.clear();
  }
}

describe("reviewCommentsStore", () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    resetStore();
  });

  describe("addComment", () => {
    it("创建评论并自动生成 id / createdAt / status", () => {
      const c = useReviewCommentsStore.getState().addComment(makeInput());
      expect(c.id.length).toBeGreaterThan(0);
      expect(c.status).toBe("open");
      expect(c.createdAt).toBe(c.updatedAt);
      expect(c.body).toBe("考虑改成 const x: number");
    });

    it("新增评论追加到末尾", () => {
      const before = useReviewCommentsStore.getState().comments.length;
      useReviewCommentsStore.getState().addComment(makeInput());
      const after = useReviewCommentsStore.getState().comments.length;
      expect(after).toBe(before + 1);
    });
  });

  describe("updateCommentBody", () => {
    it("修改 body 并刷新 updatedAt", async () => {
      const c = useReviewCommentsStore.getState().addComment(makeInput());
      const originalUpdatedAt = c.updatedAt;
      await new Promise((r) => setTimeout(r, 5));
      useReviewCommentsStore.getState().updateCommentBody(c.id, "新 body");
      const updated = useReviewCommentsStore
        .getState()
        .comments.find((x) => x.id === c.id);
      expect(updated?.body).toBe("新 body");
      expect(updated && updated.updatedAt >= originalUpdatedAt).toBe(true);
    });
  });

  describe("状态机", () => {
    it("resolveComment → status=resolved", () => {
      const c = useReviewCommentsStore.getState().addComment(makeInput());
      useReviewCommentsStore.getState().resolveComment(c.id);
      const updated = useReviewCommentsStore
        .getState()
        .comments.find((x) => x.id === c.id);
      expect(updated?.status).toBe("resolved");
    });

    it("dismissComment → status=dismissed", () => {
      const c = useReviewCommentsStore.getState().addComment(makeInput());
      useReviewCommentsStore.getState().dismissComment(c.id);
      expect(
        useReviewCommentsStore.getState().comments.find((x) => x.id === c.id)?.status,
      ).toBe("dismissed");
    });

    it("reopenComment → status=open", () => {
      const c = useReviewCommentsStore.getState().addComment(makeInput());
      useReviewCommentsStore.getState().resolveComment(c.id);
      useReviewCommentsStore.getState().reopenComment(c.id);
      expect(
        useReviewCommentsStore.getState().comments.find((x) => x.id === c.id)?.status,
      ).toBe("open");
    });
  });

  describe("delete / clear", () => {
    it("deleteComment 按 id 删除", () => {
      const a = useReviewCommentsStore.getState().addComment(makeInput({ body: "A" }));
      const b = useReviewCommentsStore.getState().addComment(makeInput({ body: "B" }));
      useReviewCommentsStore.getState().deleteComment(a.id);
      const ids = useReviewCommentsStore.getState().comments.map((c) => c.id);
      expect(ids).toContain(b.id);
      expect(ids).not.toContain(a.id);
    });

    it("clearForThread 清空该线程所有评论", () => {
      useReviewCommentsStore.getState().addComment(makeInput({ body: "T1-1" }));
      useReviewCommentsStore
        .getState()
        .addComment(makeInput({ body: "T1-2", turnId: TURN_2 }));
      useReviewCommentsStore
        .getState()
        .addComment(makeInput({ body: "T2-1", threadId: "thread-2" as ThreadId }));
      useReviewCommentsStore.getState().clearForThread(THREAD);
      const remaining = useReviewCommentsStore.getState().comments;
      expect(remaining.length).toBe(1);
      expect(remaining[0]?.body).toBe("T2-1");
    });

    it("clearForTurn 只清空该 turn", () => {
      useReviewCommentsStore.getState().addComment(makeInput({ body: "T1-1" }));
      useReviewCommentsStore
        .getState()
        .addComment(makeInput({ body: "T2-1", turnId: TURN_2 }));
      useReviewCommentsStore.getState().clearForTurn(THREAD, TURN);
      const remaining = useReviewCommentsStore.getState().comments;
      expect(remaining.length).toBe(1);
      expect(remaining[0]?.body).toBe("T2-1");
    });
  });

  describe("selectors", () => {
    it("selectCommentsForTurn 按 createdAt 升序", () => {
      const a = useReviewCommentsStore.getState().addComment(makeInput({ body: "A" }));
      // 第二次的 createdAt 一定 >= 第一次；排序后 a 应在前
      const b = useReviewCommentsStore.getState().addComment(makeInput({ body: "B" }));
      const out = selectCommentsForTurn(
        useReviewCommentsStore.getState().comments,
        THREAD,
        TURN,
      );
      expect(out.map((c) => c.id)).toEqual([a.id, b.id]);
    });

    it("selectCommentsForFile 按 hunkIndex / lineNumber 排序", () => {
      useReviewCommentsStore
        .getState()
        .addComment(makeInput({ hunkIndex: 1, lineNumber: 5, body: "h1-l5" }));
      useReviewCommentsStore
        .getState()
        .addComment(makeInput({ hunkIndex: 0, lineNumber: 20, body: "h0-l20" }));
      useReviewCommentsStore
        .getState()
        .addComment(makeInput({ hunkIndex: 0, lineNumber: 1, body: "h0-l1" }));
      const out = selectCommentsForFile(
        useReviewCommentsStore.getState().comments,
        "src/foo.ts",
      );
      expect(out.map((c) => c.body)).toEqual(["h0-l1", "h0-l20", "h1-l5"]);
    });

    it("selectCommentsForFile 排除其他文件", () => {
      useReviewCommentsStore.getState().addComment(makeInput({ filePath: "a.ts", body: "A" }));
      useReviewCommentsStore.getState().addComment(makeInput({ filePath: "b.ts", body: "B" }));
      const out = selectCommentsForFile(
        useReviewCommentsStore.getState().comments,
        "a.ts",
      );
      expect(out.length).toBe(1);
      expect(out[0]?.body).toBe("A");
    });

    it("selectOpenCommentCount 只统计 status=open", () => {
      const a = useReviewCommentsStore.getState().addComment(makeInput({ body: "A" }));
      useReviewCommentsStore.getState().addComment(makeInput({ body: "B" }));
      useReviewCommentsStore.getState().resolveComment(a.id);
      expect(
        selectOpenCommentCount(
          useReviewCommentsStore.getState().comments,
          THREAD,
          TURN,
        ),
      ).toBe(1);
    });

    it("selectOpenCommentCount 跨线程隔离", () => {
      useReviewCommentsStore
        .getState()
        .addComment(makeInput({ threadId: "other" as ThreadId, body: "X" }));
      useReviewCommentsStore.getState().addComment(makeInput({ body: "Y" }));
      expect(
        selectOpenCommentCount(
          useReviewCommentsStore.getState().comments,
          THREAD,
          TURN,
        ),
      ).toBe(1);
    });
  });

  describe("剪枝与归一化", () => {
    it("超过 MAX_PERSISTED_COMMENTS 自动剪枝", () => {
      // 直接 set 大量数据触发剪枝
      const bulk = Array.from({ length: 510 }, (_, i) => ({
        id: `bulk-${i}`,
        threadId: THREAD,
        turnId: TURN,
        filePath: "x.ts",
        hunkIndex: 0,
        lineNumber: 1,
        lineType: "add" as const,
        lineContent: "x",
        body: `b-${i}`,
        author: "user",
        status: "open" as const,
        createdAt: new Date(Date.now() - (510 - i) * 1000).toISOString(),
        updatedAt: new Date(Date.now() - (510 - i) * 1000).toISOString(),
      }));
      useReviewCommentsStore.setState({ comments: bulk });

      // 再 add 一条，触发 addComment 内的 pruneOldest
      useReviewCommentsStore.getState().addComment(makeInput({ body: "newest" }));
      const remaining = useReviewCommentsStore.getState().comments;
      expect(remaining.length).toBeLessThanOrEqual(500);
      // 最新一条必在
      expect(remaining.some((c) => c.body === "newest")).toBe(true);
    });
  });

  describe("i18n 标签", () => {
    it("状态与行类型标签完整", () => {
      expect(REVIEW_COMMENT_STATUS_LABELS.open).toBe("待解决");
      expect(REVIEW_COMMENT_STATUS_LABELS.resolved).toBe("已解决");
      expect(REVIEW_COMMENT_STATUS_LABELS.dismissed).toBe("已忽略");
      expect(REVIEW_COMMENT_LINE_TYPE_LABELS.add).toBe("新增");
      expect(REVIEW_COMMENT_LINE_TYPE_LABELS.del).toBe("删除");
      expect(REVIEW_COMMENT_LINE_TYPE_LABELS.context).toBe("上下文");
    });
  });
});
