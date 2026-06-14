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
 * resolveSnap — Snaps to:
 *   1. First point of current polygon (highest priority — for closure)
 *   2. Any vertex of a completed region (for shared-boundary alignment)
 */
export function resolveSnap(clientX, clientY, rect, currentPoints, regions, pointerType = "pen") {
  const SNAP_THRESHOLD_PX = getSnapThreshold(pointerType);

  // Priority 1: first vertex of current polygon (closure snap)
  if (currentPoints.length >= 3) {
    const first = currentPoints[0];
    const s = normToScreen(first, rect);
    if (screenDist(clientX, clientY, s.x, s.y) < SNAP_THRESHOLD_PX) {
      return { coords: first, isFirstPoint: true, isRegionSnap: false };
    }
  }

  // Priority 2: vertices of completed regions (boundary snap)
  let bestDist = SNAP_THRESHOLD_PX;
  let bestSnap = null;

  for (const region of regions) {
    for (const pt of region.points) {
      const s = normToScreen(pt, rect);
      const d = screenDist(clientX, clientY, s.x, s.y);
      if (d < bestDist) {
        bestDist = d;
        bestSnap = {
          coords: pt,
          isFirstPoint: false,
          isRegionSnap: true,
          regionName: region.name,
        };
      }
    }
  }

  return bestSnap;
}
