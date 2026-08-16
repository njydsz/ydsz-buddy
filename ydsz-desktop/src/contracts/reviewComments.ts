// 行级 Review Comment 契约：与 src-tauri/src/commands/review_comments.rs 对齐。
//
// 后端单源：ydsz-desktop/src-tauri/src/commands/review_comments.rs
// 前端 store：reviewCommentsStore.ts（localStorage 缓存 + 后端持久化同步）

import { invoke } from "@tauri-apps/api/core";
import type { ThreadId, TurnId } from "@ydsz-buddy/contracts";

/** 行级 Review Comment（与后端 ReviewComment 对齐，camelCase） */
export interface ReviewComment {
  id: string;
  threadId: ThreadId;
  turnId: TurnId | null;
  filePath: string;
  hunkIndex: number;
  lineNumber: number;
  lineType: "add" | "del" | "context";
  lineContent: string;
  body: string;
  author: string;
  status: "open" | "resolved" | "dismissed";
  createdAt: string;
  updatedAt: string;
}

/** 新建评论入参（前端生成完整字段，后端直接存储） */
export interface NewReviewCommentInput {
  id: string;
  threadId: ThreadId;
  turnId: TurnId | null;
  filePath: string;
  hunkIndex: number;
  lineNumber: number;
  lineType: "add" | "del" | "context";
  lineContent: string;
  body: string;
  author: string;
  status: "open" | "resolved" | "dismissed";
  createdAt: string;
  updatedAt: string;
}

/** 列出评论（可按 thread/turn 过滤） */
export function reviewCommentList(
  workspaceRoot: string,
  threadId?: ThreadId | null,
  turnId?: TurnId | null,
): Promise<ReviewComment[]> {
  return invoke<ReviewComment[]>("review_comment_list", {
    workspaceRoot,
    threadId: threadId ?? null,
    turnId: turnId ?? null,
  });
}

/** 新增评论（返回含后端生成的 id / 时间） */
export function reviewCommentAdd(
  workspaceRoot: string,
  input: NewReviewCommentInput,
): Promise<ReviewComment> {
  return invoke<ReviewComment>("review_comment_add", {
    workspaceRoot,
    input,
  });
}

/** 更新评论正文 */
export function reviewCommentUpdateBody(
  workspaceRoot: string,
  id: string,
  body: string,
): Promise<void> {
  return invoke<void>("review_comment_update_body", {
    workspaceRoot,
    input: { id, body },
  });
}

/** 切换评论状态 */
export function reviewCommentSetStatus(
  workspaceRoot: string,
  id: string,
  status: "open" | "resolved" | "dismissed",
): Promise<void> {
  return invoke<void>("review_comment_set_status", {
    workspaceRoot,
    input: { id, status },
  });
}

/** 删除评论 */
export function reviewCommentDelete(
  workspaceRoot: string,
  id: string,
): Promise<void> {
  return invoke<void>("review_comment_delete", {
    workspaceRoot,
    id,
  });
}

/** 清空某线程所有评论 */
export function reviewCommentClearForThread(
  workspaceRoot: string,
  threadId: ThreadId,
): Promise<void> {
  return invoke<void>("review_comment_clear_for_thread", {
    workspaceRoot,
    threadId,
  });
}

/** 清空某 turn 所有评论 */
export function reviewCommentClearForTurn(
  workspaceRoot: string,
  threadId: ThreadId,
  turnId: TurnId,
): Promise<void> {
  return invoke<void>("review_comment_clear_for_turn", {
    workspaceRoot,
    threadId,
    turnId,
  });
}
