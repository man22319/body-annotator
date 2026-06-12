// ===========================================================================
// Coordinate utilities
// ===========================================================================

export function eventToNorm(e, imgEl) {
  const rect = imgEl.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top)  / rect.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return [x, y];
}

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
// Snapping resolver
// ===========================================================================

const SNAP_THRESHOLD_PX = 14;

function projectPointOntoSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  if (lenSq === 0) return { x: ax, y: ay, t: 0 };
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lenSq));
  return { x: ax + t * abx, y: ay + t * aby, t };
}

export function resolveSnap(clientX, clientY, rect, currentPoints, regions) {
  // Tier 1: first vertex (closure)
  if (currentPoints.length >= 3) {
    const first = currentPoints[0];
    const s = normToScreen(first, rect);
    if (screenDist(clientX, clientY, s.x, s.y) < SNAP_THRESHOLD_PX) {
      return { coords: first, isFirstPoint: true };
    }
  }

  // Tier 2: vertices of completed regions
  let best = null;
  let bestDist = SNAP_THRESHOLD_PX;
  for (const region of regions) {
    for (let i = 0; i < region.points.length; i++) {
      const pt = region.points[i];
      const s = normToScreen(pt, rect);
      const d = screenDist(clientX, clientY, s.x, s.y);
      if (d < bestDist) {
        bestDist = d;
        best = { coords: pt, isFirstPoint: false, regionId: region.id, pointIndex: i };
      }
    }
  }
  if (best) return best;

  // Tier 3: edges of completed regions
  bestDist = SNAP_THRESHOLD_PX;
  for (const region of regions) {
    const n = region.points.length;
    for (let i = 0; i < n; i++) {
      const a = normToScreen(region.points[i], rect);
      const b = normToScreen(region.points[(i + 1) % n], rect);
      const proj = projectPointOntoSegment(clientX, clientY, a.x, a.y, b.x, b.y);
      if (proj.t < 0.01 || proj.t > 0.99) continue;
      const d = screenDist(clientX, clientY, proj.x, proj.y);
      if (d < bestDist) {
        bestDist = d;
        const normX = (proj.x - rect.left) / rect.width;
        const normY = (proj.y - rect.top)  / rect.height;
        best = {
          coords: [normX, normY],
          isFirstPoint: false,
          isEdgeSnap: true,
          regionId: region.id,
          pointIndex: i,
          edgeT: proj.t,
        };
      }
    }
  }
  return best;
}
