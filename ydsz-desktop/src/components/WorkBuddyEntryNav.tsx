/**
 * @file WorkBuddyEntryNav — Work Buddy 风格入口导航
 *
 * 实现 Work Buddy 的四层入口分层模型：
 *
 * - **助理 (Assistant)**：持续性的个人任务，有稳定身份和上下文
 * - **项目 (Project)**：多人围绕同一目标组织材料和任务
 * - **专家/专家团 (Expert/Team)**：用特定角色和方法完成任务
 * - **自动化 (Automation)**：按固定时间触发已稳定的流程
 *
 * ## 与原有 InteractionMode 的映射
 *
 * | 原模式 | 新入口 | 说明 |
 * |--------|--------|------|
 * | Chat | 助理 | 日常对话和任务 |
 * | Plan | 项目 | 多步骤规划协作 |
 * | Agent | 专家 | 专业角色执行 |
 * | Review | 专家 | 评审角色 |
 * | Task | 自动化 | 定时/重复任务 |
 *
 * ## 核心能力
 *
 * - 四层入口快速切换
 * - 最近使用记录
 * - 智能推荐入口（根据当前时间/上下文）
 * - 工作空间管理
 */

import { useCallback, useState, useMemo } from "react";
import {
  User,
  FolderKanban,
  Users,
  Clock,
  ChevronRight,
  Plus,
  Settings,
  Search,
  Sparkles,
  History,
  Star,
  Bookmark,
} from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";
import { cn } from "~/lib/utils";

// ==================== Types ====================

/** 入口层级类型 */
export type EntryLayer = "assistant" | "project" | "expert" | "automation";

/** 入口配置 */
interface EntryLayerConfig {
  id: EntryLayer;
  name: string;
  description: string;
  icon: React.FC<{ className?: string }>;
  colorClass: string;
  bgClass: string;
  examples: string[];
}

/** 最近使用记录 */
interface RecentEntry {
  id: string;
  name: string;
  layer: EntryLayer;
  lastUsed: number;
  thumbnail?: string;
}

// ==================== Constants ====================

const ENTRY_LAYERS: EntryLayerConfig[] = [
  {
    id: "assistant",
    name: "助理",
    description: "持续性的个人任务，记住您的偏好和工作上下文",
    icon: User,
    colorClass: "text-blue-500",
    bgClass: "bg-blue-500/10",
    examples: ["日报整理", "信息归档", "资料收集", "邮件处理"],
  },
  {
    id: "project",
    name: "项目",
    description: "多人围绕同一目标组织材料、任务和协作",
    icon: FolderKanban,
    colorClass: "text-emerald-500",
    bgClass: "bg-emerald-500/10",
    examples: ["产品官网重设计", "Q3 营销策划", "用户增长计划"],
  },
  {
    id: "expert",
    name: "专家",
    description: "用特定角色和方法完成任务，支持专家团多角色协作",
    icon: Users,
    colorClass: "text-purple-500",
    bgClass: "bg-purple-500/10",
    examples: ["架构师评审", "产品经理分析", "设计师出图"],
  },
  {
    id: "automation",
    name: "自动化",
    description: "按固定时间触发已稳定重复的流程，无需人工干预",
    icon: Clock,
    colorClass: "text-amber-500",
    bgClass: "bg-amber-500/10",
    examples: ["每日早报", "周报生成", "数据监控", "定时巡检"],
  },
];

const MOCK_RECENTS: RecentEntry[] = [
  { id: "r1", name: "周报自动整理", layer: "automation", lastUsed: Date.now() - 3600000 },
  { id: "r2", name: "产品官网重设计", layer: "project", lastUsed: Date.now() - 7200000 },
  { id: "r3", name: "日报归档", layer: "assistant", lastUsed: Date.now() - 86400000 },
];

// ==================== Layer Card ====================

interface LayerCardProps {
  layer: EntryLayerConfig;
  isActive: boolean;
  onClick: (id: EntryLayer) => void;
  recentCount: number;
}

function LayerCard({ layer, isActive, onClick, recentCount }: LayerCardProps) {
  const Icon = layer.icon;

  return (
    <button
      type="button"
      onClick={() => onClick(layer.id)}
      className={cn(
        "group flex w-full flex-col gap-3 rounded-xl border p-4 text-left transition-all",
        isActive
          ? "border-border bg-card shadow-sm"
          : "border-border/50 bg-card/40 hover:border-border hover:bg-card/60",
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex size-10 items-center justify-center rounded-xl",
            layer.bgClass,
          )}
        >
          <Icon className={cn("size-5", layer.colorClass)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[14px] font-semibold text-foreground">{layer.name}</p>
            {recentCount > 0 && (
              <Badge variant="secondary" className="text-[9px]">
                {recentCount}
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground/70">{layer.description}</p>
        </div>
        <ChevronRight className="size-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
      </div>

      {/* Examples */}
      <div className="flex flex-wrap gap-1.5">
        {layer.examples.slice(0, 3).map((example) => (
          <span
            key={example}
            className="rounded-full bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground/60"
          >
            {example}
          </span>
        ))}
      </div>
    </button>
  );
}

// ==================== Main Component ====================

export function WorkBuddyEntryNav({
  activeLayer,
  onLayerChange,
  onSearch,
}: {
  activeLayer: EntryLayer;
  onLayerChange: (layer: EntryLayer) => void;
  onSearch?: (query: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
      onSearch?.(query);
    },
    [onSearch],
  );

  // 按层级统计最近使用
  const recentByLayer = useMemo(() => {
    const counts: Record<EntryLayer, number> = {
      assistant: 0,
      project: 0,
      expert: 0,
      automation: 0,
    };
    for (const entry of MOCK_RECENTS) {
      counts[entry.layer]++;
    }
    return counts;
  }, []);

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="space-y-3 border-b border-border p-4">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
            <Sparkles className="size-4 text-primary" />
          </div>
          <h2 className="text-[14px] font-semibold text-foreground">工作入口</h2>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="搜索任务、项目、专家..."
            className="h-9 pl-9 text-[12px]"
          />
        </div>

        {/* Quick Stats */}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground/60">
          <div className="flex items-center gap-1">
            <History className="size-3" />
            12 个最近
          </div>
          <div className="flex items-center gap-1">
            <Star className="size-3" />
            5 个收藏
          </div>
        </div>
      </div>

      {/* Layer Cards */}
      <ScrollArea className="flex-1">
        <div className="space-y-2 p-4">
          <p className="mb-2 text-[11px] font-medium text-muted-foreground/50">选择工作方式</p>
          {ENTRY_LAYERS.map((layer) => (
            <LayerCard
              key={layer.id}
              layer={layer}
              isActive={activeLayer === layer.id}
              onClick={onLayerChange}
              recentCount={recentByLayer[layer.id]}
            />
          ))}
        </div>

        {/* Recent Section */}
        <div className="border-t border-border p-4">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground/50">
            <History className="size-3" />
            最近使用
          </p>
          <div className="space-y-1">
            {MOCK_RECENTS.map((entry) => {
              const layer = ENTRY_LAYERS.find((l) => l.id === entry.layer)!;
              return (
                <button
                  key={entry.id}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/30"
                >
                  <div
                    className={cn(
                      "flex size-6 items-center justify-center rounded-md",
                      layer.bgClass,
                    )}
                  >
                    <layer.icon className={cn("size-3", layer.colorClass)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] text-foreground/80">{entry.name}</p>
                    <p className="text-[10px] text-muted-foreground/50">
                      {formatTimeAgo(entry.lastUsed)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </ScrollArea>

      {/* Footer Actions */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-7 flex-1 gap-1 text-[11px]">
            <Plus className="size-3" />
            新建
          </Button>
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-[11px]">
            <Bookmark className="size-3" />
            收藏
          </Button>
          <Button variant="ghost" size="icon-sm" className="size-7">
            <Settings className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ==================== Helpers ====================

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  return `${days} 天前`;
}

export { ENTRY_LAYERS };
export type { EntryLayerConfig, RecentEntry };
