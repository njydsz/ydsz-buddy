/**
 * @file AcpRunnerSettings.tsx
 * @description ACP Runner 管理面板（G10-P1）
 * 管理入站 stdio 服务和出站 Runner 配置。
 */

interface AcpRunnerSettingsProps {
  onClose?: () => void;
}

export function AcpRunnerSettings({ onClose }: AcpRunnerSettingsProps) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">ACP Runner</h2>
        {onClose && (
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            关闭
          </button>
        )}
      </div>

      <div className="text-sm text-foreground space-y-2">
        <div className="rounded border border-border p-3">
          <div className="flex justify-between items-center">
            <div>
              <div className="font-medium">入站服务</div>
              <div className="text-muted-foreground text-xs mt-0.5">
                启动 stdio 服务以供 IDE Agent 调用
              </div>
            </div>
            <button className="px-3 py-1 text-xs rounded bg-green-600 text-white hover:bg-green-700">
              启动
            </button>
          </div>
        </div>

        <div className="rounded border border-border p-3">
          <div className="font-medium mb-2">出站 Runner</div>
          <div className="text-xs text-muted-foreground mb-3">
            配置外部 Agent 命令用于任务委派。
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between rounded border border-border p-2">
              <div>
                <div className="text-sm font-medium">Claude Code</div>
                <div className="text-xs text-muted-foreground">claude</div>
              </div>
              <span className="text-xs text-green-500">就绪</span>
            </div>
            <div className="flex items-center justify-between rounded border border-border p-2">
              <div>
                <div className="text-sm font-medium">Code CLI</div>
                <div className="text-xs text-muted-foreground">codegen</div>
              </div>
              <span className="text-xs text-muted-foreground">未配置</span>
            </div>
          </div>

          <button className="mt-2 text-xs text-primary hover:underline">
            + 添加 Runner
          </button>
        </div>
      </div>
    </div>
  );
}
