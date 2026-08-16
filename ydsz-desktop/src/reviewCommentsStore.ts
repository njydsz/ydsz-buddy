/**
 * @file 行级 Review Comment 状态管理模块
 * @description 管理 Diff 评审中针对单行 / 单 hunk 的评论。
 *              双层持久化: localStorage 缓存(乐观更新) + 后端磁盘文件(权威源).
 *              对齐 Codex / Qoder / GitHub PR Review 的"行级 comment"产品形态.
 *
 * ## 数据模型
 *
 * - `ReviewComment` 一行评论 = (filePath, hunkIndex, lineType, lineContent, body, author, status)
 * - 按 threadId + turnId 维度隔离（避免跨线程串数据）
 * - status: open / resolved / dismissed
 *
 * ## 持久化策略（P2-2 升级）
 *
 * - **localStorage 缓存**: 乐观更新, UI 立即响应, key = `ydsz-buddy:review-comments:v1`
 * - **后端磁盘文件**: `{workspace_root}/.ydsz/review-comments.json`, 权威数据源
 * - **同步模式**: 每次本地 mutation 后 fire-and-forget 同步到后端
 * - **hydrate**: 应用启动 / 工作区切换时从后端加载, 替换本地缓存
 * - 保留最近 500 条（按 updatedAt 降序），自动丢弃更早的
 *
 * ## 集成方式
 *
 * - 在 DiffPanel 新增 "Comments" Tab 调用 `useReviewCommentsStore`
 * - 通过 `selectCommentsForFile(comments, filePath)` 过滤单文件评论
 * - 通过 `selectOpenCommentCount(comments)` 计算 Tab Badge
 * - 调用 `hydrateFromBackend(workspaceRoot)` 初始化后端数据
 */

import { type ThreadId, type TurnId } from "@ydsz-buddy/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  reviewCommentAdd as backendAdd,
  reviewCommentClearForThread as backendClearForThread,
  reviewCommentClearForTurn as backendClearForTurn,
  reviewCommentDelete as backendDelete,
  reviewCommentList as backendList,
  reviewCommentSetStatus as backendSetStatus,
  reviewCommentUpdateBody as backendUpdateBody,
  type ReviewComment as BackendReviewComment,
} from "~/contracts/reviewComments";

/** 单条行级 Review Comment */
export interface ReviewComment {
  /** 唯一 id（UUID v4） */
  id: string;
  /** 关联线程 */
  threadId: ThreadId;
  /** 关联 turn（可空：工作区级 diff 评论可挂在 turnId=null 上） */
  turnId: TurnId | null;
  /** 文件路径（仓库相对路径） */
  filePath: string;
  /** hunk 索引（在 FileDiffMetadata.hunks[] 中的位置） */
  hunkIndex: number;
  /** 行号（1-based；0 表示整 hunk 顶部） */
  lineNumber: number;
  /** 行类型：add（新增）/ del（删除）/ context（上下文） */
  lineType: "add" | "del" | "context";
  /** 选区代码片段（用于 UI 展示） */
  lineContent: string;
  /** 评论正文（Markdown） */
  body: string;
  /** 作者标识（user / ai-{providerId}） */
  author: string;
  /** 评论状态 */
  status: "open" | "resolved" | "dismissed";
  /** 创建时间（ISO 8601） */
  createdAt: string;
  /** 最后更新时间 */
  updatedAt: string;
}

/** 新建评论入参（id / 时间由 store 补齐） */
export type NewReviewComment = Omit<ReviewComment, "id" | "createdAt" | "updatedAt" | "status">;

interface ReviewCommentsStoreState {
  comments: ReviewComment[];
  /** 当前工作区根目录（用于后端同步） */
  workspaceRoot: string | null;

  /** 设置工作区根目录并从后端 hydrate */
  hydrateFromBackend: (workspaceRoot: string) => Promise<void>;
  /** 创建一条评论 */
  addComment: (input: NewReviewComment) => ReviewComment;
  /** 更新评论正文（resolvedAt 不动） */
  updateCommentBody: (id: string, body: string) => void;
  /** 标记为已解决 */
  resolveComment: (id: string) => void;
  /** 标记为忽略 */
  dismissComment: (id: string) => void;
  /** 重新打开 */
  reopenComment: (id: string) => void;
  /** 删除 */
  deleteComment: (id: string) => void;
  /** 清空某线程所有评论 */
  clearForThread: (threadId: ThreadId) => void;
  /** 清空某 turn 所有评论 */
  clearForTurn: (threadId: ThreadId, turnId: TurnId) => void;
}

const REVIEW_COMMENTS_STORAGE_KEY = "ydsz-buddy:review-comments:v1";
const MAX_PERSISTED_COMMENTS = 500;

/** fire-and-forget 后端同步：捕获错误但不阻塞 UI */
function syncToBackend(workspaceRoot: string | null, fn: (root: string) => Promise<unknown>): void {
  if (!workspaceRoot) return;
  void fn(workspaceRoot).catch((e) => {
    // 静默失败：后端同步失败不影响本地操作，下次 hydrate 会校正
    console.warn("[reviewCommentsStore] 后端同步失败:", e);
  });
}

/** 把前端 ReviewComment 转为后端 NewReviewCommentInput（完整字段） */
function toBackendInput(c: ReviewComment): BackendReviewComment {
  return c;
}

function randomCommentId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `rc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function pruneOldest(comments: ReviewComment[]): ReviewComment[] {
  if (comments.length <= MAX_PERSISTED_COMMENTS) return comments;
  // 按 updatedAt 降序，保留最近 MAX 条
  return [...comments]
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
    .slice(0, MAX_PERSISTED_COMMENTS);
}

function normalizeComments(comments: readonly ReviewComment[]): ReviewComment[] {
  const seen = new Set<string>();
  const out: ReviewComment[] = [];
  for (const c of comments) {
    if (!c.id || seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }
  return out;
}

export const useReviewCommentsStore = create<ReviewCommentsStoreState>()(
  persist(
    (set, get) => ({
      comments: [],
      workspaceRoot: null,

      hydrateFromBackend: async (workspaceRoot) => {
        set({ workspaceRoot });
        try {
          const backendComments = await backendList(workspaceRoot);
          set({ comments: normalizeComments(backendComments as ReviewComment[]) });
        } catch (e) {
          // 后端加载失败：保留 localStorage 缓存数据，不阻塞 UI
          console.warn("[reviewCommentsStore] 后端 hydrate 失败:", e);
        }
      },

      addComment: (input) => {
        const now = nowIso();
        const comment: ReviewComment = {
          ...input,
          id: randomCommentId(),
          status: "open",
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          comments: pruneOldest([...state.comments, comment]),
        }));
        // 后台同步到后端
        syncToBackend(get().workspaceRoot, (root) =>
          backendAdd(root, toBackendInput(comment)),
        );
        return comment;
      },

      updateCommentBody: (id, body) => {
        set((state) => ({
          comments: state.comments.map((c) =>
            c.id === id ? { ...c, body, updatedAt: nowIso() } : c,
          ),
        }));
        syncToBackend(get().workspaceRoot, (root) =>
          backendUpdateBody(root, id, body),
        );
      },

      resolveComment: (id) => {
        set((state) => ({
          comments: state.comments.map((c) =>
            c.id === id ? { ...c, status: "resolved", updatedAt: nowIso() } : c,
          ),
        }));
        syncToBackend(get().workspaceRoot, (root) =>
          backendSetStatus(root, id, "resolved"),
        );
      },

      dismissComment: (id) => {
        set((state) => ({
          comments: state.comments.map((c) =>
            c.id === id ? { ...c, status: "dismissed", updatedAt: nowIso() } : c,
          ),
        }));
        syncToBackend(get().workspaceRoot, (root) =>
          backendSetStatus(root, id, "dismissed"),
        );
      },

      reopenComment: (id) => {
        set((state) => ({
          comments: state.comments.map((c) =>
            c.id === id ? { ...c, status: "open", updatedAt: nowIso() } : c,
          ),
        }));
        syncToBackend(get().workspaceRoot, (root) =>
          backendSetStatus(root, id, "open"),
        );
      },

      deleteComment: (id) => {
        set((state) => ({
          comments: state.comments.filter((c) => c.id !== id),
        }));
        syncToBackend(get().workspaceRoot, (root) =>
          backendDelete(root, id),
        );
      },

      clearForThread: (threadId) => {
        set((state) => ({
          comments: state.comments.filter((c) => c.threadId !== threadId),
        }));
        syncToBackend(get().workspaceRoot, (root) =>
          backendClearForThread(root, threadId),
        );
      },

      clearForTurn: (threadId, turnId) => {
        set((state) => ({
          comments: state.comments.filter(
            (c) => !(c.threadId === threadId && c.turnId === turnId),
          ),
        }));
        syncToBackend(get().workspaceRoot, (root) =>
          backendClearForTurn(root, threadId, turnId),
        );
      },
    }),
    {
      name: REVIEW_COMMENTS_STORAGE_KEY,
      storage: createJSONStorage(() => {
        if (typeof window === "undefined") {
          // SSR / 测试兜底：返回空 storage
          return {
            getItem: () => null,
            setItem: () => undefined,
            removeItem: () => undefined,
          };
        }
        return window.localStorage;
      }),
      version: 1,
      // 只持久化 comments 字段；方法不持久化
      partialize: (state) => ({ comments: normalizeComments(state.comments) }),
      // 写入前再次归一化（防 localStorage 中残留重复 id）
      merge: (persistedState, currentState) => {
        const p = (persistedState ?? {}) as { comments?: ReviewComment[] };
        return {
          ...currentState,
          comments: normalizeComments(p.comments ?? []),
        };
      },
    },
  ),
);

// ─────────────────────────── Selectors ───────────────────────────

/** 选某线程某 turn 的全部评论（按 createdAt 升序） */
export function selectCommentsForTurn(
  comments: readonly ReviewComment[],
  threadId: ThreadId,
  turnId: TurnId | null,
): ReviewComment[] {
  return comments
    .filter((c) => c.threadId === threadId && c.turnId === turnId)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
}

/** 选某文件所有评论 */
export function selectCommentsForFile(
  comments: readonly ReviewComment[],
  filePath: string,
): ReviewComment[] {
  return comments
    .filter((c) => c.filePath === filePath)
    .sort((a, b) => {
      if (a.hunkIndex !== b.hunkIndex) return a.hunkIndex - b.hunkIndex;
      return a.lineNumber - b.lineNumber;
    });
}

/** 统计某线程的"未解决"评论数（用于 DiffPanel Comments Tab 的 Badge） */
export function selectOpenCommentCount(
  comments: readonly ReviewComment[],
  threadId: ThreadId,
  turnId: TurnId | null,
): number {
  return comments.filter(
    (c) => c.threadId === threadId && c.turnId === turnId && c.status === "open",
  ).length;
}

/** 状态标签的中文/英文映射（i18n 兜底） */
export const REVIEW_COMMENT_STATUS_LABELS: Record<ReviewComment["status"], string> = {
  open: "待解决",
  resolved: "已解决",
  dismissed: "已忽略",
};

/** 行类型显示标签 */
export const REVIEW_COMMENT_LINE_TYPE_LABELS: Record<ReviewComment["lineType"], string> = {
  add: "新增",
  del: "删除",
  context: "上下文",
};
