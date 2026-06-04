import { useState, useRef, useCallback, useEffect } from "react";

const VIEWS = ["front", "back", "side"];

const REGION_COLORS = [
  "#ef4444","#f97316","#eab308","#22c55e",
  "#06b6d4","#6366f1","#ec4899","#14b8a6",
  "#f59e0b","#84cc16","#8b5cf6","#f43f5e",
];

function getColor(index) {
  return REGION_COLORS[index % REGION_COLORS.length];
}

function downloadJSON(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "regions.json";
  a.click();
  URL.revokeObjectURL(url);
}

// ===========================================================================
// GEOMETRY LAYER
// All functions here operate on normalized [0,1] coordinates unless noted.
// No rounding is applied internally — quantization happens only at export.
// ===========================================================================

/** Epsilon for near-duplicate detection (in normalized units, ~0.5px at typical res) */
const EPSILON = 1e-9;

/**
 * Cross product of 2D vectors (A→B) × (A→C).
 * Positive = CCW turn, negative = CW turn, zero = collinear.
 */
function cross2d(ax, ay, bx, by, cx, cy) {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

/**
 * Test whether two segments AB and CD properly intersect.
 * "Properly" means they share an interior point (not just endpoints).
 * Returns true if they cross.
 *
 * Uses the standard orientation / straddle test.
 */
function segmentsProperlyIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = cross2d(cx, cy, dx, dy, ax, ay);
  const d2 = cross2d(cx, cy, dx, dy, bx, by);
  const d3 = cross2d(ax, ay, bx, by, cx, cy);
  const d4 = cross2d(ax, ay, bx, by, dx, dy);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  // Collinear / degenerate cases — treat as non-intersecting for our purposes
  // (we're checking simple polygon invariant, not coincident edges).
  return false;
}

/**
 * Test whether segment P→Q would intersect any existing edge of the polygon
 * being built, *excluding* the last-to-P edge (adjacent at P) and
 * the Q-to-first edge (adjacent at Q, only relevant on closure).
 *
 * @param {number[][]} pts  - existing polygon points (in order)
 * @param {number[]}   p    - start of the new segment [x,y]
 * @param {number[]}   q    - end of the new segment [x,y]
 * @param {boolean}    isClosing - true when q === pts[0] (closure check)
 * @returns {{ intersects: boolean, edgeIndex?: number }}
 */
function newSegmentIntersectsPolygon(pts, p, q, isClosing) {
  const n = pts.length;
  if (n < 2) return { intersects: false };

  const [px, py] = p;
  const [qx, qy] = q;

  for (let i = 0; i < n - 1; i++) {
    // Skip the edge immediately before p (shares endpoint p)
    if (i === n - 2) continue;
    // On closure, also skip the edge from pts[0] to pts[1] (would share q=pts[0])
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
 * Validate a finalized polygon.
 *
 * Checks:
 *  1. At least 3 distinct points
 *  2. No consecutive near-duplicate points (within EPSILON)
 *  3. No self-intersecting edges
 *
 * @param {number[][]} pts - resolved, ordered list of [x,y] pairs (open polygon — no repeated first point)
 * @returns {{ valid: boolean, reason?: string }}
 */
function validatePolygon(pts) {
  if (!pts || pts.length < 3) {
    return { valid: false, reason: "Polygon requires at least 3 vertices." };
  }

  const n = pts.length;

  // Check for consecutive duplicates (including wrap-around last→first)
  for (let i = 0; i < n; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % n];
    if (Math.abs(ax - bx) < EPSILON && Math.abs(ay - by) < EPSILON) {
      return {
        valid: false,
        reason: `Duplicate vertices at index ${i} and ${(i + 1) % n}.`,
      };
    }
  }

  // Check all pairs of non-adjacent edges for proper intersection
  for (let i = 0; i < n; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % n];

    for (let j = i + 2; j < n; j++) {
      // Skip the pair that shares the endpoint between last and first edge
      if (i === 0 && j === n - 1) continue;

      const [cx, cy] = pts[j];
      const [dx, dy] = pts[(j + 1) % n];

      if (segmentsProperlyIntersect(ax, ay, bx, by, cx, cy, dx, dy)) {
        return {
          valid: false,
          reason: `Self-intersection between edge ${i}→${(i+1)%n} and edge ${j}→${(j+1)%n}.`,
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Remove collinear intermediate vertices.
 * A point B is collinear with its neighbors A and C if |cross(A,B,C)| < EPSILON
 * (in normalized space — adjust threshold as needed).
 *
 * Runs multiple passes until stable (handles chains of collinear points).
 *
 * @param {number[][]} pts
 * @returns {number[][]} simplified polygon
 */
function simplifyPolygon(pts) {
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
      const c2d = Math.abs(cross2d(a[0], a[1], b[0], b[1], c[0], c[1]));
      if (c2d > COLLINEAR_EPSILON) {
        next.push(b);
      }
    }

    if (next.length === prev.length) break; // stable
    if (next.length < 3) return prev;       // don't collapse below minimum
    prev = next;
  }

  return prev;
}

/**
 * Compute signed area (shoelace formula).
 * Positive = CCW, Negative = CW.
 */
function signedArea(pts) {
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % n];
    area += (x1 * y2 - x2 * y1);
  }
  return area / 2;
}

/**
 * Enforce counter-clockwise winding order.
 * (Screen-space Y increases downward, so CCW in screen coords = CW mathematically.
 *  We enforce CCW in screen-space, i.e. positive signed area with Y-down axis.)
 *
 * @param {number[][]} pts
 * @returns {number[][]} pts in CCW screen-space order
 */
function enforceWindingCCW(pts) {
  // In Y-down screen space, shoelace area > 0 means CW mathematical = CCW visual.
  // We want CCW visual (= positive area), so if area < 0, reverse.
  return signedArea(pts) < 0 ? [...pts].reverse() : pts;
}

/**
 * Check whether a candidate new point is a near-duplicate of the last placed point.
 * @param {number[][]} pts
 * @param {number[]}   candidate
 * @returns {boolean}
 */
function isNearDuplicate(pts, candidate) {
  if (pts.length === 0) return false;
  const last = pts[pts.length - 1];
  return (
    Math.abs(last[0] - candidate[0]) < EPSILON &&
    Math.abs(last[1] - candidate[1]) < EPSILON
  );
}

// ===========================================================================
// Coordinate utilities — pure functions, no React deps
// ===========================================================================

/**
 * Convert a mouse event to full-precision normalized [0,1] image coordinates.
 * Does NOT apply toFixed — full floating-point precision is retained.
 * Quantization to 4 decimal places happens only at export.
 */
function eventToNorm(e, imgEl) {
  const rect = imgEl.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top)  / rect.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return [x, y];
}

/**
 * Convert a normalized point to page-space pixel coordinates,
 * using the live BoundingClientRect (post-transform).
 */
function normToScreen(normPt, rect) {
  return {
    x: rect.left + normPt[0] * rect.width,
    y: rect.top  + normPt[1] * rect.height,
  };
}

/** Pixel distance between two page-space points. */
function screenDist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

// ===========================================================================
// Snapping resolver
// ===========================================================================

const SNAP_THRESHOLD_PX = 14;

/**
 * Project cursor P onto segment A→B, clamped to the segment.
 * Returns { x, y, t } where t ∈ [0,1].
 */
function projectPointOntoSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  if (lenSq === 0) return { x: ax, y: ay, t: 0 };
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lenSq));
  return { x: ax + t * abx, y: ay + t * aby, t };
}

/**
 * Structured snap resolver.
 *
 * Priority order:
 *   1. First vertex of current polygon (closure) — only when pts.length >= 3
 *   2. Vertices of existing completed regions
 *   3. Edges of existing completed regions — stored as structured references,
 *      NOT flattened to a coordinate here. Coordinates are computed for display
 *      and for the `displayCoords` field only; the canonical snap result carries
 *      the structured reference { type:"edge", regionId, edgeIndex, t }.
 *
 * Edge-snap result shape:
 *   {
 *     coords: [x,y],          ← display/placement coords (full-precision, NO toFixed)
 *     isFirstPoint: false,
 *     isEdgeSnap: true,
 *     regionId: string,
 *     pointIndex: number,     ← edge index (start vertex)
 *     edgeT: number,          ← parameter t ∈ (0.01, 0.99)
 *     snapRef: { type:"edge", regionId, edgeIndex, t }  ← structured ref for storage
 *   }
 */
function resolveSnap(clientX, clientY, rect, currentPoints, regions) {
  // --- Tier 1: first vertex (polygon closure) ---
  if (currentPoints.length >= 3) {
    const first = currentPoints[0];
    const s = normToScreen(first, rect);
    const d = screenDist(clientX, clientY, s.x, s.y);
    if (d < SNAP_THRESHOLD_PX) {
      return { coords: first, isFirstPoint: true };
    }
  }

  // --- Tier 2: vertices of completed regions ---
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

  // --- Tier 3: edges of completed regions ---
  // Returns a structured snap reference; coords are full-precision (no rounding).
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
        // Full-precision normalized coords — no toFixed
        const normX = (proj.x - rect.left) / rect.width;
        const normY = (proj.y - rect.top)  / rect.height;
        best = {
          coords: [normX, normY],
          isFirstPoint: false,
          isEdgeSnap: true,
          regionId: region.id,
          pointIndex: i,
          edgeT: proj.t,
          // Structured reference stored alongside coordinates
          snapRef: { type: "edge", regionId: region.id, edgeIndex: i, t: proj.t },
        };
      }
    }
  }
  return best;
}

// ===========================================================================
// Export helpers
// ===========================================================================

/**
 * Resolve an edge-snap reference to a concrete coordinate.
 * Interpolates between the two vertices of the referenced edge at parameter t.
 *
 * @param {Object} ref   - { type:"edge", regionId, edgeIndex, t }
 * @param {Object} regionMap  - map of id → region
 * @returns {number[] | null}
 */
function resolveEdgeSnapRef(ref, regionMap) {
  const region = regionMap[ref.regionId];
  if (!region) return null;
  const pts = region.points;
  const n = pts.length;
  const a = pts[ref.edgeIndex];
  const b = pts[(ref.edgeIndex + 1) % n];
  return [
    a[0] + ref.t * (b[0] - a[0]),
    a[1] + ref.t * (b[1] - a[1]),
  ];
}

/**
 * Quantize a coordinate to 6 significant decimal places for export.
 * Internal storage always uses full precision.
 */
function quantize(v) {
  return Math.round(v * 1e6) / 1e6;
}

export default function App() {
  const [view, setView] = useState("front");
  const [images, setImages] = useState({ front: null, back: null, side: null });
  const [bounds, setBounds] = useState({ front: null, back: null, side: null });
  const [regionsByView, setRegionsByView] = useState({ front: [], back: [], side: [] });
  const [currentPoints, setCurrentPoints] = useState([]);
  const [regionName, setRegionName] = useState("");
  const [hoveredId, setHoveredId] = useState(null);
  const [geoError, setGeoError] = useState(null); // geometry validation error string

  // Viewport zoom & pan
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [mode, setMode] = useState("draw");
  const [isDragging, setIsDragging] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [activeSnap, setActiveSnap] = useState(null);

  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const dragOffsetStartRef = useRef({ x: 0, y: 0 });

  /**
   * Parallel metadata for currentPoints.
   * snapMetaRef.current[i] is one of:
   *   null                                      — free point
   *   { regionId, pointIndex }                  — vertex snap
   *   { regionId, isEdgeSnap: true,
   *     snapRef: { type, regionId, edgeIndex, t } } — edge snap (structured ref)
   */
  const snapMetaRef = useRef([]);

  const handleImageUpload = useCallback((e, targetView) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImages(prev => ({ ...prev, [targetView]: url }));
    setBounds(prev => ({ ...prev, [targetView]: null }));
  }, []);

  useEffect(() => {
    if (!imgRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setBounds(prev => ({ ...prev, [view]: { width, height } }));
      }
    });
    observer.observe(imgRef.current);
    return () => observer.disconnect();
  }, [images, view]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === "Space" && document.activeElement.tagName !== "INPUT") {
        e.preventDefault();
        setIsSpacePressed(true);
      }
    };
    const handleKeyUp = (e) => {
      if (e.code === "Space") setIsSpacePressed(false);
    };
    const handleBlur = () => setIsSpacePressed(false);

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  const handleMouseDown = useCallback((e) => {
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    const isPanActive = mode === "pan" || isSpacePressed || e.button === 1 || e.button === 2;
    if (!isPanActive) return;
    if (e.button === 2) e.preventDefault();
    setIsDragging(true);
    dragOffsetStartRef.current = { ...panOffset };
  }, [mode, isSpacePressed, panOffset]);

  useEffect(() => {
    if (!isDragging) return;
    const handleWindowMouseMove = (e) => {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPanOffset({ x: dragOffsetStartRef.current.x + dx, y: dragOffsetStartRef.current.y + dy });
    };
    const handleWindowMouseUp = () => setIsDragging(false);
    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
    };
  }, [isDragging]);

  // ---------------------------------------------------------------------------
  // Snap helper
  // ---------------------------------------------------------------------------
  const getSnappedPoint = useCallback((clientX, clientY) => {
    if (!imgRef.current) return null;
    const rect = imgRef.current.getBoundingClientRect();
    return resolveSnap(clientX, clientY, rect, currentPoints, regionsByView[view]);
  }, [currentPoints, regionsByView, view]);

  // ---------------------------------------------------------------------------
  // Geometry validation for point placement (live, per-click)
  // Checks whether adding the new segment (last point → candidate) would
  // create a self-intersection with existing edges of the in-progress polygon.
  // ---------------------------------------------------------------------------
  const wouldCreateIntersection = useCallback((candidate) => {
    if (currentPoints.length < 2) return false;
    const result = newSegmentIntersectsPolygon(
      currentPoints,
      currentPoints[currentPoints.length - 1],
      candidate,
      false
    );
    return result.intersects;
  }, [currentPoints]);

  /**
   * Check whether closing the polygon (connecting last point → first point)
   * would create a self-intersection.
   */
  const wouldClosingIntersect = useCallback(() => {
    if (currentPoints.length < 3) return false;
    const result = newSegmentIntersectsPolygon(
      currentPoints,
      currentPoints[currentPoints.length - 1],
      currentPoints[0],
      true
    );
    return result.intersects;
  }, [currentPoints]);

  // ---------------------------------------------------------------------------
  // handleFinishRegion
  // ---------------------------------------------------------------------------
  const handleFinishRegion = useCallback(() => {
    if (currentPoints.length < 3) return;

    // 1. Check closing segment doesn't intersect existing edges
    if (wouldClosingIntersect()) {
      setGeoError("Cannot close: closing segment intersects existing edges. Undo the last point(s) and try again.");
      return;
    }

    // 2. Simplify collinear points
    const simplified = simplifyPolygon(currentPoints);

    // 3. Full validation of the finalized polygon
    const validation = validatePolygon(simplified);
    if (!validation.valid) {
      setGeoError(`Invalid polygon: ${validation.reason} Please undo and correct.`);
      return;
    }

    // 4. Enforce consistent winding (CCW in screen-space)
    const wound = enforceWindingCCW(simplified);

    const name = regionName.trim() || `${view}_region_${regionsByView[view].length + 1}`;
    const region = {
      id: crypto.randomUUID(),
      name,
      view,
      points: wound,
    };
    setRegionsByView(prev => ({ ...prev, [view]: [...prev[view], region] }));
    setCurrentPoints([]);
    setRegionName("");
    setActiveSnap(null);
    setGeoError(null);
    snapMetaRef.current = [];
  }, [currentPoints, regionName, view, regionsByView, wouldClosingIntersect]);

  // ---------------------------------------------------------------------------
  // Canvas interaction handlers
  // ---------------------------------------------------------------------------
  const handleCanvasMouseMove = useCallback((e) => {
    if (isDragging) return;
    if (mode === "draw" && !isSpacePressed && images[view]) {
      const snap = getSnappedPoint(e.clientX, e.clientY);
      setActiveSnap(snap);
    } else {
      setActiveSnap(null);
    }
  }, [mode, isSpacePressed, isDragging, images, view, getSnappedPoint]);

  const handleCanvasClick = useCallback((e) => {
    if (e.button !== 0) return;
    if (mode === "pan" || isSpacePressed) return;
    if (!images[view] || !imgRef.current) return;

    const dx = Math.abs(e.clientX - dragStartRef.current.x);
    const dy = Math.abs(e.clientY - dragStartRef.current.y);
    if (dx > 3 || dy > 3) return;

    const snap = activeSnap ?? getSnappedPoint(e.clientX, e.clientY);

    // --- Closure via first-point snap ---
    if (snap?.isFirstPoint) {
      handleFinishRegion();
      setActiveSnap(null);
      return;
    }

    // Determine the candidate coordinate to be placed
    let candidate;
    let meta = null;

    if (snap) {
      candidate = snap.coords;
      if (snap.regionId) {
        meta = snap.isEdgeSnap
          ? { regionId: snap.regionId, isEdgeSnap: true, snapRef: snap.snapRef }
          : { regionId: snap.regionId, pointIndex: snap.pointIndex, isEdgeSnap: false };
      }
    } else {
      candidate = eventToNorm(e, imgRef.current);
      if (!candidate) return;
    }

    // --- Vertex hygiene: reject near-duplicate of last point ---
    if (isNearDuplicate(currentPoints, candidate)) {
      setGeoError("Duplicate point: too close to the previous vertex.");
      return;
    }

    // --- Self-intersection guard: reject if new segment would cross existing edges ---
    if (wouldCreateIntersection(candidate)) {
      setGeoError("Cannot place point: the new segment would create a self-intersection.");
      return;
    }

    // Clear any previous error
    setGeoError(null);

    // --- Shared-edge auto-close ---
    const firstMeta = snapMetaRef.current[0];
    const isSharedEdgeClose =
      meta &&
      firstMeta &&
      !meta.isEdgeSnap &&
      !firstMeta?.isEdgeSnap &&
      meta.regionId === firstMeta?.regionId &&
      meta.pointIndex !== firstMeta?.pointIndex &&
      currentPoints.length >= 1;

    if (isSharedEdgeClose) {
      const closed = [...currentPoints, candidate];
      if (closed.length >= 3) {
        // Validate before committing
        const simplified = simplifyPolygon(closed);
        const validation = validatePolygon(simplified);
        if (!validation.valid) {
          setGeoError(`Invalid polygon on auto-close: ${validation.reason}`);
          return;
        }
        const wound = enforceWindingCCW(simplified);
        const name = regionName.trim() || `${view}_region_${regionsByView[view].length + 1}`;
        const region = { id: crypto.randomUUID(), name, view, points: wound };
        setRegionsByView(p => ({ ...p, [view]: [...p[view], region] }));
        setCurrentPoints([]);
        setRegionName("");
        setActiveSnap(null);
        setGeoError(null);
        snapMetaRef.current = [];
      } else {
        snapMetaRef.current = [...snapMetaRef.current, meta];
        setCurrentPoints(closed);
      }
      return;
    }

    // --- Normal placement ---
    snapMetaRef.current = [...snapMetaRef.current, meta];
    setCurrentPoints(prev => [...prev, candidate]);
  }, [
    images, view, mode, isSpacePressed, activeSnap, currentPoints,
    regionName, regionsByView, getSnappedPoint, handleFinishRegion,
    wouldCreateIntersection,
  ]);

  const handleDoubleClick = useCallback((e) => {
    if (e.target === containerRef.current || e.target === imgRef.current) {
      setZoom(1);
      setPanOffset({ x: 0, y: 0 });
    }
  }, []);

  const handleContextMenu = useCallback((e) => {
    const isPanActive = mode === "pan" || isSpacePressed || isDragging || e.button === 2;
    if (isPanActive) e.preventDefault();
  }, [mode, isSpacePressed, isDragging]);

  const handleUndoPoint = useCallback(() => {
    snapMetaRef.current = snapMetaRef.current.slice(0, -1);
    setCurrentPoints(prev => prev.slice(0, -1));
    setGeoError(null);
  }, []);

  const handleDeleteRegion = useCallback((id) => {
    setRegionsByView(prev => ({
      ...prev,
      [view]: prev[view].filter(r => r.id !== id),
    }));
  }, [view]);

  // ---------------------------------------------------------------------------
  // Export
  // Resolves all edge-snap structured references to concrete coordinates,
  // re-validates every polygon, enforces winding, and quantizes at 6dp.
  // ---------------------------------------------------------------------------
  const handleExport = useCallback(() => {
    const regionMap = {};
    for (const v of VIEWS) {
      for (const r of regionsByView[v]) {
        regionMap[r.id] = r;
      }
    }

    const output = {};
    const errors = [];

    for (const v of VIEWS) {
      for (const region of regionsByView[v]) {
        const key = `${v}_${region.name}`;

        // Resolve any edge-snap structural references in the stored points.
        // (In the current flow, points stored in completed regions are already
        // resolved coordinates; this guard handles future structured-ref storage.)
        const resolvedPoints = region.points.map((pt) => {
          if (pt && pt.__snapRef) {
            const resolved = resolveEdgeSnapRef(pt.__snapRef, regionMap);
            return resolved || pt;
          }
          return pt;
        });

        // Re-validate before export
        const validation = validatePolygon(resolvedPoints);
        if (!validation.valid) {
          errors.push(`${key}: ${validation.reason}`);
          continue;
        }

        // Enforce winding, simplify, then quantize
        const simplified = simplifyPolygon(resolvedPoints);
        const wound = enforceWindingCCW(simplified);
        const quantized = wound.map(([x, y]) => [quantize(x), quantize(y)]);

        output[key] = {
          view: region.view,
          winding: "ccw",
          pointCount: quantized.length,
          points: quantized,
        };
      }
    }

    if (errors.length > 0) {
      alert(
        `Export blocked — invalid polygon(s) detected:\n\n${errors.join("\n")}\n\nPlease delete and redraw the affected regions.`
      );
      return;
    }

    downloadJSON(output);
  }, [regionsByView]);

  const totalRegions = VIEWS.reduce((acc, v) => acc + regionsByView[v].length, 0);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    setZoom(z => Math.min(8, Math.max(0.5, z * factor)));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const toSVGStr = useCallback((pts) => {
    const b = bounds[view];
    if (!b) return "";
    return pts.map(p => `${p[0] * b.width},${p[1] * b.height}`).join(" ");
  }, [bounds, view]);

  const toXY = useCallback((pt) => {
    const b = bounds[view];
    if (!b) return { x: 0, y: 0 };
    return { x: pt[0] * b.width, y: pt[1] * b.height };
  }, [bounds, view]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div style={{
      width: "100%",
      height: "100%",
      background: "#0f0f0f",
      color: "#e8e6e0",
      fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        borderBottom: "1px solid #2a2a2a",
        padding: "12px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "#111",
        zIndex: 5,
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", color: "#e8e6e0", textTransform: "uppercase" }}>
            Region Annotator
          </span>
          <span style={{ fontSize: 11, color: "#555", letterSpacing: "0.06em" }}>
            body → named polygons
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#555" }}>{totalRegions} region{totalRegions !== 1 ? "s" : ""}</span>
          <button onClick={handleExport} style={btnStyle("#1a3a1a", "#4ade80", totalRegions === 0)}>
            Export JSON ↓
          </button>
        </div>
      </div>

      {/* View tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #2a2a2a", background: "#111", zIndex: 5 }}>
        {VIEWS.map(v => (
          <button key={v} onClick={() => {
            setView(v);
            setCurrentPoints([]);
            snapMetaRef.current = [];
            setZoom(1);
            setPanOffset({ x: 0, y: 0 });
            setActiveSnap(null);
            setGeoError(null);
          }} style={{
            padding: "8px 20px",
            background: view === v ? "#1a1a1a" : "transparent",
            color: view === v ? "#e8e6e0" : "#555",
            border: "none",
            borderBottom: view === v ? "2px solid #e8e6e0" : "2px solid transparent",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 12,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}>
            {v}
            {regionsByView[v].length > 0 && (
              <span style={{
                marginLeft: 6, fontSize: 10,
                background: "#2a2a2a", color: "#888",
                borderRadius: 9, padding: "1px 5px",
              }}>{regionsByView[v].length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Main Container */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Canvas */}
        <div
          ref={containerRef}
          style={{
            flex: 1,
            position: "relative",
            overflow: "hidden",
            background: "#0a0a0a",
            cursor: !images[view]
              ? "default"
              : (mode === "pan" || isSpacePressed)
                ? (isDragging ? "grabbing" : "grab")
                : "crosshair",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onClick={handleCanvasClick}
          onDoubleClick={handleDoubleClick}
          onContextMenu={handleContextMenu}
          onMouseLeave={() => setActiveSnap(null)}
        >
          {!images[view] ? (
            <label style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
              cursor: "pointer",
              color: "#444",
            }}>
              <div style={{
                width: 80, height: 80,
                border: "1px dashed #333",
                borderRadius: 4,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 28,
                color: "#333",
              }}>+</div>
              <span style={{ fontSize: 12, letterSpacing: "0.08em" }}>Load {view}.png</span>
              <input type="file" accept="image/*" style={{ display: "none" }}
                onChange={e => handleImageUpload(e, view)} />
            </label>
          ) : (
            <div style={{
              position: "relative",
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
              transformOrigin: "center center",
              userSelect: "none",
              transition: isDragging ? "none" : "transform 0.15s ease-out",
            }}>
              <img
                ref={imgRef}
                src={images[view]}
                alt={view}
                draggable={false}
                style={{
                  display: "block",
                  maxHeight: "calc(100vh - 160px)",
                  maxWidth: "100%",
                  pointerEvents: "none",
                }}
              />
              {/* SVG overlay */}
              <svg
                style={{
                  position: "absolute",
                  top: 0, left: 0,
                  width: "100%",
                  height: "100%",
                  overflow: "visible",
                }}
              >
                {/* Completed regions */}
                {regionsByView[view].map((region, ri) => {
                  const color = getColor(ri);
                  const pts = toSVGStr(region.points);
                  const first = toXY(region.points[0]);
                  const sw = (hoveredId === region.id ? 2 : 1.5) / zoom;
                  const labelSize = 10 / zoom;
                  return (
                    <g key={region.id}>
                      <polygon
                        points={pts}
                        fill={color}
                        fillOpacity={hoveredId === region.id ? 0.45 : 0.25}
                        stroke={color}
                        strokeWidth={sw}
                        vectorEffect="non-scaling-stroke"
                        style={{ cursor: "pointer" }}
                        onMouseEnter={() => setHoveredId(region.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        onClick={e => { if (mode !== "draw") e.stopPropagation(); }}
                      />
                      <text
                        x={first.x} y={first.y - 6 / zoom}
                        fill={color}
                        fontSize={labelSize}
                        fontFamily="IBM Plex Mono, monospace"
                        letterSpacing="0.06em"
                        style={{ pointerEvents: "none", userSelect: "none" }}
                      >
                        {region.name}
                      </text>
                    </g>
                  );
                })}

                {/* In-progress polyline */}
                {currentPoints.length >= 2 && (
                  <polyline
                    points={toSVGStr(currentPoints)}
                    fill="none"
                    stroke="#facc15"
                    strokeWidth={1.5 / zoom}
                    strokeDasharray={`${4 / zoom} ${2 / zoom}`}
                    vectorEffect="non-scaling-stroke"
                  />
                )}

                {/* Current vertex dots */}
                {currentPoints.map((pt, i) => {
                  const { x, y } = toXY(pt);
                  const r = (i === 0 ? 4 : 2.5) / zoom;
                  const sw = 1 / zoom;
                  return (
                    <circle
                      key={i}
                      cx={x} cy={y}
                      r={r}
                      fill={i === 0 ? "#facc15" : "#fde68a"}
                      stroke="#0f0f0f"
                      strokeWidth={sw}
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                })}

                {/* Snapping indicator */}
                {activeSnap && (() => {
                  const { x, y } = toXY(activeSnap.coords);
                  const sw = 1.5 / zoom;
                  const fontSize = 9 / zoom;
                  const labelOffset = 10 / zoom;

                  if (activeSnap.isEdgeSnap) {
                    const b = bounds[view];
                    if (!b) return null;
                    const n = regionsByView[view].find(r => r.id === activeSnap.regionId);
                    if (!n) return null;
                    const pts = n.points;
                    const ai = activeSnap.pointIndex;
                    const bi = (ai + 1) % pts.length;
                    const ex = pts[bi][0] * b.width  - pts[ai][0] * b.width;
                    const ey = pts[bi][1] * b.height - pts[ai][1] * b.height;
                    const elen = Math.hypot(ex, ey) || 1;
                    const px = -ey / elen, py = ex / elen;
                    const tickLen = 6 / zoom;
                    return (
                      <g style={{ pointerEvents: "none" }}>
                        <line
                          x1={pts[ai][0] * b.width}  y1={pts[ai][1] * b.height}
                          x2={pts[bi][0] * b.width}  y2={pts[bi][1] * b.height}
                          stroke="#a78bfa" strokeWidth={2 / zoom}
                          strokeLinecap="round" vectorEffect="non-scaling-stroke"
                        />
                        <line
                          x1={x - px * tickLen} y1={y - py * tickLen}
                          x2={x + px * tickLen} y2={y + py * tickLen}
                          stroke="#a78bfa" strokeWidth={sw}
                          strokeLinecap="round" vectorEffect="non-scaling-stroke"
                        />
                        <circle cx={x} cy={y} r={2.5 / zoom}
                          fill="#a78bfa" vectorEffect="non-scaling-stroke" />
                      </g>
                    );
                  }

                  const r = (activeSnap.isFirstPoint ? 7 : 5) / zoom;
                  return (
                    <g>
                      <circle
                        cx={x} cy={y} r={r}
                        fill={activeSnap.isFirstPoint ? "rgba(74, 222, 128, 0.2)" : "rgba(250, 204, 21, 0.15)"}
                        stroke={activeSnap.isFirstPoint ? "#4ade80" : "#facc15"}
                        strokeWidth={sw}
                        strokeDasharray={`${3 / zoom} ${2 / zoom}`}
                        style={{ pointerEvents: "none" }}
                      />
                      {activeSnap.isFirstPoint && (
                        <text
                          x={x + labelOffset} y={y + fontSize * 0.4}
                          fill="#4ade80" fontSize={fontSize}
                          fontFamily="IBM Plex Mono, monospace"
                          style={{ pointerEvents: "none", userSelect: "none", fontWeight: "bold" }}
                        >
                          Close
                        </text>
                      )}
                    </g>
                  );
                })()}
              </svg>
            </div>
          )}

          {/* Geometry error banner — visible, non-modal, dismissable */}
          {geoError && (
            <div style={{
              position: "absolute",
              top: 12,
              left: "50%",
              transform: "translateX(-50%)",
              background: "#1a0808",
              border: "1px solid #7f1d1d",
              color: "#fca5a5",
              padding: "8px 14px",
              borderRadius: 4,
              fontSize: 11,
              fontFamily: "IBM Plex Mono, monospace",
              letterSpacing: "0.04em",
              zIndex: 20,
              maxWidth: "calc(100% - 48px)",
              display: "flex",
              alignItems: "center",
              gap: 10,
              boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
            }}>
              <span style={{ flexShrink: 0, opacity: 0.7 }}>⚠</span>
              <span style={{ flex: 1 }}>{geoError}</span>
              <button
                onClick={() => setGeoError(null)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#f87171",
                  cursor: "pointer",
                  fontSize: 14,
                  padding: "0 2px",
                  lineHeight: 1,
                  flexShrink: 0,
                }}
              >×</button>
            </div>
          )}

          {/* Floating Workspace Toolbar */}
          {images[view] && (
            <div style={{
              position: "absolute",
              bottom: 12,
              right: 12,
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "rgba(17, 17, 17, 0.85)",
              backdropFilter: "blur(8px)",
              border: "1px solid #2a2a2a",
              padding: "4px 8px",
              borderRadius: 6,
              zIndex: 10,
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.5)",
            }}>
              <button
                onClick={() => setMode(m => m === "draw" ? "pan" : "draw")}
                style={toolbarBtnStyle(mode === "pan" || isSpacePressed)}
                title="Toggle Draw / Pan Mode (Spacebar)"
              >
                {mode === "pan" || isSpacePressed ? "✋ Pan" : "✏️ Draw"}
              </button>

              <div style={{ width: 1, height: 16, background: "#2a2a2a", margin: "0 4px" }} />

              <button
                onClick={() => setZoom(z => Math.max(0.5, z / 1.25))}
                style={toolbarBtnStyle(false)}
                title="Zoom Out (Scroll Down)"
              >-</button>
              <span style={{ fontSize: 11, minWidth: 42, textAlign: "center", userSelect: "none" }}>
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom(z => Math.min(8, z * 1.25))}
                style={toolbarBtnStyle(false)}
                title="Zoom In (Scroll Up)"
              >+</button>

              <div style={{ width: 1, height: 16, background: "#2a2a2a", margin: "0 4px" }} />

              <button
                onClick={() => { setZoom(1); setPanOffset({ x: 0, y: 0 }); }}
                style={toolbarBtnStyle(false)}
                title="Reset Zoom & Pan (Double Click Background)"
              >↺</button>
            </div>
          )}

          {images[view] && (
            <label style={{
              position: "absolute",
              bottom: 12, left: 12,
              fontSize: 10, color: "#888",
              cursor: "pointer",
              background: "#111",
              padding: "4px 8px",
              border: "1px solid #222",
              borderRadius: 4,
              letterSpacing: "0.06em",
              zIndex: 10,
            }}>
              swap image
              <input type="file" accept="image/*" style={{ display: "none" }}
                onChange={e => handleImageUpload(e, view)} />
            </label>
          )}
        </div>

        {/* Sidebar */}
        <div style={{
          width: 240,
          background: "#111",
          borderLeft: "1px solid #2a2a2a",
          display: "flex",
          flexDirection: "column",
          fontSize: 12,
          zIndex: 5,
        }}>
          {/* Draw controls */}
          <div style={{ padding: "16px", borderBottom: "1px solid #1e1e1e" }}>
            <div style={{ color: "#555", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
              New Region
            </div>
            <input
              value={regionName}
              onChange={e => setRegionName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleFinishRegion(); }}
              placeholder={`${view}_chest`}
              style={{
                width: "100%",
                background: "#0f0f0f",
                border: "1px solid #2a2a2a",
                borderRadius: 3,
                color: "#e8e6e0",
                fontFamily: "inherit",
                fontSize: 12,
                padding: "6px 8px",
                marginBottom: 10,
                boxSizing: "border-box",
                outline: "none",
              }}
            />
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <button
                onClick={handleFinishRegion}
                disabled={currentPoints.length < 3}
                style={btnStyle("#1a2a3a", "#60a5fa", currentPoints.length < 3)}
              >
                ✓ Finish ({currentPoints.length}pt)
              </button>
              <button
                onClick={handleUndoPoint}
                disabled={currentPoints.length === 0}
                style={btnStyle("#2a1a1a", "#f87171", currentPoints.length === 0)}
              >
                ← Undo
              </button>
            </div>
            {currentPoints.length > 0 && (
              <button
                onClick={() => { snapMetaRef.current = []; setCurrentPoints([]); setGeoError(null); }}
                style={{ ...btnStyle("#1a1a1a", "#555", false), width: "100%", fontSize: 11 }}
              >
                Discard
              </button>
            )}
          </div>

          {/* Region list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>
            <div style={{ color: "#555", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
              Regions · {view}
            </div>
            {regionsByView[view].length === 0 ? (
              <div style={{ color: "#333", fontSize: 11, lineHeight: 1.6 }}>
                Click the image<br />to place vertices.<br />3+ points to finish.
              </div>
            ) : (
              regionsByView[view].map((region, ri) => {
                const color = getColor(ri);
                return (
                  <div
                    key={region.id}
                    onMouseEnter={() => setHoveredId(region.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "5px 7px",
                      marginBottom: 4,
                      borderRadius: 3,
                      background: hoveredId === region.id ? "#1a1a1a" : "transparent",
                      border: `1px solid ${hoveredId === region.id ? "#2a2a2a" : "transparent"}`,
                      cursor: "default",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: "#c8c6c0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {region.name}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                      <span style={{ fontSize: 10, color: "#444" }}>{region.points.length}pt</span>
                      <button
                        onClick={() => handleDeleteRegion(region.id)}
                        style={{ background: "none", border: "none", color: "#444", cursor: "pointer", fontSize: 13, padding: "0 2px", lineHeight: 1 }}
                        title="Delete region"
                      >×</button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* All views summary */}
          <div style={{ padding: "12px", borderTop: "1px solid #1e1e1e" }}>
            <div style={{ color: "#555", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
              All Views
            </div>
            {VIEWS.map(v => (
              <div key={v} style={{
                display: "flex", justifyContent: "space-between",
                fontSize: 11, color: v === view ? "#e8e6e0" : "#444",
                marginBottom: 4,
              }}>
                <span>{v}</span>
                <span>{regionsByView[v].length} region{regionsByView[v].length !== 1 ? "s" : ""}</span>
              </div>
            ))}
            <button
              onClick={handleExport}
              disabled={totalRegions === 0}
              style={{ ...btnStyle("#1a3a1a", "#4ade80", totalRegions === 0), width: "100%", marginTop: 10 }}
            >
              Export JSON ↓
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function btnStyle(bg, fg, disabled) {
  return {
    background: disabled ? "#161616" : bg,
    color: disabled ? "#333" : fg,
    border: `1px solid ${disabled ? "#222" : fg + "44"}`,
    borderRadius: 3,
    padding: "5px 10px",
    fontSize: 11,
    fontFamily: "IBM Plex Mono, monospace",
    letterSpacing: "0.06em",
    cursor: disabled ? "not-allowed" : "pointer",
    whiteSpace: "nowrap",
    transition: "background 0.2s, color 0.2s",
  };
}

function toolbarBtnStyle(active) {
  return {
    background: active ? "rgba(96, 165, 250, 0.15)" : "transparent",
    color: active ? "#60a5fa" : "#888",
    border: "none",
    borderRadius: 4,
    padding: "4px 8px",
    fontSize: 11,
    fontFamily: "inherit",
    cursor: "pointer",
    outline: "none",
    transition: "background 0.2s, color 0.2s",
  };
}
