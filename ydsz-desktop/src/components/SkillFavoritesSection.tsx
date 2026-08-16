// FILE: SkillFavoritesSection.tsx
// Purpose: Hosts the SkillsView "Favorites" group: shows favorite skills in a
//          dnd-kit SortableContext, persists the order via useSkillFavorites,
//          and falls back to an empty-state hint when no skill is favorited.
// Layer: Web skill presentation component
// Exports: SkillFavoritesSection
/**
 * @file 技能收藏排序区
 *
 * 用于 SkillsView 顶部展示用户收藏的技能，并支持 dnd-kit 拖拽排序：
 *
 * - **数据**：通过 `useSkillFavorites` Hook 维护，按当前列表渲染
 * - **拖拽**：`SortableContext` + `verticalListSortingStrategy` 垂直方向
 * - **键盘可达**：`KeyboardSensor`（空格进入拖拽，方向键移动，回车确认）
 * - **屏幕阅读器**：`accessibility.announcements` 报告拖拽进度
 *
 * ## 核心导出
 *
 * - `SkillFavoritesSection`：收藏区容器
 *
 * ## 使用场景
 *
 * - SkillsView 顶部（紧邻 Tab 导航下方）
 *
 * ## 注意事项
 *
 * - 不持有收藏状态；状态由 `useSkillFavorites` 内部维护
 * - 收藏为空时隐藏整个区域，不打扰主浏览体验
 */

import { useCallback, useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToFirstScrollableAncestor, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { StarIcon, XIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";
import { Button } from "./ui/button";
import { SortableSkillCard } from "./SortableSkillCard";
import { useSkillFavorites } from "~/hooks/useSkillFavorites";

export interface FavoriteSkillDescriptor {
  /** 唯一 path，作为 dnd id */
  path: string;
  /** 标题 */
  name: string;
  /** 描述（可选） */
  description?: string | undefined;
  /** 来源标签（如 "claude", "codex"） */
  sourceLabel?: string | undefined;
}

export interface SkillFavoritesSectionProps {
  /** 收藏的 path → 描述映射表（用于查找技能元数据） */
  resolveFavorite: (path: string) => FavoriteSkillDescriptor | undefined;
  /** 自定义 className */
  className?: string;
}

export function SkillFavoritesSection({
  resolveFavorite,
  className,
}: SkillFavoritesSectionProps) {
  const { favorites, removeFavorite, reorderFavorites, clearFavorites } = useSkillFavorites();
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = useCallback((event: { active: { id: string | number } }) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const sourceIndex = favorites.indexOf(String(active.id));
      const destIndex = favorites.indexOf(String(over.id));
      if (sourceIndex < 0 || destIndex < 0) return;
      reorderFavorites(sourceIndex, destIndex);
    },
    [favorites, reorderFavorites],
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  // 计算已解析的描述，过滤掉 resolveFavorite 查不到的项
  const items = useMemo(() => {
    const seen = new Set<string>();
    const result: FavoriteSkillDescriptor[] = [];
    for (const path of favorites) {
      if (seen.has(path)) continue;
      seen.add(path);
      const desc = resolveFavorite(path);
      if (desc) result.push(desc);
    }
    return result;
  }, [favorites, resolveFavorite]);

  if (items.length === 0) {
    return null;
  }

  const activeItem = activeId ? items.find((i) => i.path === activeId) : null;

  return (
    <section
      data-testid="skill-favorites-section"
      aria-label="收藏的技能"
      className={cn("space-y-3", className)}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StarIcon className="size-4 text-amber-500" />
          <h2 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            收藏
          </h2>
          <span className="text-[11px] text-muted-foreground/60">{items.length}</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={clearFavorites}
          data-testid="skill-favorites-clear"
          aria-label="清空所有收藏"
        >
          <XIcon className="size-3" />
          <span>清空</span>
        </Button>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToFirstScrollableAncestor]}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
        accessibility={{
          announcements: {
            onDragStart: ({ active }) => {
              const name = items.find((i) => i.path === active.id)?.name ?? String(active.id);
              return `开始拖拽 ${name}`;
            },
            onDragOver: ({ active, over }) => {
              if (!over) return undefined;
              const fromName = items.find((i) => i.path === active.id)?.name ?? String(active.id);
              const toName = items.find((i) => i.path === over.id)?.name ?? String(over.id);
              return `${fromName} 移动到 ${toName} 之上`;
            },
            onDragEnd: ({ active, over }) => {
              if (!over) return `拖拽 ${active.id} 已取消`;
              const fromName = items.find((i) => i.path === active.id)?.name ?? String(active.id);
              const toName = items.find((i) => i.path === over.id)?.name ?? String(over.id);
              return `${fromName} 已放置到 ${toName} 位置`;
            },
            onDragCancel: ({ active }) => `拖拽 ${active.id} 已取消`,
          },
          screenReaderInstructions: {
            draggable:
              "按下空格键进入拖拽模式，使用上下方向键移动，回车确认放置，Esc 取消。",
          },
        }}
      >
        <SortableContext
          items={items.map((i) => i.path)}
          strategy={verticalListSortingStrategy}
        >
          <ul
            data-testid="skill-favorites-list"
            className="space-y-2"
            role="list"
          >
            {items.map((item) => (
              <SortableSkillCard
                key={item.path}
                id={item.path}
                onRemove={() => removeFavorite(item.path)}
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium text-foreground">
                    {item.name}
                  </span>
                  {item.description ? (
                    <span className="line-clamp-1 text-[11px] text-muted-foreground/80">
                      {item.description}
                    </span>
                  ) : null}
                  {item.sourceLabel ? (
                    <span className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground/55">
                      {item.sourceLabel}
                    </span>
                  ) : null}
                </div>
              </SortableSkillCard>
            ))}
          </ul>
        </SortableContext>
        <span className="sr-only" aria-live="polite" role="status">
          {activeItem ? `正在拖拽：${activeItem.name}` : ""}
        </span>
      </DndContext>
    </section>
  );
}
