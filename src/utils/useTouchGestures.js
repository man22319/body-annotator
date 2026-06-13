import { useCallback, useRef, useEffect } from "react";

/**
 * useTouchGestures — Handles finger touch input for canvas navigation.
 *
 * - 1-finger drag → pan
 * - 2-finger pinch → zoom + pan
 * - Double-tap → reset view
 *
 * Uses refs for zoom/panOffset to avoid stale closure bugs that cause
 * the image to fly/teleport when panning and zooming simultaneously.
 *
 * Ignores all `pointerType === "pen"` events.
 */
export function useTouchGestures({
  containerRef, zoom, setZoom, panOffset, setPanOffset, onDoubleTap,
}) {
  // Keep refs in sync so callbacks always see latest values
  const zoomRef = useRef(zoom);
  const panOffsetRef = useRef(panOffset);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { panOffsetRef.current = panOffset; }, [panOffset]);

  // Track active touch pointers
  const activeTouches = useRef(new Map()); // pointerId -> { x, y }
  const panStart = useRef(null);
  const panOffsetStart = useRef(null);
  const pinchStartDist = useRef(null);
  const pinchStartZoom = useRef(null);
  const pinchStartCenter = useRef(null);
  const pinchStartPanOffset = useRef(null);

  // Double-tap detection
  const lastTapTime = useRef(0);
  const lastTapPos = useRef(null);
  const DOUBLE_TAP_DELAY = 300;
  const DOUBLE_TAP_DIST = 40;

  const isPanning = useRef(false);
  const isPinching = useRef(false);

  const handlePointerDown = useCallback((e) => {
    if (e.pointerType === "pen") return;
    if (e.pointerType !== "touch") return;

    e.preventDefault();
    activeTouches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const touchCount = activeTouches.current.size;

    if (touchCount === 1) {
      // Start potential pan — read from ref for latest value
      panStart.current = { x: e.clientX, y: e.clientY };
      panOffsetStart.current = { ...panOffsetRef.current };
      isPanning.current = false; // Will become true on move
    }

    if (touchCount === 2) {
      // Start pinch zoom — read from refs for latest values
      isPanning.current = false;
      isPinching.current = true;
      const pts = Array.from(activeTouches.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchStartDist.current = dist;
      pinchStartZoom.current = zoomRef.current;
      pinchStartCenter.current = {
        x: (pts[0].x + pts[1].x) / 2,
        y: (pts[0].y + pts[1].y) / 2,
      };
      pinchStartPanOffset.current = { ...panOffsetRef.current };
    }
  }, []); // No deps — reads from refs

  const handlePointerMove = useCallback((e) => {
    if (e.pointerType === "pen") return;
    if (e.pointerType !== "touch") return;
    if (!activeTouches.current.has(e.pointerId)) return;

    activeTouches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const touchCount = activeTouches.current.size;

    if (touchCount === 2 && isPinching.current && pinchStartDist.current) {
      // Pinch zoom
      const pts = Array.from(activeTouches.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const scale = dist / pinchStartDist.current;
      const newZoom = Math.min(30, Math.max(0.1, pinchStartZoom.current * scale));
      setZoom(newZoom);

      // Also pan during pinch to keep center stable
      const center = {
        x: (pts[0].x + pts[1].x) / 2,
        y: (pts[0].y + pts[1].y) / 2,
      };
      const dx = center.x - pinchStartCenter.current.x;
      const dy = center.y - pinchStartCenter.current.y;
      setPanOffset({
        x: pinchStartPanOffset.current.x + dx,
        y: pinchStartPanOffset.current.y + dy,
      });
    } else if (touchCount === 1 && panStart.current && !isPinching.current) {
      // Pan
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      if (!isPanning.current && Math.hypot(dx, dy) > 5) {
        isPanning.current = true;
      }
      if (isPanning.current && panOffsetStart.current) {
        setPanOffset({
          x: panOffsetStart.current.x + dx,
          y: panOffsetStart.current.y + dy,
        });
      }
    }
  }, [setZoom, setPanOffset]);

  const handlePointerUp = useCallback((e) => {
    if (e.pointerType === "pen") return;
    if (e.pointerType !== "touch") return;

    const wasPanning = isPanning.current;
    activeTouches.current.delete(e.pointerId);

    if (activeTouches.current.size === 0) {
      // All fingers lifted
      if (!wasPanning && !isPinching.current) {
        // It was a tap — check for double-tap
        const now = Date.now();
        const timeSinceLastTap = now - lastTapTime.current;
        const lastPos = lastTapPos.current;

        if (
          timeSinceLastTap < DOUBLE_TAP_DELAY &&
          lastPos &&
          Math.hypot(e.clientX - lastPos.x, e.clientY - lastPos.y) < DOUBLE_TAP_DIST
        ) {
          onDoubleTap?.();
          lastTapTime.current = 0;
          lastTapPos.current = null;
        } else {
          lastTapTime.current = now;
          lastTapPos.current = { x: e.clientX, y: e.clientY };
        }
      }

      isPanning.current = false;
      isPinching.current = false;
      panStart.current = null;
      panOffsetStart.current = null;
      pinchStartDist.current = null;
    } else if (activeTouches.current.size === 1) {
      // Dropped from pinch to one finger — restart pan from here using ref
      isPinching.current = false;
      const remaining = Array.from(activeTouches.current.values())[0];
      panStart.current = { x: remaining.x, y: remaining.y };
      panOffsetStart.current = { ...panOffsetRef.current };
    }
  }, [onDoubleTap]); // No panOffset dep — reads from ref

  const handlePointerCancel = useCallback((e) => {
    if (e.pointerType !== "touch") return;
    activeTouches.current.delete(e.pointerId);
    if (activeTouches.current.size === 0) {
      isPanning.current = false;
      isPinching.current = false;
      panStart.current = null;
    }
  }, []);

  // Prevent Safari native gestures on the container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const prevent = (e) => e.preventDefault();
    // Only prevent touchstart/touchmove on non-interactive targets.
    // Buttons, inputs, etc. need native touch events so click synthesis works on iPad.
    const preventIfNotInteractive = (e) => {
      if (e.target.closest("button, input, label, a, [role='button']")) return;
      e.preventDefault();
    };
    el.addEventListener("gesturestart", prevent, { passive: false });
    el.addEventListener("gesturechange", prevent, { passive: false });
    el.addEventListener("gestureend", prevent, { passive: false });
    el.addEventListener("touchstart", preventIfNotInteractive, { passive: false });
    el.addEventListener("touchmove", prevent, { passive: false });

    return () => {
      el.removeEventListener("gesturestart", prevent);
      el.removeEventListener("gesturechange", prevent);
      el.removeEventListener("gestureend", prevent);
      el.removeEventListener("touchstart", preventIfNotInteractive);
      el.removeEventListener("touchmove", prevent);
    };
  }, [containerRef]);

  return {
    handlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerCancel,
    },
    isPanning,
    isPinching,
  };
}
