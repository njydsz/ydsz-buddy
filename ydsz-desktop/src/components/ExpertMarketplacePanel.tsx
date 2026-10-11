/**
 * @file ExpertMarketplacePanel.tsx
 * @description 专家市场面板（G11-P2）
 * 展示已安装专家列表，支持导入/导出操作。
 */
import { useState } from "react";

interface ExpertMarketplacePanelProps {
  onClose?: () => void;
}

export function ExpertMarketplacePanel({ onClose }: ExpertMarketplacePanelProps) {
  const [action, setAction] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">专家市场</h2>
        {onClose && (
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            关闭
          </button>
        )}
      </div>

      <div className="text-sm text-muted-foreground">
        管理已安装的专家（Agent Bundle），支持导出和分享给团队。
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setAction("import")}
          className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90"
        >
          导入专家
        </button>
        <button
          onClick={() => setAction("create")}
          className="px-3 py-1.5 text-sm rounded border border-border hover:bg-accent"
        >
          创建专家
        </button>
      </div>

      {action === "import" && (
        <div className="rounded border border-border p-4">
          <p className="text-sm text-muted-foreground">
            选择导出的专家压缩包（.zip）进行导入。
          </p>
          <input
            type="file"
            accept=".zip"
            className="mt-2 text-sm"
            onChange={() => setAction(null)}
          />
        </div>
      )}

      {action === "create" && (
        <div className="rounded border border-border p-4 space-y-3">
          <input
            type="text"
            placeholder="专家名称"
            className="w-full px-3 py-1.5 text-sm rounded border border-border bg-background"
          />
          <textarea
            placeholder="描述这个专家的能力..."
            className="w-full px-3 py-1.5 text-sm rounded border border-border bg-background min-h-[80px]"
          />
          <button className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground">
            保存并开始编辑
          </button>
        </div>
      )}

      <div className="rounded border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        暂无已安装专家。通过上方按钮导入或创建。
      </div>
    </div>
  );
}
