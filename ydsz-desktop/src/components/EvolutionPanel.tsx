/**
 * @file EvolutionPanel.tsx
 * @description 进化能力监控面板（G18-P2）
 * 展示自动生成的技能审批和进化规则。
 */
import { useState } from "react";

interface EvolutionPanelProps {
  onClose?: () => void;
}

export function EvolutionPanel({ onClose }: EvolutionPanelProps) {
  const [tab, setTab] = useState<"rules" | "skills">("rules");

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">自进化框架</h2>
        {onClose && (
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            关闭
          </button>
        )}
      </div>

      <div className="flex gap-2 border-b border-border pb-2">
        <button
          onClick={() => setTab("rules")}
          className={`px-3 py-1 text-sm rounded ${
            tab === "rules"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          进化规则
        </button>
        <button
          onClick={() => setTab("skills")}
          className={`px-3 py-1 text-sm rounded ${
            tab === "skills"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          生成技能
        </button>
      </div>

      {tab === "rules" && (
        <div className="flex flex-col gap-2">
          <div className="text-sm text-muted-foreground">
            进化规则定义何时将对话自动沉淀为可复用技能。
          </div>
          <div className="rounded border border-border p-3 text-sm">
            <div className="flex justify-between">
              <span className="font-medium">任务完成 × 3+ 轮次</span>
              <span className="text-green-500">启用</span>
            </div>
            <p className="text-muted-foreground mt-1">
              对话完成至少 3 轮交互后自动生成技能草稿。
            </p>
          </div>
          <div className="rounded border border-border p-3 text-sm">
            <div className="flex justify-between">
              <span className="font-medium">工具重复使用 × 5+</span>
              <span className="text-green-500">启用</span>
            </div>
            <p className="text-muted-foreground mt-1">
              同一工具在对话中重复使用 5 次以上时触发。
            </p>
          </div>
          <div className="rounded border border-border p-3 text-sm opacity-60">
            <div className="flex justify-between">
              <span className="font-medium">正向反馈触发</span>
              <span className="text-muted-foreground">禁用</span>
            </div>
            <p className="text-muted-foreground mt-1">
              用户给出正向反馈时自动生成（需手动启用）。
            </p>
          </div>
        </div>
      )}

      {tab === "skills" && (
        <div className="flex flex-col gap-2">
          <div className="text-sm text-muted-foreground">
            生成的技能等待审批后即可使用。
          </div>
          <div className="rounded border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            暂无生成技能。让 Agent 完成一些任务后回来查看。
          </div>
        </div>
      )}
    </div>
  );
}
