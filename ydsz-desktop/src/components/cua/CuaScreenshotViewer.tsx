/**
 * @file CuaScreenshotViewer.tsx
 * @description CUA 截图查看器组件（带可交互元素标注）。
 *
 * 功能：
 * - 显示最近截图（base64 图片）
 * - 在截图上叠加可交互元素（高亮边界框 + 标签）
 * - 点击元素生成对应动作（click/type/hover）
 * - 支持缩放 + 平移
 * - 截图获取按钮（调用 cua_get_screenshot）
 *
 * ## 核心导出
 *
 * - `CuaScreenshotViewer`：主组件（memo 包裹）
 *
 * ## 使用场景
 *
 * - CUA 会话中分析和选择屏幕元素
 */

import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  PiMagnifyingGlassPlus,
  PiMagnifyingGlassMinus,
  PiArrowsOut,
  PiCamera,
  PiCursor,
  PiTextT,
  PiHand,
} from "react-icons/pi";
import { cn } from "~/lib/utils";
import type {
  ScreenElement,
  CuaAction,
  CuaGetScreenshotResponse,
  CuaStatus,
} from "~/contracts";

// ============================================================================
// Tauri Invoke 动态加载
// ============================================================================

interface TauriInvokeModule {
  invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
}

let tauriModulePromise: Promise<TauriInvokeModule | null> | null = null;

async function loadTauriInvoke(): Promise<TauriInvokeModule | null> {
  if (tauriModulePromise) return tauriModulePromise;
  tauriModulePromise = (async () => {
    try {
      const mod = await import("@tauri-apps/api/core");
      return mod as TauriInvokeModule;
    } catch {
      return null;
    }
  })();
  return tauriModulePromise;
}

// ============================================================================
// 类型
// ============================================================================

/** 标注元素操作类型 */
type ElementActionType = "click" | "type" | "hover";

/** Props */
interface CuaScreenshotViewerProps {
  /** 截图 base64 数据源 */
  screenshot?: string;
  /** 检测到的元素列表 */
  elements: ScreenElement[];
  /** CUA 当前状态 */
  status: CuaStatus;
  /** 点击元素生成的动作回调 */
  onAction?: (action: CuaAction) => void;
  /** 请求新截图的回调 */
  onRequestScreenshot?: () => void;
}

// ============================================================================
// 辅助函数
// ============================================================================

/** 根据元素角色/标签决定默认操作类型 */
function getDefaultActionType(el: ScreenElement): ElementActionType {
  if (el.tagName === "input" || el.tagName === "textarea") return "type";
  if (el.interactive) return "click";
  return "hover";
}

/** 生成元素标签 */
function getElementLabel(el: ScreenElement): string {
  if (el.text) return el.text.slice(0, 20);
  if (el.role) return el.role;
  return `<${el.tagName}>`;
}

// ============================================================================
// 子组件：单个元素标注
// ============================================================================

const ElementAnnotation = memo(function ElementAnnotation(props: {
  element: ScreenElement;
  selected: boolean;
  scale: number;
  onSelect: (element: ScreenElement) => void;
}) {
  const { element, selected, scale, onSelect } = props;
  const { bounds } = element;

  return (
    <div
      className={cn(
        "absolute border-2 cursor-pointer transition-all duration-150 group",
        selected
          ? "border-blue-500 bg-blue-500/15 z-20"
          : element.interactive
            ? "border-green-400/70 bg-green-400/10 hover:border-green-400 hover:bg-green-400/20 z-10"
            : "border-amber-400/50 bg-amber-400/5 hover:border-amber-400 z-10",
      )}
      style={{
        left: bounds.x * scale,
        top: bounds.y * scale,
        width: bounds.width * scale,
        height: bounds.height * scale,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(element);
      }}
      title={element.text || element.role || element.tagName}
    >
      {/* 元素编号标签 */}
      <div
        className={cn(
          "absolute -top-5 left-0 px-1 py-0.5 rounded text-[9px] font-mono font-bold whitespace-nowrap leading-none",
          selected
            ? "bg-blue-500 text-white"
            : element.interactive
              ? "bg-green-500/90 text-white"
              : "bg-amber-500/80 text-white",
        )}
      >
        {element.id.slice(0, 8)}
      </div>

      {/* 悬停时显示的详细信息 */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-30">
        <div className="px-2 py-1 rounded bg-gray-900/90 text-white text-[10px] whitespace-nowrap shadow-lg">
          <div className="font-medium">{getElementLabel(element)}</div>
          <div className="text-gray-400 mt-0.5">
            {element.tagName}
            {element.role ? ` · ${element.role}` : ""}
          </div>
          <div className="text-gray-500 mt-0.5">
            ({Math.round(bounds.x)}, {Math.round(bounds.y)}) {Math.round(bounds.width)}×{Math.round(bounds.height)}
          </div>
        </div>
      </div>
    </div>
  );
});

// ============================================================================
// CuaScreenshotViewer 主组件
// ============================================================================

function CuaScreenshotViewerInner(props: CuaScreenshotViewerProps) {
  const { screenshot, elements, status, onAction, onRequestScreenshot } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [selectedElement, setSelectedElement] = useState<ScreenElement | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 缩放控件最小/最大值
  const MIN_SCALE = 0.25;
  const MAX_SCALE = 3;
  const ZOOM_STEP = 0.25;

  /** 请求新截图 */
  const handleCapture = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tauri = await loadTauriInvoke();
      if (!tauri) {
        setError("Tauri API 不可用");
        return;
      }
      await tauri.invoke<CuaGetScreenshotResponse>(
        "cua_get_screenshot",
        {},
      );
      onRequestScreenshot?.();
      // 注意：此处仅触发回调，父组件负责更新 screenshot prop
    } catch {
      setError("截图功能尚未实现（后端 stub）");
    } finally {
      setLoading(false);
    }
  }, [onRequestScreenshot]);

  /** 缩放 */
  const handleZoomIn = useCallback(() => {
    setScale((s) => Math.min(MAX_SCALE, s + ZOOM_STEP));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((s) => Math.max(MIN_SCALE, s - ZOOM_STEP));
  }, []);

  const handleZoomReset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  /** 鼠标拖拽平移 */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 0 && scale > 1) {
        setIsPanning(true);
        setPanStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
      }
    },
    [scale, offset],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isPanning) {
        setOffset({
          x: e.clientX - panStart.x,
          y: e.clientY - panStart.y,
        });
      }
    },
    [isPanning, panStart],
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  /** 点击元素生成动作 */
  const handleElementClick = useCallback(
    (element: ScreenElement) => {
      setSelectedElement(element);

      const actionType = getDefaultActionType(element);
      const centerX = element.bounds.x + element.bounds.width / 2;
      const centerY = element.bounds.y + element.bounds.height / 2;

      let action: CuaAction;
      switch (actionType) {
        case "click":
          action = {
            type: "click",
            coordinates: { x: centerX, y: centerY },
            target_element: element.id,
          };
          break;
        case "type":
          action = {
            type: "type",
            coordinates: { x: centerX, y: centerY },
            text: "",
            target_element: element.id,
          };
          break;
        case "hover":
        default:
          action = {
            type: "hover",
            coordinates: { x: centerX, y: centerY },
            target_element: element.id,
          };
          break;
      }

      onAction?.(action);
    },
    [onAction],
  );

  /** 执行缩放时以鼠标位置为中心（简化版） */
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setScale((s) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, s + delta)));
    }
  }, []);

  // 选中元素时按 Enter 生成默认点击动作
  useEffect(() => {
    if (!selectedElement) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && selectedElement) {
        handleElementClick(selectedElement);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedElement, handleElementClick]);

  // 状态标签
  const isCapturing = status === "capturing" || status === "analyzing";

  return (
    <div className="space-y-3">
      {/* 工具栏 */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleCapture}
          disabled={loading || isCapturing}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
            "border border-border/40",
            loading || isCapturing
              ? "bg-muted/50 text-muted-foreground cursor-wait"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          <PiCamera />
          {loading || isCapturing ? "截取中..." : "截取屏幕"}
        </button>

        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={handleZoomOut}
            disabled={scale <= MIN_SCALE}
            className="p-1.5 rounded-md border border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <PiMagnifyingGlassMinus />
          </button>
          <span className="text-[10px] font-mono text-muted-foreground w-10 text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            disabled={scale >= MAX_SCALE}
            className="p-1.5 rounded-md border border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <PiMagnifyingGlassPlus />
          </button>
          <button
            onClick={handleZoomReset}
            className="p-1.5 rounded-md border border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <PiArrowsOut />
          </button>
        </div>
      </div>

      {/* 截图显示区域 */}
      <div
        ref={containerRef}
        className={cn(
          "relative overflow-hidden rounded-md border border-border/40 bg-background/80",
          scale > 1 ? "cursor-grab" : "cursor-default",
          isPanning && "cursor-grabbing",
        )}
        style={{ minHeight: 200, maxHeight: 500 }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        {screenshot ? (
          <div
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              transformOrigin: "top left",
              transition: isPanning ? "none" : "transform 0.15s ease-out",
            }}
            className="relative inline-block"
          >
            {/* 截图本体 */}
            <img
              src={
                screenshot.startsWith("data:")
                  ? screenshot
                  : `data:image/png;base64,${screenshot}`
              }
              alt="屏幕截图"
              className="block max-w-none select-none pointer-events-none"
              draggable={false}
            />

            {/* 元素标注叠加层 */}
            {elements.map((el) => (
              <ElementAnnotation
                key={el.id}
                element={el}
                selected={selectedElement?.id === el.id}
                scale={1}
                onSelect={handleElementClick}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <PiCamera className="text-3xl mb-2 opacity-30" />
            <p className="text-xs">
              {isCapturing ? "正在截取屏幕..." : "点击「截取屏幕」按钮开始"}
            </p>
          </div>
        )}
      </div>

      {/* 已选中元素信息 */}
      {selectedElement && (
        <div className="flex items-center gap-2 p-2 rounded-md bg-blue-500/10 border border-blue-500/20">
          <PiCursor className="text-blue-500 text-sm shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-foreground">
              已选择: {getElementLabel(selectedElement)}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {selectedElement.tagName}
              {selectedElement.role ? ` · ${selectedElement.role}` : ""}
              {" · "}@
              ({Math.round(selectedElement.bounds.x)}, {Math.round(selectedElement.bounds.y)})
            </div>
          </div>
          <div className="flex gap-1">
            {/* 快捷操作按钮 */}
            {(selectedElement.tagName === "input" ||
              selectedElement.tagName === "textarea") && (
              <button
                onClick={() => handleElementClick(selectedElement)}
                className="p-1 rounded border border-border/40 text-xs hover:bg-muted/50 transition-colors"
                title="输入文字"
              >
                <PiTextT />
              </button>
            )}
            {selectedElement.interactive && (
              <button
                onClick={() => handleElementClick(selectedElement)}
                className="p-1 rounded border border-border/40 text-xs hover:bg-muted/50 transition-colors"
                title="点击"
              >
                <PiCursor />
              </button>
            )}
            <button
              onClick={() => handleElementClick(selectedElement)}
              className="p-1 rounded border border-border/40 text-xs hover:bg-muted/50 transition-colors"
              title="悬停"
            >
              <PiHand />
            </button>
          </div>
        </div>
      )}

      {/* 元素列表摘要 */}
      {elements.length > 0 && (
        <div className="text-[10px] text-muted-foreground">
          检测到 {elements.length} 个元素
          {" · "}可交互: {elements.filter((e) => e.interactive).length}
        </div>
      )}

      {/* 错误 */}
      {error && (
        <div className="px-3 py-2 text-xs text-red-500 bg-red-500/10 rounded-md">
          {error}
        </div>
      )}
    </div>
  );
}

export const CuaScreenshotViewer = memo(CuaScreenshotViewerInner);
