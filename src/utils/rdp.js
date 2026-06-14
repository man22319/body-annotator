// ===========================================================================
// Ramer–Douglas–Peucker polygon simplification
// Operates on normalized [0,1] coordinate arrays: [[x, y], ...]
// ===========================================================================

/**
 * Perpendicular distance from point P to line segment A→B.
 */
function perpendicularDist(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;

  if (lenSq < 1e-14) {
    // A and B are effectively the same point
    return Math.hypot(p[0] - a[0], p[1] - a[1]);
  }

  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
  const clampedT = Math.max(0, Math.min(1, t));
  const projX = a[0] + clampedT * dx;
  const projY = a[1] + clampedT * dy;

  return Math.hypot(p[0] - projX, p[1] - projY);
}

/**
 * Classic RDP on an open polyline.
 * Returns simplified array of [x, y] points.
 */
function rdpRecursive(points, epsilon, start, end) {
  if (end - start < 2) {
    return points.slice(start, end + 1);
  }

  let maxDist = 0;
  let maxIdx = start;

  for (let i = start + 1; i < end; i++) {
    const d = perpendicularDist(points[i], points[start], points[end]);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = rdpRecursive(points, epsilon, start, maxIdx);
    const right = rdpRecursive(points, epsilon, maxIdx, end);
    // Join, removing duplicate junction point
    return [...left.slice(0, -1), ...right];
  }

  // All intermediate points within epsilon — drop them
  return [points[start], points[end]];
}

/**
 * RDP simplification for a closed polygon.
 *
 * Strategy: find the vertex farthest from the line connecting its neighbors,
 * use that as the "anchor" split point, then run RDP on two halves of the
 * polygon to avoid artifacts from arbitrary start-point selection.
 *
 * @param {number[][]} points - Array of [x, y] in normalized coords
 * @param {number} epsilon - Tolerance threshold (normalized coord space)
 * @returns {number[][]} Simplified polygon points (closed, no duplicate end)
 */
export function rdpSimplify(points, epsilon) {
  if (!points || points.length <= 3 || epsilon <= 0) return points;

  const n = points.length;

  // Find the point with maximum deviation from its neighbors' baseline
  // to use as a stable anchor (won't be removed by RDP)
  let anchorIdx = 0;
  let maxDev = 0;
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const next = points[(i + 1) % n];
    const d = perpendicularDist(points[i], prev, next);
    if (d > maxDev) {
      maxDev = d;
      anchorIdx = i;
    }
  }

  // Find second anchor — farthest point from the first anchor
  let anchor2Idx = 0;
  let maxDist = 0;
  for (let i = 0; i < n; i++) {
    if (i === anchorIdx) continue;
    const d = Math.hypot(
      points[i][0] - points[anchorIdx][0],
      points[i][1] - points[anchorIdx][1],
    );
    if (d > maxDist) {
      maxDist = d;
      anchor2Idx = i;
    }
  }

  // Ensure anchor1 < anchor2 for consistent ordering
  let a1 = Math.min(anchorIdx, anchor2Idx);
  let a2 = Math.max(anchorIdx, anchor2Idx);

  // Build two open polylines: a1→a2 and a2→a1 (wrapping around)
  const half1 = [];
  for (let i = a1; i <= a2; i++) {
    half1.push(points[i]);
  }

  const half2 = [];
  for (let i = a2; i < n; i++) {
    half2.push(points[i]);
  }
  for (let i = 0; i <= a1; i++) {
    half2.push(points[i]);
  }

  // Simplify each half
  const simplified1 = rdpRecursive(half1, epsilon, 0, half1.length - 1);
  const simplified2 = rdpRecursive(half2, epsilon, 0, half2.length - 1);

  // Merge — remove duplicate junction points
  const result = [
    ...simplified1.slice(0, -1),
    ...simplified2.slice(0, -1),
  ];

  // Safety: must have at least 3 points for a valid polygon
  return result.length >= 3 ? result : points;
}
