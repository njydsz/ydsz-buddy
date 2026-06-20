/**
 * @file providerReactQuery.ts
 * @description Provider 支撑的编排 RPC 调用的 React Query 查询配置，
 * 提供检查点差异查询（checkpoint diff）的 queryOptions。
 */

import {
  type OrchestrationGetFullThreadDiffInput,
  type OrchestrationGetTurnDiffInput,
  type ThreadId,
} from "~/contracts";
import { queryOptions } from "@tanstack/react-query";
import { ensureNativeApi } from "../nativeApi";

/** 检查点差异查询输入参数 */
interface CheckpointDiffQueryInput {
  /** 线程 ID */
  threadId: ThreadId | null;
  /** 起始轮次计数 */
  fromTurnCount: number | null;
  /** 结束轮次计数 */
  toTurnCount: number | null;
  /** 是否忽略空白差异 */
  ignoreWhitespace: boolean;
  /** 缓存作用域 */
  cacheScope?: string | null;
  /** 是否启用查询 */
  enabled?: boolean;
}

/** Provider 查询键集合，用于 React Query 缓存管理 */
export const providerQueryKeys = {
  /** 全局查询键前缀 */
  all: ["providers"] as const,
  /** 检查点差异查询键 */
  checkpointDiff: (input: CheckpointDiffQueryInput) =>
    [
      "providers",
      "checkpointDiff",
      input.threadId,
      input.fromTurnCount,
      input.toTurnCount,
      input.ignoreWhitespace,
      input.cacheScope ?? null,
    ] as const,
};

/** 解码后的检查点差异请求类型 */
type DecodedCheckpointDiffRequest =
  | { kind: "fullThreadDiff"; input: OrchestrationGetFullThreadDiffInput }
  | { kind: "turnDiff"; input: OrchestrationGetTurnDiffInput }
  | null;

/** 将查询输入解码为具体的差异请求类型 */
function decodeCheckpointDiffRequest(input: CheckpointDiffQueryInput): DecodedCheckpointDiffRequest {
  if (!input.threadId || input.toTurnCount === null) {
    return null;
  }

  if (input.fromTurnCount === 0) {
    return {
      kind: "fullThreadDiff",
      input: {
        threadId: input.threadId,
        toTurnCount: input.toTurnCount,
        ignoreWhitespace: input.ignoreWhitespace,
      },
    };
  }

  if (input.fromTurnCount === null) {
    return null;
  }

  return {
    kind: "turnDiff",
    input: {
      threadId: input.threadId,
      fromTurnCount: input.fromTurnCount,
      toTurnCount: input.toTurnCount,
      ignoreWhitespace: input.ignoreWhitespace,
    },
  };
}

/** 从错误对象中提取错误消息字符串 */
function asCheckpointErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "";
}

/** 归一化检查点错误消息，提供更友好的错误描述 */
function normalizeCheckpointErrorMessage(error: unknown): string {
  const message = asCheckpointErrorMessage(error).trim();
  if (message.length === 0) {
    return "Failed to load checkpoint diff.";
  }

  const lower = message.toLowerCase();
  if (lower.includes("not a git repository")) {
    return "Turn diffs are unavailable because this project is not a git repository.";
  }

  if (
    lower.includes("checkpoint unavailable for thread") ||
    lower.includes("checkpoint invariant violation")
  ) {
    const separatorIndex = message.indexOf(":");
    if (separatorIndex >= 0) {
      const detail = message.slice(separatorIndex + 1).trim();
      if (detail.length > 0) {
        return detail;
      }
    }
  }

  return message;
}

/** 判断检查点差异是否暂时不可用（可重试） */
function isCheckpointTemporarilyUnavailable(error: unknown): boolean {
  const message = asCheckpointErrorMessage(error).toLowerCase();
  return (
    message.includes("exceeds current turn count") ||
    // Placeholder checkpoint rows can arrive before the checkpoint writer finishes.
    message.includes("checkpoint diff is not available yet")
  );
}

/**
 * 创建检查点差异查询配置
 *
 * @param input - 查询输入参数
 * @param input.threadId - 线程 ID
 * @param input.fromTurnCount - 起始轮次计数
 * @param input.toTurnCount - 结束轮次计数
 * @param input.ignoreWhitespace - 是否忽略空白差异
 * @param input.cacheScope - 缓存作用域
 * @param input.enabled - 是否启用查询
 * @returns React Query queryOptions 配置对象，支持自动重试暂时不可用的检查点
 */
export function checkpointDiffQueryOptions(input: CheckpointDiffQueryInput) {
  const decodedRequest = decodeCheckpointDiffRequest(input);

  return queryOptions({
    queryKey: providerQueryKeys.checkpointDiff(input),
    queryFn: async () => {
      const api = ensureNativeApi();
      if (!input.threadId || !decodedRequest) {
        throw new Error("Checkpoint diff is unavailable.");
      }
      try {
        if (decodedRequest.kind === "fullThreadDiff") {
          return await api.orchestration.getFullThreadDiff(decodedRequest.input);
        }
        return await api.orchestration.getTurnDiff(decodedRequest.input);
      } catch (error) {
        throw new Error(normalizeCheckpointErrorMessage(error), { cause: error });
      }
    },
    enabled: (input.enabled ?? true) && !!input.threadId && !!decodedRequest,
    staleTime: Infinity,
    retry: (failureCount, error) => {
      if (isCheckpointTemporarilyUnavailable(error)) {
        return failureCount < 12;
      }
      return failureCount < 3;
    },
    retryDelay: (attempt, error) =>
      isCheckpointTemporarilyUnavailable(error)
        ? Math.min(5_000, 250 * 2 ** (attempt - 1))
        : Math.min(1_000, 100 * 2 ** (attempt - 1)),
  });
}