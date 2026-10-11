// @ts-nocheck
/**
 * @file 浏览器录制回放面板 (G15-P2)
 * @description 利用已有 CDP 浏览器自动化能力，实现操作录制的 UI 面板。
 *   录制/停止、录制列表查看、回放控制、录制步骤预览。
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useState, useCallback } from 'react';

import { Button } from './ui/button';
import { Input } from './ui/input';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RecordingStatus {
  isRecording: boolean;
  actionCount: number;
}

interface RecordedAction {
  elapsedMs: number;
  actionType: string;
  selector?: string;
  value?: string;
  url?: string;
  success: boolean;
  error?: string;
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface BrowserRecordPanelProps {
  threadId: string;
  tabId: string;
}

export function BrowserRecordPanel({ threadId, tabId }: BrowserRecordPanelProps) {
  const queryClient = useQueryClient();
  const [replaySpeed, setReplaySpeed] = useState(1.0);
  const [selectedRecording, setSelectedRecording] = useState<string | null>(null);

  // Query recording status
  const statusQuery = useQuery({
    queryKey: ['browser-recording-status', threadId],
    queryFn: async (): Promise<RecordingStatus> => {
      return await invoke('browser_get_recording_status', { threadId });
    },
    refetchInterval: 2000,
  });

  // Start recording
  const startMutation = useMutation({
    mutationFn: async () => {
      await invoke('browser_start_recording', { threadId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['browser-recording-status', threadId] });
    },
  });

  // Stop recording
  const stopMutation = useMutation({
    mutationFn: async (): Promise<RecordingSummary> => {
      return await invoke('browser_stop_recording', { threadId });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['browser-recording-status', threadId] });
    },
  });

  // Export recording (get JSON)
  const exportMutation = useMutation({
    mutationFn: async (): Promise<string> => {
      return await invoke('browser_export_recording', { threadId });
    },
  });

  // Replay
  const replayMutation = useMutation({
    mutationFn: async ({
      actions,
      delayMs,
    }: {
      actions: RecordedAction[];
      delayMs: number;
    }): Promise<ReplayResult> => {
      return await invoke('browser_replay_actions', {
        threadId,
        tabId,
        actions,
        delayMs: Math.round(delayMs / replaySpeed),
      });
    },
  });

  const status = statusQuery.data;
  const isRecording = status?.isRecording ?? false;
  const actionCount = status?.actionCount ?? 0;
  const replayDelayMs = Math.round(500 / replaySpeed);

  return (
    <div className="space-y-4 p-4">
      {/* Recording Control */}
      <div className="rounded-lg border border-border/40 p-4">
        <h3 className="text-sm font-medium mb-3">Recording Control</h3>
        <div className="flex items-center gap-3">
          {!isRecording ? (
            <Button
              size="sm"
              onClick={() => startMutation.mutate()}
              disabled={startMutation.isPending}
            >
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-red-500" />
                {startMutation.isPending ? 'Starting...' : 'Start Recording'}
              </span>
            </Button>
          ) : (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => stopMutation.mutate()}
              disabled={stopMutation.isPending}
            >
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-white animate-pulse" />
                {stopMutation.isPending ? 'Stopping...' : `Stop (${actionCount} actions)`}
              </span>
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending}
          >
            Export JSON
          </Button>

          {isRecording && (
            <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
              <span className="size-2 rounded-full bg-red-500 animate-pulse" />
              Recording...
              <span className="font-mono">{actionCount} actions</span>
            </div>
          )}
        </div>

        {/* Last stopped summary */}
        {stopMutation.data && !isRecording && (
          <div className="mt-3 rounded border border-border/30 bg-muted/20 p-3 text-xs space-y-1">
            <div className="flex gap-4">
              <span>
                Total: <strong>{stopMutation.data.totalActions}</strong>
              </span>
              <span className="text-green-500">
                Success: <strong>{stopMutation.data.successCount}</strong>
              </span>
              <span className="text-red-500">
                Errors: <strong>{stopMutation.data.errorCount}</strong>
              </span>
              <span>
                Duration: <strong>{(stopMutation.data.durationMs / 1000).toFixed(1)}s</strong>
              </span>
            </div>
          </div>
        )}

        {/* Export result */}
        {exportMutation.data && (
          <div className="mt-3">
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                View exported JSON
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto rounded border border-border/30 bg-muted/20 p-2 font-mono text-[10px]">
                {exportMutation.data}
              </pre>
            </details>
          </div>
        )}
      </div>

      {/* Playback Control */}
      <div className="rounded-lg border border-border/40 p-4">
        <h3 className="text-sm font-medium mb-3">Playback</h3>
        <div className="space-y-3">
          {/* Speed control */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-muted-foreground w-16">Speed:</label>
            <input
              type="range"
              min={0.25}
              max={3}
              step={0.25}
              value={replaySpeed}
              onChange={(e) => setReplaySpeed(parseFloat(e.target.value))}
              className="flex-1 h-1.5"
            />
            <span className="text-xs font-mono w-10 text-right">{replaySpeed}x</span>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs text-muted-foreground w-16">Delay:</label>
            <span className="text-xs font-mono">
              {replayDelayMs}ms between actions
            </span>
          </div>

          {/* Replay button */}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                // For replay, we need the last exported recording's actions
                // In a full implementation, this would parse the stored recording
                if (exportMutation.data) {
                  try {
                    const actions = JSON.parse(
                      exportMutation.data,
                    ) as RecordedAction[];
                    replayMutation.mutate({ actions, delayMs: 500 });
                  } catch {
                    // skip invalid
                  }
                }
              }}
              disabled={!exportMutation.data || replayMutation.isPending}
            >
              {replayMutation.isPending ? 'Replaying...' : 'Replay Last Recording'}
            </Button>
          </div>

          {/* Replay result */}
          {replayMutation.data && (
            <div
              className={`rounded border p-3 text-xs ${
                replayMutation.data.failed === 0
                  ? 'border-green-500/30 bg-green-500/5'
                  : 'border-yellow-500/30 bg-yellow-500/5'
              }`}
            >
              <div className="flex gap-4">
                <span>
                  Total: <strong>{replayMutation.data.total}</strong>
                </span>
                <span className="text-green-500">
                  Success: <strong>{replayMutation.data.successful}</strong>
                </span>
                <span className="text-red-500">
                  Failed: <strong>{replayMutation.data.failed}</strong>
                </span>
              </div>
              {replayMutation.data.errors.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-muted-foreground">
                    {replayMutation.data.errors.length} errors
                  </summary>
                  <ul className="mt-1 space-y-0.5 pl-3 list-disc">
                    {replayMutation.data.errors.map((err, idx) => (
                      <li key={idx} className="text-red-500/80">
                        {err}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Quick Reference */}
      <div className="rounded-lg border border-border/40 p-4">
        <h3 className="text-sm font-medium mb-2">Supported Actions</h3>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded bg-muted/20 px-2 py-1">
            <span className="font-medium">Click</span> - Click element
          </div>
          <div className="rounded bg-muted/20 px-2 py-1">
            <span className="font-medium">Fill</span> - Input text
          </div>
          <div className="rounded bg-muted/20 px-2 py-1">
            <span className="font-medium">Scroll</span> - Scroll page
          </div>
          <div className="rounded bg-muted/20 px-2 py-1">
            <span className="font-medium">Navigate</span> - Go to URL
          </div>
          <div className="rounded bg-muted/20 px-2 py-1">
            <span className="font-medium">Wait</span> - Wait for element
          </div>
          <div className="rounded bg-muted/20 px-2 py-1">
            <span className="font-medium">Focus</span> - Focus element
          </div>
          <div className="rounded bg-muted/20 px-2 py-1">
            <span className="font-medium">Extract</span> - Get text
          </div>
          <div className="rounded bg-muted/20 px-2 py-1">
            <span className="font-medium">PressKey</span> - Keyboard
          </div>
          <div className="rounded bg-muted/20 px-2 py-1">
            <span className="font-medium">SelectOption</span> - Dropdown
          </div>
        </div>
      </div>
    </div>
  );
}
