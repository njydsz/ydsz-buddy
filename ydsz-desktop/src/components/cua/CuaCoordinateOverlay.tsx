/**
 * @file CuaCoordinateOverlay.tsx
 * @description CUA 坐标叠加层组件。
 *
 * 功能：
 * - 在截图上方以坐标形式展示可交互元素
 * - 显示元素的中心点坐标（用于 CUA action 参数）
 * - 鼠标悬停时高亮目标元素
 * - 元素 ID 快捷复制
 *
 * ## 核心导出
 *
 * - `CuaCoordinateOverlay`：坐标叠加层主组件
 *
 * ## 使用场景
 *
 * - 与 CuaScreenshotViewer 配合使用（内部已集成）
 * - 独立使用时可用于显示元素坐标列表
 */

import { memo, useCallback, useState } from "react";
import {
  PiCrosshair,
  PiCopy,
  PiCheck,
  PiCursor,
} from "react-icons/pi";
import { cn } from "~/lib/utils";
import type { ScreenElement } from "~/contracts";

// ============================================================================
// 类型定义
// ============================================================================

/** Props */
interface CuaCoordinateOverlayProps {
  /** 元素列表 */
  elements: ScreenElement[];
  /** 容器宽度（用于相对定位） */
  containerWidth: number;
  /** 容器高度 */
  containerHeight: number;
  /** 显示缩放比 */
  scale?: number;
  /** 悬停元素回调 */
  onHoverElement?: (element: ScreenElement | null) => void;
  /** 点击坐标回调 */
  onCoordinateClick?: (coords: { x: number; y: number }) => void;
  /** 仅显示可交互元素 */
  interactiveOnly?: boolean;
  /** 紧凑模式（仅显示点） */
  compact?: boolean;
}

// ============================================================================
// 辅助函数
// ============================================================================

/** 计算元素中心坐标 */
function getCenterCoords(el: ScreenElement): { x: number; y: number } {
  return {
    x: Math.round(el.bounds.x + el.bounds.width / 2),
    y: Math.round(el.bounds.y + el.bounds.height / 2),
  };
}

// ============================================================================
// 子组件：坐标点标记
// ============================================================================

const CoordinatePoint = memo(function CoordinatePoint(props: {
  element: ScreenElement;
  containerWidth: number;
  containerHeight: number;
  scale: number;
  compact: boolean;
  isHovered: boolean;
  onHover: (element: ScreenElement | null) => void;
  onCopy: (text: string) => void;
}) {
  const {
    element,
    containerWidth,
    containerHeight,
    scale,
    compact,
    isHovered,
    onHover,
    onCopy,
  } = props;

  const center = getCenterCoords(element);
  const scaledX = (center.x / containerWidth) * 100;
  const scaledY = (center.y / containerHeight) * 100;

  // 百分比定位（相对于截图容器）
  const leftPct = `${scaledX}%`;
  const topPct = `${scaledY}%`;

  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const text = `${center.x},${center.y}`;
      onCopy(text);
    },
    [center, onCopy],
  );

  return (
    <div
      className="absolute z-30 group"
      style={{ left: leftPct, top: topPct, transform: "translate(-50%, -50%)" }}
      onMouseEnter={() => onHover(element)}
      onMouseLeave={() => onHover(null)}
    >
      {/* 坐标点 */}
      <div
        className={cn(
          "relative flex items-center justify-center transition-all duration-100",
          compact ? "w-3 h-3" : "w-4 h-4",
          isHovered
            ? element.interactive
              ? "bg-blue-500/40 ring-2 ring-blue-400 scale-125"
              : "bg-amber-500/30 ring-2 ring-amber-400 scale-125"
            : element.interactive
              ? "bg-green-500/20 ring-1 ring-green-400/60"
              : "bg-gray-500/20 ring-1 ring-gray-400/40",
          "rounded-full cursor-pointer",
        )}
      >
        {/* 中心点 */}
        <div
          className={cn(
            "rounded-full",
            compact ? "w-1 h-1" : "w-1.5 h-1.5",
            isHovered
              ? element.interactive
                ? "bg-blue-300"
                : "bg-amber-300"
              : element.interactive
                ? "bg-green-400"
                : "bg-gray-400",
          )}
        />
      </div>

      {/* 悬停 Tooltip */}
      <div
        className={cn(
          "absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-40 pointer-events-none",
        )}
      >
        <div className="px-2 py-1.5 rounded-md bg-gray-900/95 text-white text-[10px] whitespace-nowrap shadow-xl space-y-0.5">
          {/* 坐标 */}
          <div className="flex items-center gap-1 font-mono">
            <PiCrosshair className="text-gray-400" />
            ({center.x}, {center.y})
          </div>

          {/* 元素信息 */}
          <div className="text-gray-300">
            <span className="text-gray-400">&lt;{element.tagName}&gt;</span>
            {element.role && (
              <span className="text-gray-500"> · {element.role}</span>
            )}
            {element.text && (
              <span className="text-gray-400 ml-1">
                "{element.text.slice(0, 12)}"
              </span>
            )}
          </div>

          {/* 尺寸 */}
          <div className="text-gray-500">
            {Math.round(element.bounds.width)}×{Math.round(element.bounds.height)}
          </div>
        </div>

        {/* 小三角 */}
        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
          <div
            className="w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-gray-900/95"
          />
        </div>
      </div>

      {/* 非紧凑模式下的复制按钮 */}
      {!compact && isHovered && (
        <button
          onClick={handleCopy}
          className="absolute -top-2 -right-2 p-0.5 rounded bg-gray-900/80 text-white hover:bg-gray-700 pointer-events-auto transition-colors"
          title="复制坐标"
        >
          <PiCopy className="text-[8px]" />
        </button>
      )}
    </div>
  );
});

// ============================================================================
// CuaCoordinateOverlay 主组件
// ============================================================================

function CuaCoordinateOverlayInner(props: CuaCoordinateOverlayProps) {
  const {
    elements,
    containerWidth,
    containerHeight,
    scale = 1,
    onHoverElement,
    onCoordinateClick,
    interactiveOnly = false,
    compact = false,
  } = props;

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // 过滤元素
  const displayedElements = interactiveOnly
    ? elements.filter((e) => e.interactive)
    : elements;

  // 悬停处理
  const handleHover = useCallback(
    (element: ScreenElement | null) => {
      setHoveredId(element?.id ?? null);
      onHoverElement?.(element);
    },
    [onHoverElement],
  );

  // 复制坐标
  const handleCopy = useCallback((text: string) => {
    setCopiedText(text);
    // 尝试使用剪贴板 API
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {
        // 静默失败
      });
    }
    // 1.5 秒后清除提示
    setTimeout(() => setCopiedText(null), 1500);
  }, []);

  // 点击空白区域坐标
  const handleContainerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!onCoordinateClick) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.round(e.clientX - rect.left);
      const y = Math.round(e.clientY - rect.top);

      if (x >= 0 && x <= containerWidth && y >= 0 && y <= containerHeight) {
        onCoordinateClick({ x, y });
      }
    },
    [containerWidth, containerHeight, onCoordinateClick],
  );

  if (displayedElements.length === 0) {
    return null;
  }

  return (
    <div
      className="absolute inset-0 z-20"
      onClick={handleContainerClick}
      style={{ pointerEvents: onCoordinateClick ? "auto" : "none" }}
    >
      {/* 坐标点渲染 */}
      {displayedElements.map((el) => (
        <CoordinatePoint
          key={el.id}
          element={el}
          containerWidth={containerWidth}
          containerHeight={containerHeight}
          scale={scale}
          compact={compact}
          isHovered={hoveredId === el.id}
          onHover={handleHover}
          onCopy={handleCopy}
        />
      ))}

      {/* 复制成功提示 */}
      {copiedText && (
        <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded bg-green-600 text-white text-[10px] shadow-lg pointer-events-none">
          <PiCheck className="text-[10px]" />
          已复制: ({copiedText})
        </div>
      )}

      {/* 元素计数 */}
      <div className="absolute bottom-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-900/60 text-gray-300 text-[9px] pointer-events-none">
        <PiCursor className="text-[8px]" />
        {displayedElements.length}
      </div>
    </div>
  );
}

export const CuaCoordinateOverlay = memo(CuaCoordinateOverlayInner);
