/**
 * @file useWorkspaceTurnAiShare.ts
 * @description 跨线程 workspace 级别 AI 占比 hook
 *
 * 与 `useTurnAiShare(thread)`(单线程本地聚合)不同,本 hook 走服务端
 * `orchestration.getTurnAiShareSnapshot` RPC 拿到整个 workspace 的
 * 24h / 7d / 30d 三个窗口聚合数据,适合"全局 AI 生产占比"展示位
 * (Sidebar 顶部 / Settings / TopChrome)。
 *
 * 数据流:
 *
 *   useQuery(["turnAiShare", "workspace"])
 *     → readNativeApi().orchestration.getTurnAiShareSnapshot()
 *     → { windows, generatedAtMs, isEmpty }
 *     → refetchInterval 60s
 *
 * 大厂基线:
 * - **缓存**:服务端 30s TTL,客户端 60s 拉一次(同 mobile 节奏)
 * - **错误降级**:query.isError 透传,UI 自己决定降级文案
 * - **空数据**:isEmpty = true 时各窗口 aiShare 为 null,UI 显示"—"
 */
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { readNativeApi } from "../nativeApi";
import type {
  OrchestrationGetTurnAiShareSnapshotResult,
  AiShareWindow,
} from "../contracts/orchestration";
import { monitor } from "../lib/monitor";

export type WorkspaceAiShareStats = OrchestrationGetTurnAiShareSnapshotResult;

const REFETCH_INTERVAL_MS = 60_000;
const STALE_TIME_MS = 30_000;

export function useWorkspaceTurnAiShare(enabled = true) {
  const query = useQuery<WorkspaceAiShareStats>({
    queryKey: ["turnAiShare", "workspace"],
    queryFn: async () => {
      const api = readNativeApi();
      if (!api) {
        throw new Error("Native API not ready");
      }
      return api.orchestration.getTurnAiShareSnapshot();
    },
    refetchInterval: REFETCH_INTERVAL_MS,
    staleTime: STALE_TIME_MS,
    enabled,
    retry: 0,
  });

  // 埋点:每次快照更新上报 30d 窗口的 AI 占比/行数(去重)
  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    const data = query.data;
    if (!data || data.isEmpty) return;
    const w30 = data.windows.find((w) => w.window === "30d");
    if (!w30) return;
    const key = `${data.generatedAtMs}:${w30.aiShare ?? "null"}`;
    if (lastKey.current === key) return;
    lastKey.current = key;

    try {
      if (w30.aiShare !== null) {
        monitor.captureMetric?.("workspaceAiShare.30d.share", w30.aiShare, {
          window: "30d",
          turns: String(w30.turnCount),
        });
      }
      monitor.captureMetric?.("workspaceAiShare.30d.aiLines", w30.aiLines, { window: "30d" });
      monitor.captureMetric?.("workspaceAiShare.30d.totalLines", w30.totalLines, {
        window: "30d",
      });
    } catch {
      // 上报失败不阻塞 UI
    }
  }, [query.data]);

  return query;
}

/** 工具函数:取指定窗口的 AI 占比,缺失返回 null */
export function pickAiShare(
  snapshot: WorkspaceAiShareStats | undefined,
  window: AiShareWindow["window"],
): AiShareWindow | null {
  if (!snapshot) return null;
  return snapshot.windows.find((w) => w.window === window) ?? null;
}
