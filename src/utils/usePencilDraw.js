import { useCallback, useRef } from "react";

/**
 * usePencilDraw — Handles Apple Pencil input for placing polygon vertices.
 *
 * Detects `pointerType === "pen"` and translates taps into normalized
 * canvas coordinates. Only commits a point on pointerUp to avoid
 * accidental multi-point placement from pressure jitter.
 *
 * @param {object} opts
 * @param {React.RefObject} opts.imgRef - ref to the <img> element
 * @param {Function} opts.onPlacePoint - (normCoords, pointerEvent) => void
 * @param {Function} opts.onPencilMove - (normCoords, pointerEvent) => void  (for snap preview)
 * @param {Function} opts.onPencilLeave - () => void
 * @param {boolean}  opts.enabled - whether drawing is active
 * @returns {{ handlers, isPencilDown }}
 */
export function usePencilDraw({ imgRef, onPlacePoint, onPencilMove, onPencilLeave, enabled }) {
  const isPencilDown = useRef(false);
  const pencilDownPos = useRef(null);
  const MOVE_THRESHOLD = 6; // px — if pencil moves more than this, it's a stroke not a tap

  const handlePointerDown = useCallback((e) => {
    if (e.pointerType !== "pen") return;
    if (!enabled) return;
    e.preventDefault();
    e.stopPropagation();
    isPencilDown.current = true;
    pencilDownPos.current = { x: e.clientX, y: e.clientY };
  }, [enabled]);

  const handlePointerMove = useCallback((e) => {
    if (e.pointerType !== "pen") return;
    if (!enabled) return;
    if (!imgRef.current) return;

    // Always update snap preview regardless of pen down state
    const rect = imgRef.current.getBoundingClientRect();
    const normX = (e.clientX - rect.left) / rect.width;
    const normY = (e.clientY - rect.top) / rect.height;

    if (normX >= 0 && normX <= 1 && normY >= 0 && normY <= 1) {
      onPencilMove?.([normX, normY], e);
    }
  }, [enabled, imgRef, onPencilMove]);

  const handlePointerUp = useCallback((e) => {
    if (e.pointerType !== "pen") return;
    if (!isPencilDown.current) return;
    isPencilDown.current = false;

    if (!enabled || !imgRef.current) {
      pencilDownPos.current = null;
      return;
    }

    // Only place point if the pencil didn't travel far (it's a tap, not a drag)
    const downPos = pencilDownPos.current;
    pencilDownPos.current = null;

    if (downPos) {
      const dist = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
      if (dist > MOVE_THRESHOLD) return; // User dragged — ignore
    }

    const rect = imgRef.current.getBoundingClientRect();
    const normX = (e.clientX - rect.left) / rect.width;
    const normY = (e.clientY - rect.top) / rect.height;

    if (normX >= 0 && normX <= 1 && normY >= 0 && normY <= 1) {
      onPlacePoint?.([normX, normY], e);
    }
  }, [enabled, imgRef, onPlacePoint]);

  const handlePointerCancel = useCallback((e) => {
    if (e.pointerType !== "pen") return;
    isPencilDown.current = false;
    pencilDownPos.current = null;
  }, []);

  const handlePointerLeave = useCallback((e) => {
    if (e.pointerType !== "pen") return;
    onPencilLeave?.();
  }, [onPencilLeave]);

  return {
    handlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerCancel,
      onPointerLeave: handlePointerLeave,
    },
    isPencilDown,
  };
}
