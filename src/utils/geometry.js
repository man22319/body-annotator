// ===========================================================================
// GEOMETRY LAYER
// All functions operate on normalized [0,1] coordinates.
// No rounding applied internally — quantization only at export.
// ===========================================================================

export const EPSILON = 1e-9;

export function cross2d(ax, ay, bx, by, cx, cy) {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

export function segmentsProperlyIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = cross2d(cx, cy, dx, dy, ax, ay);
  const d2 = cross2d(cx, cy, dx, dy, bx, by);
  const d3 = cross2d(ax, ay, bx, by, cx, cy);
  const d4 = cross2d(ax, ay, bx, by, dx, dy);
  return (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  );
}

/**
 * Test whether segment P->Q would intersect any existing edge of the polygon
 * being built, excluding adjacent edges at P and (optionally) at Q.
 */
export function newSegmentIntersectsPolygon(pts, p, q, isClosing) {
  const n = pts.length;
  if (n < 2) return { intersects: false };
  const [px, py] = p;
  const [qx, qy] = q;
  for (let i = 0; i < n - 1; i++) {
    if (i === n - 2) continue;
    if (isClosing && i === 0) continue;
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    if (segmentsProperlyIntersect(px, py, qx, qy, ax, ay, bx, by)) {
      return { intersects: true, edgeIndex: i };
    }
  }
  return { intersects: false };
}

/**
 * After adding `candidate` to `pts`, would the polygon be impossible to close
 * without self-intersection?
 */
export function wouldMakeUncloseable(pts, candidate) {
  if (pts.length < 2) return false;
  const hypothetical = [...pts, candidate];
  const result = newSegmentIntersectsPolygon(
    hypothetical,
    hypothetical[hypothetical.length - 1],
    hypothetical[0],
    true,
  );
  return result.intersects;
}

export function validatePolygon(pts) {
  if (!pts || pts.length < 3) {
    return { valid: false, reason: "Polygon requires at least 3 vertices." };
  }
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % n];
    if (Math.abs(ax - bx) < EPSILON && Math.abs(ay - by) < EPSILON) {
      return { valid: false, reason: `Duplicate vertices at index ${i} and ${(i + 1) % n}.` };
    }
  }
  for (let i = 0; i < n; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const [cx, cy] = pts[j];
      const [dx, dy] = pts[(j + 1) % n];
      if (segmentsProperlyIntersect(ax, ay, bx, by, cx, cy, dx, dy)) {
        return { valid: false, reason: `Self-intersection between edge ${i}->${(i+1)%n} and edge ${j}->${(j+1)%n}.` };
      }
    }
  }
  return { valid: true };
}

export function simplifyPolygon(pts) {
  if (pts.length <= 3) return pts;
  const COLLINEAR_EPSILON = 1e-10;
  let prev = pts;
  for (let pass = 0; pass < pts.length; pass++) {
    const next = [];
    const n = prev.length;
    for (let i = 0; i < n; i++) {
      const a = prev[(i - 1 + n) % n];
      const b = prev[i];
      const c = prev[(i + 1) % n];
      if (Math.abs(cross2d(a[0], a[1], b[0], b[1], c[0], c[1])) > COLLINEAR_EPSILON) {
        next.push(b);
      }
    }
    if (next.length === prev.length) break;
    if (next.length < 3) return prev;
    prev = next;
  }
  return prev;
}

export function signedArea(pts) {
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % n];
    area += (x1 * y2 - x2 * y1);
  }
  return area / 2;
}

export function enforceWindingCCW(pts) {
  return signedArea(pts) < 0 ? [...pts].reverse() : pts;
}

export function isNearDuplicate(pts, candidate) {
  if (pts.length === 0) return false;
  const last = pts[pts.length - 1];
  return Math.abs(last[0] - candidate[0]) < EPSILON && Math.abs(last[1] - candidate[1]) < EPSILON;
}
