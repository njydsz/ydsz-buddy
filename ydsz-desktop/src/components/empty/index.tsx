/**
 * @file 业务空状态组件库
 *
 * 提供 8 个高 ROI 的业务空状态组件，用于改善新用户体验：
 *
 * - EmptyWorkspace: 工作区空状态
 * - EmptyProvider: 提供商空状态
 * - EmptyProject: 项目空状态
 * - EmptySearch: 搜索空状态
 * - EmptyScheduler: 定时任务空状态
 * - EmptySkill: 技能空状态
 * - EmptyDiff: 差异空状态
 * - EmptyApprovals: 审批空状态
 *
 * 每个组件包含：图标 + 1 句说明 + 1 主操作 + 1 次操作
 */

import { memo, type ReactNode } from "react";
import {
  PiFolderOpen,
  PiRobot,
  PiFolder,
  PiMagnifyingGlass,
  PiCalendar,
  PiLightbulb,
  PiGitDiff,
  PiCheckCircle,
} from "react-icons/pi";
import { Button } from "../ui/button";
import { cn } from "~/lib/utils";

interface EmptyStateProps {
  /** 图标 */
  icon?: ReactNode;
  /** 标题 */
  title: string;
  /** 描述 */
  description?: string;
  /** 主操作按钮 */
  primaryAction?: {
    label: string;
    onClick: () => void;
  };
  /** 次操作按钮 */
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  /** 自定义类名 */
  className?: string;
}

/**
 * 通用空状态基础组件
 */
function EmptyStateBase({
  icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-lg border border-border bg-card/50 p-8 text-center",
        className,
      )}
      data-slot="empty-state"
    >
      {icon && (
        <div className="flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {icon}
        </div>
      )}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        {description && (
          <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {(primaryAction || secondaryAction) && (
        <div className="flex items-center gap-2">
          {primaryAction && (
            <Button size="sm" onClick={primaryAction.onClick}>
              {primaryAction.label}
            </Button>
          )}
          {secondaryAction && (
            <Button size="sm" variant="outline" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 工作区空状态
 */
export const EmptyWorkspace = memo(function EmptyWorkspace({
  onCreateWorkspace,
  onBrowseTemplates,
}: {
  onCreateWorkspace: () => void;
  onBrowseTemplates: () => void;
}) {
  return (
    <EmptyStateBase
      icon={<PiFolderOpen className="size-8" />}
      title="还没有工作区"
      description="创建工作区开始管理您的项目和任务"
      primaryAction={{ label: "创建工作区", onClick: onCreateWorkspace }}
      secondaryAction={{ label: "浏览模板", onClick: onBrowseTemplates }}
    />
  );
});

/**
 * 提供商空状态
 */
export const EmptyProvider = memo(function EmptyProvider({
  onAddProvider,
  onLearnMore,
}: {
  onAddProvider: () => void;
  onLearnMore: () => void;
}) {
  return (
    <EmptyStateBase
      icon={<PiRobot className="size-8" />}
      title="还没有配置提供商"
      description="添加 AI 提供商以开始使用 ydsz-buddy"
      primaryAction={{ label: "添加提供商", onClick: onAddProvider }}
      secondaryAction={{ label: "了解更多", onClick: onLearnMore }}
    />
  );
});

/**
 * 项目空状态
 */
export const EmptyProject = memo(function EmptyProject({
  onCreateProject,
  onImportProject,
}: {
  onCreateProject: () => void;
  onImportProject: () => void;
}) {
  return (
    <EmptyStateBase
      icon={<PiFolder className="size-8" />}
      title="还没有项目"
      description="创建或导入项目开始协作"
      primaryAction={{ label: "创建项目", onClick: onCreateProject }}
      secondaryAction={{ label: "导入项目", onClick: onImportProject }}
    />
  );
});

/**
 * 搜索空状态
 */
export const EmptySearch = memo(function EmptySearch({
  query,
  onClearSearch,
  onBrowseAll,
}: {
  query: string;
  onClearSearch: () => void;
  onBrowseAll: () => void;
}) {
  return (
    <EmptyStateBase
      icon={<PiMagnifyingGlass className="size-8" />}
      title="没有找到匹配结果"
      description={`未找到与 "${query}" 相关的内容`}
      primaryAction={{ label: "清除搜索", onClick: onClearSearch }}
      secondaryAction={{ label: "浏览全部", onClick: onBrowseAll }}
    />
  );
});

/**
 * 定时任务空状态
 */
export const EmptyScheduler = memo(function EmptyScheduler({
  onCreateTask,
  onBrowseTemplates,
}: {
  onCreateTask: () => void;
  onBrowseTemplates: () => void;
}) {
  return (
    <EmptyStateBase
      icon={<PiCalendar className="size-8" />}
      title="还没有定时任务"
      description="创建定时任务自动化重复工作"
      primaryAction={{ label: "创建任务", onClick: onCreateTask }}
      secondaryAction={{ label: "浏览模板", onClick: onBrowseTemplates }}
    />
  );
});

/**
 * 技能空状态
 */
export const EmptySkill = memo(function EmptySkill({
  onAddSkill,
  onBrowseMarketplace,
}: {
  onAddSkill: () => void;
  onBrowseMarketplace: () => void;
}) {
  return (
    <EmptyStateBase
      icon={<PiLightbulb className="size-8" />}
      title="还没有技能"
      description="添加技能扩展 ydsz-buddy 的能力"
      primaryAction={{ label: "添加技能", onClick: onAddSkill }}
      secondaryAction={{ label: "浏览市场", onClick: onBrowseMarketplace }}
    />
  );
});

/**
 * 差异空状态
 */
export const EmptyDiff = memo(function EmptyDiff({
  onRefresh,
  onViewHistory,
}: {
  onRefresh: () => void;
  onViewHistory: () => void;
}) {
  return (
    <EmptyStateBase
      icon={<PiGitDiff className="size-8" />}
      title="没有差异"
      description="当前没有检测到文件变更"
      primaryAction={{ label: "刷新", onClick: onRefresh }}
      secondaryAction={{ label: "查看历史", onClick: onViewHistory }}
    />
  );
});

/**
 * 审批空状态
 */
export const EmptyApprovals = memo(function EmptyApprovals({
  onRefresh,
  onViewHistory,
}: {
  onRefresh: () => void;
  onViewHistory: () => void;
}) {
  return (
    <EmptyStateBase
      icon={<PiCheckCircle className="size-8" />}
      title="没有待审批项"
      description="当前没有需要审批的任务"
      primaryAction={{ label: "刷新", onClick: onRefresh }}
      secondaryAction={{ label: "查看历史", onClick: onViewHistory }}
    />
  );
});
