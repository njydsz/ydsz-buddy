/**
 * @file QuestPanel.tsx
 * @description Quest Mode 面板 - 展示和管理多步骤自主执行任务
 * @module components/QuestPanel
 *
 * ## 功能
 *
 * - 展示活跃 Quest 列表（通过 WebSocket RPC 从后端拉取）
 * - Quest 详情视图（步骤时间线 + 进度条）
 * - 步骤级操作（跳过、重试）
 * - Quest 生命周期操作（启动、暂停、恢复、中止）
 * - Spec 文档预览（Quest 描述 + 步骤详情）
 * - 产出物展示（artifacts 以标签形式展示）
 * - 自动轮询刷新（5s 间隔）
 */

import { memo, useCallback, useState } from "react";
import {
  PiPlay,
  PiPause,
  PiStop,
  PiSkipForward,
  PiArrowsClockwise,
  PiCheckCircle,
  PiCircle,
  PiSpinner,
  PiWarningCircle,
  PiSkipForwardCircle,
  PiListChecks,
  PiFileText,
  PiClock,
} from "react-icons/pi";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { readNativeApi } from "~/nativeApi";
import type { QuestDto } from "~/wsNativeApi";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import { cn } from "~/lib/utils";
import { toastManager } from "./ui/toast";

// ==================== Helpers ====================

const STATUS_LABELS: Record<string, string> = {
  created: "已创建",
  planning: "规划中",
  running: "运行中",
  paused: "已暂停",
  completed: "已完成",
  aborted: "已中止",
  failed: "已失败",
};

const STATUS_COLORS: Record<string, string> = {
  created: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  planning: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  running: "bg-green-500/10 text-green-600 border-green-500/20",
  paused: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  completed: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  aborted: "bg-gray-500/10 text-gray-600 border-gray-500/20",
  failed: "bg-red-500/10 text-red-600 border-red-500/20",
};

function StepIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return <PiCheckCircle className="text-emerald-500 shrink-0" size={18} />;
    case "running":
      return <PiSpinner className="text-green-500 animate-spin shrink-0" size={18} />;
    case "failed":
      return <PiWarningCircle className="text-red-500 shrink-0" size={18} />;
    case "skipped":
      return <PiSkipForwardCircle className="text-gray-400 shrink-0" size={18} />;
    default:
      return <PiCircle className="text-gray-300 shrink-0" size={18} />;
  }
}

function formatTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ==================== Quest Panel ====================

export const QuestPanel = memo(function QuestPanel({
  threadId,
}: {
  threadId: string;
}) {
  const queryClient = useQueryClient();
  const [selectedQuestId, setSelectedQuestId] = useState<string | null>(null);

  const queryKey = ["quest", "listActive", threadId];

  // 拉取活跃 Quest 列表
  const { data: quests, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const api = readNativeApi();
      if (!api?.quest) return [] as QuestDto[];
      return api.quest.listActive() as Promise<ReadonlyArray<QuestDto>>;
    },
    refetchInterval: 5000,
  });

  const selectedQuest = quests?.find((q) => q.id === selectedQuestId) ?? quests?.[0] ?? null;

  // ---- Mutations ----

  const startMutation = useMutation({
    mutationFn: async (questId: string) => {
      const api = readNativeApi();
      if (!api?.quest) throw new Error("Quest API 不可用");
      return api.quest.start({ questId });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (e) => {
      toastManager.add({ type: "error", title: "启动 Quest 失败", description: e instanceof Error ? e.message : String(e) });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: async (questId: string) => {
      const api = readNativeApi();
      if (!api?.quest) throw new Error("Quest API 不可用");
      return api.quest.pause({ questId });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (e) => {
      toastManager.add({ type: "error", title: "暂停 Quest 失败", description: e instanceof Error ? e.message : String(e) });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: async (questId: string) => {
      const api = readNativeApi();
      if (!api?.quest) throw new Error("Quest API 不可用");
      return api.quest.resume({ questId });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (e) => {
      toastManager.add({ type: "error", title: "恢复 Quest 失败", description: e instanceof Error ? e.message : String(e) });
    },
  });

  const abortMutation = useMutation({
    mutationFn: async (questId: string) => {
      const api = readNativeApi();
      if (!api?.quest) throw new Error("Quest API 不可用");
      return api.quest.abort({ questId, reason: "用户手动中止" });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      toastManager.add({ type: "info", title: "Quest 已中止" });
    },
    onError: (e) => {
      toastManager.add({ type: "error", title: "中止 Quest 失败", description: e instanceof Error ? e.message : String(e) });
    },
  });

  const skipMutation = useMutation({
    mutationFn: async (questId: string) => {
      const api = readNativeApi();
      if (!api?.quest) throw new Error("Quest API 不可用");
      return api.quest.skipStep({ questId });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (e) => {
      toastManager.add({ type: "error", title: "跳过步骤失败", description: e instanceof Error ? e.message : String(e) });
    },
  });

  const retryMutation = useMutation({
    mutationFn: async (questId: string) => {
      const api = readNativeApi();
      if (!api?.quest) throw new Error("Quest API 不可用");
      return api.quest.retryStep({ questId });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (e) => {
      toastManager.add({ type: "error", title: "重试步骤失败", description: e instanceof Error ? e.message : String(e) });
    },
  });

  const handleAction = useCallback(
    (action: string, questId: string) => {
      switch (action) {
        case "quest_start":
          void startMutation.mutate(questId);
          break;
        case "quest_pause":
          void pauseMutation.mutate(questId);
          break;
        case "quest_resume":
          void resumeMutation.mutate(questId);
          break;
        case "quest_abort":
          void abortMutation.mutate(questId);
          break;
        case "quest_skip_step":
          void skipMutation.mutate(questId);
          break;
        case "quest_retry_step":
          void retryMutation.mutate(questId);
          break;
      }
    },
    [startMutation, pauseMutation, resumeMutation, abortMutation, skipMutation, retryMutation],
  );

  // ==================== Render ====================

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground">
        <PiSpinner className="animate-spin mr-2" size={20} />
        加载中...
      </div>
    );
  }

  if (!quests || quests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
        <PiListChecks size={32} className="opacity-50" />
        <p className="text-sm">暂无活跃 Quest</p>
        <p className="text-xs text-muted-foreground/70">
          在 Agent 模式下使用 Quest 创建多步骤任务
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-2" data-testid="quest-panel">
      {/* Quest List */}
      {quests.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
              {quests.map((q) => (
            <button
              key={q.id}
              onClick={() => setSelectedQuestId(q.id)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap",
                selectedQuest?.id === q.id
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "bg-muted/50 border-transparent text-muted-foreground hover:bg-muted",
              )}
            >
              {q.title}
            </button>
          ))}
        </div>
      )}

      {/* Quest Detail */}
      {selectedQuest && (
        <Card key={selectedQuest.id}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <CardTitle className="text-base truncate">{selectedQuest.title}</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                  {selectedQuest.description}
                </p>
              </div>
              <Badge
                variant="outline"
                className={cn("shrink-0", STATUS_COLORS[selectedQuest.status] ?? "")}
              >
                {STATUS_LABELS[selectedQuest.status] ?? selectedQuest.status}
              </Badge>
            </div>

            {/* Progress Bar */}
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{
                    width: selectedQuest.steps.length > 0
                      ? `${(selectedQuest.steps.filter((s) => s.status === "completed" || s.status === "skipped").length / selectedQuest.steps.length) * 100}%`
                      : "0%",
                  }}
                />
              </div>
              <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                {selectedQuest.steps.filter((s) => s.status === "completed" || s.status === "skipped").length}
                /{selectedQuest.steps.length}
              </span>
            </div>

            {/* Time Info */}
            <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
              {selectedQuest.startedAt && (
                <span className="flex items-center gap-1">
                  <PiClock size={11} />
                  开始 {formatTime(selectedQuest.startedAt)}
                </span>
              )}
              {selectedQuest.completedAt && (
                <span className="flex items-center gap-1">
                  <PiCheckCircle size={11} />
                  完成 {formatTime(selectedQuest.completedAt)}
                </span>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {selectedQuest.status === "created" && (
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => handleAction("quest_start", selectedQuest.id)}
                  disabled={startMutation.isPending}
                >
                  <PiPlay size={14} className="mr-1" /> 启动
                </Button>
              )}
              {selectedQuest.status === "running" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAction("quest_pause", selectedQuest.id)}
                  disabled={pauseMutation.isPending}
                >
                  <PiPause size={14} className="mr-1" /> 暂停
                </Button>
              )}
              {selectedQuest.status === "paused" && (
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => handleAction("quest_resume", selectedQuest.id)}
                  disabled={resumeMutation.isPending}
                >
                  <PiPlay size={14} className="mr-1" /> 恢复
                </Button>
              )}
              {(selectedQuest.status === "running" || selectedQuest.status === "paused") && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAction("quest_skip_step", selectedQuest.id)}
                    disabled={skipMutation.isPending}
                  >
                    <PiSkipForward size={14} className="mr-1" /> 跳过
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAction("quest_retry_step", selectedQuest.id)}
                    disabled={retryMutation.isPending}
                  >
                    <PiArrowsClockwise size={14} className="mr-1" /> 重试
                  </Button>
                </>
              )}
              {!["completed", "aborted", "failed"].includes(selectedQuest.status) && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-500 hover:text-red-600"
                  onClick={() => handleAction("quest_abort", selectedQuest.id)}
                  disabled={abortMutation.isPending}
                >
                  <PiStop size={14} className="mr-1" /> 中止
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent className="pt-0">
            {/* Step Timeline */}
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-1.5" data-testid="quest-step-timeline">
                {selectedQuest.steps.map((step, idx) => (
                  <div
                    key={step.id}
                    className={cn(
                      "flex items-start gap-2 p-2 rounded-lg transition-colors",
                      idx === selectedQuest.currentStepIndex && step.status === "running"
                        ? "bg-green-500/5"
                        : "",
                    )}
                  >
                    <div className="mt-0.5">
                      <StepIcon status={step.status} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "text-xs font-medium",
                            step.status === "pending" && "text-muted-foreground",
                            step.status === "completed" && "text-emerald-700 dark:text-emerald-400",
                            step.status === "failed" && "text-red-700 dark:text-red-400",
                            step.status === "skipped" && "text-gray-500 line-through",
                          )}
                        >
                          {step.index + 1}. {step.title}
                        </span>
                        {idx === selectedQuest.currentStepIndex && step.status === "running" && (
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4">
                            当前
                          </Badge>
                        )}
                      </div>
                      {step.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {step.description}
                        </p>
                      )}
                      {step.errorMessage && (
                        <p className="text-xs text-red-500 mt-0.5 line-clamp-2">
                          {step.errorMessage}
                        </p>
                      )}
                      {/* Time info for running/completed steps */}
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground/70">
                        {step.startedAt && <span>开始 {formatTime(step.startedAt)}</span>}
                        {step.completedAt && <span>完成 {formatTime(step.completedAt)}</span>}
                      </div>
                      {/* Artifacts */}
                      {step.artifacts.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {step.artifacts.map((a, i) => (
                            <Badge key={i} variant="secondary" className="text-[10px] py-0 px-1.5 h-4 gap-0.5">
                              <PiFileText size={9} />
                              {a}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            {/* Abort Reason */}
            {selectedQuest.abortReason && (
              <div className="mt-2 p-2 rounded-lg bg-red-500/5 border border-red-500/10">
                <p className="text-xs text-red-600">
                  中止原因: {selectedQuest.abortReason}
                </p>
              </div>
            )}

            {/* Spec Preview */}
            {selectedQuest.description && selectedQuest.steps.length > 0 && (
              <details className="mt-2 group">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                  <PiFileText size={12} />
                  Spec 文档预览
                </summary>
                <div className="mt-1.5 p-2.5 rounded-lg bg-muted/30 border border-border/40 text-xs space-y-1.5">
                  <div>
                    <span className="font-medium text-foreground">标题: </span>
                    <span className="text-muted-foreground">{selectedQuest.title}</span>
                  </div>
                  <div>
                    <span className="font-medium text-foreground">描述: </span>
                    <span className="text-muted-foreground">{selectedQuest.description}</span>
                  </div>
                  <div>
                    <span className="font-medium text-foreground">步骤:</span>
                    <ol className="ml-4 mt-0.5 list-decimal space-y-0.5">
                      {selectedQuest.steps.map((s) => (
                        <li key={s.id} className="text-muted-foreground">
                          {s.title}
                          {s.description ? ` — ${s.description}` : ""}
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              </details>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
});
