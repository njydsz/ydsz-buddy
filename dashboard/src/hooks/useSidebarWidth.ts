import { useCallback, useEffect, useRef, useState } from "react";
import { COLLAPSED_WIDTH, EXPANDED_WIDTH } from "../layouts/sidebarNav";

const STORAGE_KEY = "ydsz:sidebar:width";
const MIN_WIDTH = 180;
const MAX_WIDTH = 360;

function clampWidth(w: number): number {
  return Math.min(Math.max(w, MIN_WIDTH), MAX_WIDTH);
}

function loadSavedWidth(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return EXPANDED_WIDTH;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return EXPANDED_WIDTH;
    return clampWidth(parsed);
  } catch {
    return EXPANDED_WIDTH;
  }
}

export function useSidebarWidth(collapsed: boolean) {
  const [width, setWidth] = useState<number>(loadSavedWidth);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const draggingRef = useRef(false);

  useEffect(() => {
    if (collapsed) return;
    try {
      localStorage.setItem(STORAGE_KEY, String(width));
    } catch {
      /* ignore */
    }
  }, [width, collapsed]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (collapsed) return;
      e.preventDefault();
      draggingRef.current = true;
      startXRef.current = e.clientX;
      startWidthRef.current = width;

      const onMouseMove = (ev: MouseEvent) => {
        if (!draggingRef.current) return;
        const delta = ev.clientX - startXRef.current;
        setWidth(clampWidth(startWidthRef.current + delta));
      };

      const onMouseUp = () => {
        draggingRef.current = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [collapsed, width],
  );

  /** Width applied to the sidebar; always fixed when collapsed. */
  const resolvedWidth = collapsed ? COLLAPSED_WIDTH : width;

  return { width: resolvedWidth, onResizeMouseDown: onMouseDown };
}

export const SIDEBAR_WIDTH_LIMITS = { MIN_WIDTH, MAX_WIDTH };
