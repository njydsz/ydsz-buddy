/**
 * @file 系统服务注册面板 (G14-P2)
 * @description 支持 ydsz-buddy 注册为系统服务（systemd/launchd/Windows Service）
 * 的前端管理面板，提供安装/卸载、状态显示和开机自启开关。
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useEffect } from 'react';

import { Button } from './ui/button';
import { Switch } from './ui/switch';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ServiceStatus {
  installed: boolean;
  running: boolean | null;
  startup_enabled: boolean | null;
  platform: string;
  service_name: string;
  config_path: string | null;
  binary_path: string | null;
}

interface ServiceOperationResult {
  success: boolean;
  message: string;
}

interface ServiceInstallConfig {
  auto_start: boolean;
  port: number | null;
  log_level: string | null;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function fetchServiceStatus(): Promise<ServiceStatus> {
  return await invoke('system_service_status');
}

async function installService(config: ServiceInstallConfig): Promise<ServiceOperationResult> {
  return await invoke('system_service_install', { config });
}

async function uninstallService(): Promise<ServiceOperationResult> {
  return await invoke('system_service_uninstall');
}

async function startService(): Promise<ServiceOperationResult> {
  return await invoke('system_service_start');
}

async function stopService(): Promise<ServiceOperationResult> {
  return await invoke('system_service_stop');
}

async function restartService(): Promise<ServiceOperationResult> {
  return await invoke('system_service_restart');
}

async function setAutostart(enabled: boolean): Promise<ServiceOperationResult> {
  return await invoke('system_service_set_autostart', { enabled });
}

// ---------------------------------------------------------------------------
// Platform display names
// ---------------------------------------------------------------------------

const PLATFORM_LABELS: Record<string, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  unsupported: 'Unsupported',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SystemServicePanel() {
  const queryClient = useQueryClient();

  const statusQuery = useQuery({
    queryKey: ['system-service-status'],
    queryFn: fetchServiceStatus,
    refetchInterval: 5000, // auto-refresh every 5s
  });

  const installMutation = useMutation({
    mutationFn: installService,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-service-status'] });
    },
  });

  const uninstallMutation = useMutation({
    mutationFn: uninstallService,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-service-status'] });
    },
  });

  const startMutation = useMutation({
    mutationFn: startService,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-service-status'] });
    },
  });

  const stopMutation = useMutation({
    mutationFn: stopService,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-service-status'] });
    },
  });

  const restartMutation = useMutation({
    mutationFn: restartService,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-service-status'] });
    },
  });

  const autostartMutation = useMutation({
    mutationFn: setAutostart,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-service-status'] });
    },
  });

  const status = statusQuery.data;
  const isLoading = statusQuery.isLoading;
  const isMutating =
    installMutation.isPending ||
    uninstallMutation.isPending ||
    startMutation.isPending ||
    stopMutation.isPending ||
    restartMutation.isPending ||
    autostartMutation.isPending;

  const lastResult =
    installMutation.data ??
    uninstallMutation.data ??
    startMutation.data ??
    stopMutation.data ??
    restartMutation.data ??
    autostartMutation.data;

  const platformLabel = status ? (PLATFORM_LABELS[status.platform] || status.platform) : '...';

  return (
    <div className="space-y-6">
      {/* Status Overview */}
      <div>
        <h3 className="text-sm font-medium mb-3">Service Status</h3>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading status...</div>
        ) : status ? (
          <div className="rounded-lg border border-border/40 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Platform</span>
              <span className="text-sm font-medium">{platformLabel}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Service Name</span>
              <span className="text-sm font-mono">{status.service_name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Installed</span>
              <span
                className={`text-sm font-medium ${
                  status.installed ? 'text-green-500' : 'text-muted-foreground'
                }`}
              >
                {status.installed ? 'Yes' : 'No'}
              </span>
            </div>
            {status.running !== null && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Running</span>
                <span
                  className={`inline-flex items-center gap-1.5 text-sm font-medium ${
                    status.running ? 'text-green-500' : 'text-yellow-500'
                  }`}
                >
                  <span
                    className={`inline-block size-2 rounded-full ${
                      status.running ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'
                    }`}
                  />
                  {status.running ? 'Running' : 'Stopped'}
                </span>
              </div>
            )}
            {status.config_path && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Config Path</span>
                <span className="text-xs font-mono text-muted-foreground truncate max-w-64">
                  {status.config_path}
                </span>
              </div>
            )}
            {status.binary_path && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Binary Path</span>
                <span className="text-xs font-mono text-muted-foreground truncate max-w-64">
                  {status.binary_path}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Unable to load status</div>
        )}
      </div>

      {/* Install / Uninstall */}
      <div>
        <h3 className="text-sm font-medium mb-3">Service Management</h3>
        <div className="flex flex-wrap gap-2">
          {!status?.installed ? (
            <Button
              size="sm"
              onClick={() =>
                installMutation.mutate({
                  auto_start: true,
                  port: null,
                  log_level: 'info',
                })
              }
              disabled={isMutating || status?.platform === 'unsupported'}
            >
              {installMutation.isPending ? 'Installing...' : 'Install Service'}
            </Button>
          ) : (
            <>
              {!status.running ? (
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => startMutation.mutate()}
                  disabled={isMutating}
                >
                  {startMutation.isPending ? 'Starting...' : 'Start'}
                </Button>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => stopMutation.mutate()}
                    disabled={isMutating}
                  >
                    {stopMutation.isPending ? 'Stopping...' : 'Stop'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => restartMutation.mutate()}
                    disabled={isMutating}
                  >
                    {restartMutation.isPending ? 'Restarting...' : 'Restart'}
                  </Button>
                </>
              )}
              <Button
                size="sm"
                variant="destructive"
                onClick={() => uninstallMutation.mutate()}
                disabled={isMutating}
              >
                {uninstallMutation.isPending ? 'Uninstalling...' : 'Uninstall'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Auto-start toggle */}
      {status?.installed && status.startup_enabled !== null && (
        <div className="rounded-lg border border-border/40 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Auto-start on Boot</div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Automatically launch ydsz-buddy when the system starts
              </p>
            </div>
            <Switch
              checked={status.startup_enabled ?? false}
              onCheckedChange={(checked) => autostartMutation.mutate(checked)}
              disabled={isMutating}
            />
          </div>
        </div>
      )}

      {/* Operation Result */}
      {lastResult && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            lastResult.success
              ? 'border-green-500/30 bg-green-500/5 text-green-500'
              : 'border-red-500/30 bg-red-500/5 text-red-500'
          }`}
        >
          {lastResult.message}
        </div>
      )}

      {/* Platform hint */}
      {status?.platform === 'unsupported' && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 text-sm text-yellow-500">
          System service registration is not supported on this platform. Supported platforms:
          Windows, macOS, Linux.
        </div>
      )}

      {/* Info */}
      <div className="text-xs text-muted-foreground space-y-1">
        <p>Installing as a service requires administrator/root privileges.</p>
        <p>
          On Windows: uses <code className="font-mono">sc.exe</code> to create a Windows
          Service.
        </p>
        <p>
          On macOS: creates a LaunchAgent plist in{' '}
          <code className="font-mono">~/Library/LaunchAgents/</code>.
        </p>
        <p>
          On Linux: creates a systemd user unit in{' '}
          <code className="font-mono">~/.config/systemd/user/</code>.
        </p>
      </div>
    </div>
  );
}
