/**
 * useDragOffset - Track mouse/touch drag and compute offset
 *
 * Allows dragging a container element to a new position.
 * Returns offset state and a pointerDown handler to attach to a draggable element.
 * Supports both mouse (desktop) and touch (mobile) events.
 * Supports a drag threshold to distinguish clicks from drags.
 *
 * Usage:
 *   const { offset, handleMouseDown, handleTouchStart } = useDragOffset();
 *   <div
 *     style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
 *     onMouseDown={handleMouseDown}
 *     onTouchStart={handleTouchStart}
 *   >
 *     Content
 *   </div>
 */

import { useState, useRef, useEffect, useCallback } from "react";

export interface DragOffset {
  x: number;
  y: number;
}

export interface UseDragOffsetOptions {
  enabled?: boolean;
  maxBounds?: { width: number; height: number };
  /**
   * Minimum pointer movement (px) before drag starts.
   * Below this threshold, no offset is applied (treated as a click).
   * Default: 0 (no threshold — immediate drag).
   */
  dragThreshold?: number;
}

export function useDragOffset(
  enabledOrOptions: boolean | UseDragOffsetOptions = true,
  maxBounds?: { width: number; height: number },
) {
  // Normalize arguments: support both old (boolean, maxBounds) and new (options) signatures
  const opts: UseDragOffsetOptions =
    typeof enabledOrOptions === "object"
      ? enabledOrOptions
      : { enabled: enabledOrOptions, maxBounds };

  const enabled = opts.enabled ?? true;
  const bounds = opts.maxBounds;
  const dragThreshold = opts.dragThreshold ?? 0;

  const [offset, setOffset] = useState<DragOffset>({ x: 0, y: 0 });
  const isPendingRef = useRef(false); // pointer down, but below threshold
  const isDraggingRef = useRef(false); // threshold exceeded, actively dragging
  const wasDragRef = useRef(false); // set true when drag activates, cleared on next mousedown
  const dragStartRef = useRef({
    x: 0,
    y: 0,
    offsetX: 0,
    offsetY: 0,
  });

  // ── Shared move logic ──────────────────────────────────────────────

  const applyMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!enabled) return;

      const dx = clientX - dragStartRef.current.x;
      const dy = clientY - dragStartRef.current.y;

      // If below threshold, check if we should activate
      if (isPendingRef.current && !isDraggingRef.current) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < dragThreshold) return; // still below threshold
        // Threshold exceeded — activate drag
        isDraggingRef.current = true;
        isPendingRef.current = false;
        wasDragRef.current = true;
      }

      if (!isDraggingRef.current) return;

      let newX = dragStartRef.current.offsetX + dx;
      let newY = dragStartRef.current.offsetY + dy;

      if (bounds) {
        newX = Math.max(-bounds.width / 2, Math.min(newX, bounds.width / 2));
        newY = Math.max(-bounds.height / 2, Math.min(newY, bounds.height / 2));
      }

      setOffset({ x: newX, y: newY });
    },
    [enabled, bounds, dragThreshold],
  );

  const startDrag = useCallback(
    (clientX: number, clientY: number, currentOffset: DragOffset) => {
      if (!enabled) return;
      dragStartRef.current = {
        x: clientX,
        y: clientY,
        offsetX: currentOffset.x,
        offsetY: currentOffset.y,
      };
      wasDragRef.current = false; // reset for this new interaction
      if (dragThreshold > 0) {
        // Wait for threshold before activating drag
        isPendingRef.current = true;
        isDraggingRef.current = false;
      } else {
        isDraggingRef.current = true;
        isPendingRef.current = false;
      }
    },
    [enabled, dragThreshold],
  );

  const stopDrag = useCallback(() => {
    if (isDraggingRef.current) {
      wasDragRef.current = true;
    }
    isDraggingRef.current = false;
    isPendingRef.current = false;
  }, []);

  // ── Mouse handlers ─────────────────────────────────────────────────

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!enabled) return;
      startDrag(e.clientX, e.clientY, {
        x: dragStartRef.current.offsetX,
        y: dragStartRef.current.offsetY,
      });
    },
    [enabled, startDrag],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      applyMove(e.clientX, e.clientY);
    },
    [applyMove],
  );

  // ── Touch handlers ─────────────────────────────────────────────────

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled) return;
      const touch = e.touches[0];
      if (!touch) return;
      startDrag(touch.clientX, touch.clientY, {
        x: dragStartRef.current.offsetX,
        y: dragStartRef.current.offsetY,
      });
    },
    [enabled, startDrag],
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!isPendingRef.current && !isDraggingRef.current) return;
      const touch = e.touches[0];
      if (!touch) return;
      applyMove(touch.clientX, touch.clientY);
      // Prevent page scroll once actively dragging
      if (isDraggingRef.current) {
        e.preventDefault();
      }
    },
    [applyMove],
  );

  const handleTouchEnd = useCallback(() => {
    stopDrag();
  }, [stopDrag]);

  // ── Global event listeners ─────────────────────────────────────────

  // Keep an up-to-date ref of current offset so startDrag captures the right base.
  const offsetRef = useRef<DragOffset>({ x: 0, y: 0 });
  useEffect(() => {
    offsetRef.current = offset;
    // Keep dragStartRef.offsetX/Y in sync so handleMouseDown / handleTouchStart
    // can read the live offset without going through a stale closure.
    if (!isDraggingRef.current && !isPendingRef.current) {
      dragStartRef.current.offsetX = offset.x;
      dragStartRef.current.offsetY = offset.y;
    }
  }, [offset]);

  useEffect(() => {
    if (!enabled) return;

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", stopDrag);
    // passive:false is required to call preventDefault inside touchmove
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", stopDrag);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [enabled, handleMouseMove, stopDrag, handleTouchMove, handleTouchEnd]);

  // Reset when disabled
  useEffect(() => {
    if (!enabled) {
      setOffset({ x: 0, y: 0 });
      isDraggingRef.current = false;
      isPendingRef.current = false;
    }
  }, [enabled]);

  // ── Programmatic drag start (for delayed/hold-to-drag scenarios) ──
  const startDragAt = useCallback(
    (clientX: number, clientY: number) => {
      startDrag(clientX, clientY, {
        x: dragStartRef.current.offsetX,
        y: dragStartRef.current.offsetY,
      });
    },
    [startDrag],
  );

  return {
    offset,
    /** Whether the user is actively dragging (past threshold) */
    isDragging: isDraggingRef,
    /** Attach to onMouseDown on the draggable element */
    handleMouseDown,
    /** Attach to onTouchStart on the draggable element — enables mobile drag */
    handleTouchStart,
    /** Programmatically start a drag from the given coordinates (e.g. after a hold threshold) */
    startDragAt,
    /** Returns true if the last pointer session was a drag (not a click). Resets after reading. */
    wasDragged: () => {
      const v = wasDragRef.current;
      wasDragRef.current = false;
      return v;
    },
    /** Allow manual reset */
    resetOffset: () => setOffset({ x: 0, y: 0 }),
  };
}
