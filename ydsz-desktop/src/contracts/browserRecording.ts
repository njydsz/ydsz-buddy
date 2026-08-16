/**
 * @file 浏览器录制与回放契约
 *
 * 浏览器操作录制的前后端通信类型定义。
 */

import { Schema } from "effect";

// ============================================================================
// 录制操作
// ============================================================================

/** 单个录制的操作 */
export const RecordedAction = Schema.Struct({
  /** 相对录制开始的时间偏移（毫秒） */
  elapsedMs: Schema.Number,
  /** 操作类型 */
  actionType: Schema.String,
  /** CSS 选择器 */
  selector: Schema.optional(Schema.String),
  /** 操作的值（fill 的文本、press_key 的按键等） */
  value: Schema.optional(Schema.String),
  /** 操作发生时的页面 URL */
  url: Schema.optional(Schema.String),
  /** 操作结果（true=成功） */
  success: Schema.Boolean,
  /** 错误信息（失败时） */
  error: Schema.optional(Schema.String),
});
export type RecordedAction = typeof RecordedAction.Type;

// ============================================================================
// 录制状态
// ============================================================================

/** 录制状态响应 */
export const RecordingStatus = Schema.Struct({
  isRecording: Schema.Boolean,
  actionCount: Schema.Number,
});
export type RecordingStatus = typeof RecordingStatus.Type;

/** 录制摘要 */
export const RecordingSummary = Schema.Struct({
  totalActions: Schema.Number,
  successCount: Schema.Number,
  errorCount: Schema.Number,
  durationMs: Schema.Number,
  threadId: Schema.String,
});
export type RecordingSummary = typeof RecordingSummary.Type;

// ============================================================================
// 回放结果
// ============================================================================

/** 回放结果 */
export const ReplayResult = Schema.Struct({
  total: Schema.Number,
  successful: Schema.Number,
  failed: Schema.Number,
  failedActions: Schema.Array(Schema.Number),
  errors: Schema.Array(Schema.String),
});
export type ReplayResult = typeof ReplayResult.Type;

// ============================================================================
// 输入参数 Schema
// ============================================================================

/** 开始录制参数 */
export const StartRecordingInput = Schema.Struct({
  threadId: Schema.String,
});
export type StartRecordingInput = typeof StartRecordingInput.Type;

/** 停止录制参数 */
export const StopRecordingInput = Schema.Struct({
  threadId: Schema.String,
});
export type StopRecordingInput = typeof StopRecordingInput.Type;

/** 查询录制状态参数 */
export const GetRecordingStatusInput = Schema.Struct({
  threadId: Schema.String,
});
export type GetRecordingStatusInput = typeof GetRecordingStatusInput.Type;

/** 导出录制参数 */
export const ExportRecordingInput = Schema.Struct({
  threadId: Schema.String,
});
export type ExportRecordingInput = typeof ExportRecordingInput.Type;

/** 回放操作参数 */
export const ReplayActionsInput = Schema.Struct({
  threadId: Schema.String,
  tabId: Schema.String,
  actions: Schema.Array(RecordedAction),
  delayMs: Schema.optional(Schema.Number),
});
export type ReplayActionsInput = typeof ReplayActionsInput.Type;

// ============================================================================
// 常量
// ============================================================================

/** 默认回放延时（毫秒） */
export const DEFAULT_REPLAY_DELAY_MS = 500;
