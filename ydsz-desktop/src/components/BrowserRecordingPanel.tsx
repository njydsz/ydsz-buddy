/**
 * @file 浏览器录制面板
 *
 * 浏览器操作录制与回放控制 UI。
 *
 * 功能：
 * - 录制按钮：开始/停止录制浏览器操作
 * - 录制状态指示：录制中 / 操作计数
 * - 操作历史展示：已录制的操作列表
 * - 回放控制：回放已保存的操作序列
 * - 导出/导入：导出录制为 JSON 文件
 */

import { useCallback, useState, useEffect, useRef } from "react";
import { cn } from "~/lib/utils";
import { PlayIcon, DownloadIcon, UploadIcon, Trash2Icon, LoaderCircleIcon } from "~/lib/icons";
import { Circle, Square } from "lucide-react";
import { anchoredToastManager } from "./ui/toast";

// ============================================================================
// 类型定义
// ============================================================================

interface RecordedAction {
  elapsedMs: number;
  actionType: string;
  selector?: string;
  value?: string;
  url?: string;
  success: boolean;
  error?: string;
}

interface RecordingState {
  isRecording: boolean;
  actionCount: number;
}

interface RecordingSummary {
  totalActions: number;
  successCount: number;
  errorCount: number;
  durationMs: number;
  threadId: string;
}

interface ReplayResult {
  total: number;
  successful: number;
  failed: number;
  failedActions: number[];
  errors: string[];
}

// ============================================================================
// 组件
// ============================================================================

interface BrowserRecordingPanelProps {
  threadId: string;
  tabId?: string;
}

export function BrowserRecordingPanel({ threadId, tabId }: BrowserRecordingPanelProps) {
  const [recordingState, setRecordingState] = useState<RecordingState>({
    isRecording: false,
    actionCount: 0,
  });
  const [actions, setActions] = useState<RecordedAction[]>([]);
  const [replaying, setReplaying] = useState(false);
  const [replayResult, setReplayResult] = useState<ReplayResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Poll recording status while recording is active
  useEffect(() => {
    if (!recordingState.isRecording) return;

    const interval = setInterval(async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const status = await invoke<RecordingState>("browser_get_recording_status", {
          threadId,
        });
        setRecordingState(status);
      } catch {
        // ignore polling errors
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [recordingState.isRecording, threadId]);

  const handleStartRecording = useCallback(async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("browser_start_recording", { threadId });
      setRecordingState({ isRecording: true, actionCount: 0 });
      setActions([]);
      anchoredToastManager.add({ type: "success", title: "已开始录制浏览器操作" });
    } catch (e) {
      anchoredToastManager.add({ type: "error", title: `开始录制失败: ${String(e)}` });
    }
  }, [threadId]);

  const handleStopRecording = useCallback(async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const summary = await invoke<RecordingSummary>("browser_stop_recording", {
        threadId,
      });
      setRecordingState({ isRecording: false, actionCount: 0 });
      anchoredToastManager.add({
        type: "success",
        title: `录制完成: ${summary.totalActions} 个操作 (${summary.successCount} 成功, ${summary.errorCount} 失败)`,
      });
    } catch (e) {
      anchoredToastManager.add({ type: "error", title: `停止录制失败: ${String(e)}` });
    }
  }, [threadId]);

  const handleReplay = useCallback(async () => {
    if (actions.length === 0 || !tabId) return;

    setReplaying(true);
    setReplayResult(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<ReplayResult>("browser_replay_actions", {
        threadId,
        tabId,
        actions,
        delayMs: 500,
      });
      setReplayResult(result);
      if (result.failed === 0) {
        anchoredToastManager.add({ type: "success", title: `回放完成: ${result.successful}/${result.total} 成功` });
      } else {
        anchoredToastManager.add({
          type: "warning",
          title: `回放完成: ${result.successful}/${result.total} 成功, ${result.failed} 失败`,
        });
      }
    } catch (e) {
      anchoredToastManager.add({ type: "error", title: `回放失败: ${String(e)}` });
    } finally {
      setReplaying(false);
    }
  }, [threadId, tabId, actions]);

  const handleExport = useCallback(async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const json = await invoke<string>("browser_export_recording", {
        threadId,
      });
      // Create download blob
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `browser-recording-${threadId}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      anchoredToastManager.add({ type: "success", title: "导出录制成功" });
    } catch (e) {
      anchoredToastManager.add({ type: "error", title: `导出失败: ${String(e)}` });
    }
  }, [threadId]);

  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (Array.isArray(data.actions)) {
        setActions(data.actions);
        anchoredToastManager.add({ type: "success", title: `导入录制: ${data.actions.length} 个操作` });
      } else if (Array.isArray(data)) {
        setActions(data);
        anchoredToastManager.add({ type: "success", title: `导入录制: ${data.length} 个操作` });
      } else {
        anchoredToastManager.add({ type: "error", title: "无效的录制文件格式" });
      }
    } catch (err) {
      anchoredToastManager.add({ type: "error", title: `导入失败: ${String(err)}` });
    }

    // Reset input so same file can be re-imported
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleClearActions = useCallback(() => {
    setActions([]);
    setReplayResult(null);
  }, []);

  // ============================================================================
  // 渲染
  // ============================================================================

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card/90 backdrop-blur p-3 text-xs">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {recordingState.isRecording ? (
            <Circle className="h-4 w-4 text-red-500 animate-pulse" />
          ) : (
            <Circle className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="font-semibold text-foreground">
            {recordingState.isRecording ? "录制中..." : "录制回放"}
          </span>
          {recordingState.isRecording && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/15 text-red-500">
              {recordingState.actionCount} ops
            </span>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1.5">
        {!recordingState.isRecording ? (
          <button
            onClick={handleStartRecording}
            className="flex items-center gap-1 px-2 py-1 rounded bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
          >
            <Circle className="h-3 w-3" />
            录制
          </button>
        ) : (
          <button
            onClick={handleStopRecording}
            className="flex items-center gap-1 px-2 py-1 rounded bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
          >
            <Square className="h-3 w-3" />
            停止
          </button>
        )}

        <button
          onClick={handleReplay}
          disabled={replaying || actions.length === 0 || !tabId}
          className="flex items-center gap-1 px-2 py-1 rounded bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 disabled:opacity-50 transition-colors"
        >
          {replaying ? (
            <LoaderCircleIcon className="h-3 w-3 animate-spin" />
          ) : (
            <PlayIcon className="h-3 w-3" />
          )}
          回放
        </button>

        <button
          onClick={handleExport}
          disabled={!recordingState.isRecording && actions.length === 0}
          className="flex items-center gap-1 px-2 py-1 rounded bg-green-500/10 text-green-500 hover:bg-green-500/20 disabled:opacity-50 transition-colors"
        >
          <DownloadIcon className="h-3 w-3" />
          导出
        </button>

        <button
          onClick={handleImport}
          className="flex items-center gap-1 px-2 py-1 rounded bg-purple-500/10 text-purple-500 hover:bg-purple-500/20 transition-colors"
        >
          <UploadIcon className="h-3 w-3" />
          导入
        </button>

        {actions.length > 0 && (
          <button
            onClick={handleClearActions}
            className="flex items-center gap-1 px-2 py-1 rounded bg-gray-500/10 text-gray-500 hover:bg-gray-500/20 transition-colors"
          >
            <Trash2Icon className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Replay result */}
      {replayResult && (
        <div
          className={cn(
            "px-2 py-1 rounded text-xs",
            replayResult.failed === 0
              ? "bg-green-500/10 text-green-500"
              : "bg-yellow-500/10 text-yellow-500"
          )}
        >
          回放结果: {replayResult.successful}/{replayResult.total} 成功
          {replayResult.failed > 0 && `, ${replayResult.failed} 失败`}
        </div>
      )}

      {/* Action list preview */}
      {actions.length > 0 && (
        <div className="max-h-32 overflow-y-auto space-y-0.5">
          {actions.slice(0, 10).map((action, idx) => (
            <div
              key={idx}
              className={cn(
                "flex items-center gap-1.5 px-1.5 py-0.5 rounded",
                action.success ? "bg-background/50" : "bg-red-500/10"
              )}
            >
              <span className="text-muted-foreground w-5 text-right shrink-0">
                {idx + 1}
              </span>
              <span className="font-medium text-foreground shrink-0">
                {action.actionType}
              </span>
              {action.selector && (
                <span className="text-muted-foreground truncate flex-1">
                  {action.selector}
                </span>
              )}
              <span className="text-muted-foreground text-[10px] shrink-0">
                {action.elapsedMs}ms
              </span>
            </div>
          ))}
          {actions.length > 10 && (
            <div className="text-center text-muted-foreground text-[10px]">
              ...还有 {actions.length - 10} 个操作
            </div>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFileImport}
      />
    </div>
  );
}
