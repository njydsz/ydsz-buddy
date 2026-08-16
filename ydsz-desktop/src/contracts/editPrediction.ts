// Edit Prediction 契约：与 ydsz-provider/src/edit_prediction/types.rs 对齐。
//
// 命名约定：
// - Rust 端 `#[serde(rename_all = "camelCase")]` → TS 端 camelCase
// - 类型名：PascalCase

import { getSharedWsTransport } from "../wsTransport";

// ===== 共享类型 =====

/** 编辑预测请求 */
export interface EditPredictionRequest {
  filePath: string;
  content: string;
  cursorLine: number;
  cursorColumn: number;
  language: string;
  workspaceRoot?: string;
  provider?: string;
  model?: string;
}

/** 编辑预测响应 */
export interface EditPredictionResponse {
  suggestions: EditPredictionSuggestion[];
  elapsedMs: number;
  cacheHit: boolean;
}

/** 单条补全建议 */
export interface EditPredictionSuggestion {
  text: string;
  confidence: number;
  kind: "inline" | "block" | "signature";
}

/** 预测指标快照 */
export interface PredictionMetrics {
  totalPredictions: number;
  accepted: number;
  rejected: number;
  failed: number;
  acceptanceRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  cacheHitRate: number;
}

// ===== RPC 调用封装 =====

/**
 * 请求 AI 编辑预测
 *
 * 通过 WebSocket JSON-RPC 调用后端 `edit_prediction.predict` 方法。
 * 后端使用 EditPredictionEngine 采集上下文并调用已接入的 Provider 生成补全。
 */
export async function predictEdit(
  input: EditPredictionRequest,
): Promise<EditPredictionResponse> {
  const transport = getSharedWsTransport();
  return await transport.request<EditPredictionResponse>(
    "edit_prediction.predict",
    input,
  );
}

/**
 * 标记预测被接受（用于指标统计）
 */
export async function markPredictionAccepted(
  filePath: string,
  language: string,
  latencyMs: number,
): Promise<void> {
  const transport = getSharedWsTransport();
  await transport.request<void>("edit_prediction.markAccepted", {
    filePath,
    language,
    latencyMs,
  });
}

/**
 * 获取预测指标快照
 */
export async function getPredictionMetrics(): Promise<PredictionMetrics> {
  const transport = getSharedWsTransport();
  return await transport.request<PredictionMetrics>(
    "edit_prediction.metrics",
  );
}

/**
 * 清空预测缓存
 */
export async function clearPredictionCache(): Promise<void> {
  const transport = getSharedWsTransport();
  await transport.request<void>("edit_prediction.clearCache");
}
