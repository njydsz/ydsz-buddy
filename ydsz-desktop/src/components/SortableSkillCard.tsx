// FILE: SortableSkillCard.tsx
// Purpose: Renders a single skill card that participates in a dnd-kit SortableContext
//          so the SkillsView favorites list can be reordered by drag (or keyboard).
// Layer: Web skill presentation component
// Exports: SortableSkillCard
/**
 * @file 可排序技能卡片
 *
 * 用于 SkillsView 「收藏」区域。每个卡片是 dnd-kit `useSortable` 的参与者：
 *
 * - **拖拽手柄**：左侧 `GripVertical` 图标，使用专用 `listeners`
 * - **键盘支持**：dnd-kit `KeyboardSensor` 会接管卡片的 `Space` 键进入拖拽模式
 * - **动画**：使用 `useSortable` 返回的 `transform` / `transition`
 * - **置顶/移除按钮**：卡片右侧操作区，向上为置顶、× 为取消收藏
 *
 * ## 核心导出
 *
 * - `SortableSkillCard`：单卡片组件
 *
 * ## 使用场景
 *
 * - SkillsView 顶部「收藏」区域
 *
 * ## 注意事项
 *
 * - 该组件只是 UI，不持有收藏状态；状态由父级 `useSkillFavorites` 管理
 * - 拖拽手柄使用 `setActivatorNodeRef`，避免点击卡片本身触发拖拽
 */

import { forwardRef, type CSSProperties, type ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BookIcon, GripVerticalIcon, StarOffIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";

export interface SortableSkillCardProps {
  /** 唯一 id（建议使用 skill.path） */
  id: string;
  /** 卡片内容（左侧主区域） */
  children: ReactNode;
  /** 拖拽时被禁用 */
  disabled?: boolean;
  /** 取消收藏回调 */
  onRemove?: () => void;
  /** 自定义 className */
  className?: string;
  /** 测试 id 后缀 */
  dataTestId?: string;
}

export const SortableSkillCard = forwardRef<HTMLLIElement, SortableSkillCardProps>(
  function SortableSkillCard(
    { id, children, disabled = false, onRemove, className, dataTestId },
    forwardedRef,
  ) {
    const {
      attributes,
      listeners,
      setNodeRef,
      setActivatorNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id, disabled });

    const style: CSSProperties = {
      transform: CSS.Transform.toString(transform),
      transition,
    };

    return (
      <li
        ref={(node) => {
          setNodeRef(node);
          if (typeof forwardedRef === "function") {
            forwardedRef(node);
          } else if (forwardedRef) {
            forwardedRef.current = node;
          }
        }}
        style={style}
        data-testid={dataTestId ?? `sortable-skill-${id}`}
        data-dragging={isDragging ? "true" : undefined}
        className={cn(
          "group/skill flex items-stretch gap-2 rounded-xl border border-border/60 bg-background/60 p-2 shadow-xs transition-shadow",
          isDragging && "z-50 border-primary/70 shadow-lg ring-1 ring-primary/40",
          disabled && "opacity-50",
          className,
        )}
      >
        <button
          ref={setActivatorNodeRef}
          type="button"
          aria-label={`重新排序 ${id}`}
          data-testid={`sortable-skill-handle-${id}`}
          className="inline-flex size-8 shrink-0 cursor-grab items-center justify-center self-stretch rounded-md text-muted-foreground/70 transition-colors hover:bg-muted/70 hover:text-foreground active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          {...attributes}
          {...listeners}
        >
          <GripVerticalIcon className="size-4" />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <BookIcon className="size-4 shrink-0 text-muted-foreground/70" />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`从收藏中移除 ${id}`}
            data-testid={`sortable-skill-remove-${id}`}
            className="inline-flex size-8 shrink-0 items-center justify-center self-stretch rounded-md text-muted-foreground/70 transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <StarOffIcon className="size-4" />
          </button>
        ) : null}
      </li>
    );
  },
);
