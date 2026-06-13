// ===========================================================================
// Coordinate utilities — pointer-event aware
// ===========================================================================

export function eventToNorm(e, imgEl) {
  const rect = imgEl.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top)  / rect.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return [x, y];
}

/** Convert a normalized point to a PointerEvent-style screen position. */
export function normToScreen(normPt, rect) {
  return {
    x: rect.left + normPt[0] * rect.width,
    y: rect.top  + normPt[1] * rect.height,
  };
}

export function screenDist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

// ===========================================================================
// Snapping resolver — adaptive thresholds for pen vs finger
// ===========================================================================

/** Snap threshold: tighter for Apple Pencil, looser for finger touch */
export function getSnapThreshold(pointerType) {
  return pointerType === "pen" ? 14 : 24;
}

/**
 * resolveSnap — Only snaps to the first point of the current polygon (for closure).
 * All other snapping (vertices/edges of completed regions) is disabled.
 */
export function resolveSnap(clientX, clientY, rect, currentPoints, regions, pointerType = "pen") {
  const SNAP_THRESHOLD_PX = getSnapThreshold(pointerType);

  // Only snap: first vertex (closure)
  if (currentPoints.length >= 3) {
    const first = currentPoints[0];
    const s = normToScreen(first, rect);
    if (screenDist(clientX, clientY, s.x, s.y) < SNAP_THRESHOLD_PX) {
      return { coords: first, isFirstPoint: true };
    }
  }

  return null;
}
