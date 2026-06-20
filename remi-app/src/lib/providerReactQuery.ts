// FILE: providerReactQuery.ts
// Purpose: Builds React Query options for provider-backed orchestration RPC calls.
// Layer: Web data fetching helpers
// Depends on: native API bridge, orchestration contracts, and React Query.

import {
  type OrchestrationGetFullThreadDiffInput,
  type OrchestrationGetTurnDiffInput,
  type ThreadId,
} from "@remi-code/contracts";
import { queryOptions } from "@tanstack/react-query";
import { ensureNativeApi } from "../nativeApi";

interface CheckpointDiffQueryInput {
  threadId: ThreadId | null;
  fromTurnCount: number | null;
  toTurnCount: number | null;
  ignoreWhitespace: boolean;
  cacheScope?: string | null;
  enabled?: boolean;
}

export const providerQueryKeys = {
  all: ["providers"] as const,
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

type DecodedCheckpointDiffRequest =
  | { kind: "fullThreadDiff"; input: OrchestrationGetFullThreadDiffInput }
  | { kind: "turnDiff"; input: OrchestrationGetTurnDiffInput }
  | null;

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

function asCheckpointErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "";
}

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

function isCheckpointTemporarilyUnavailable(error: unknown): boolean {
  const message = asCheckpointErrorMessage(error).toLowerCase();
  return (
    message.includes("exceeds current turn count") ||
    // Placeholder checkpoint rows can arrive before the checkpoint writer finishes.
    message.includes("checkpoint diff is not available yet")
  );
}

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
