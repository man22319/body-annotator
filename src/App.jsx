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

// ---------------------------------------------------------------------------
// Coordinate utilities — pure functions, no React deps
// ---------------------------------------------------------------------------

/**
 * Convert a mouse event to normalized [0,1] image coordinates.
 * Uses the transformed BoundingClientRect of imgEl (correct: includes zoom/pan).
 * Returns null if the point is outside the image.
 */
function eventToNorm(e, imgEl) {
  const rect = imgEl.getBoundingClientRect();
  const x = parseFloat(((e.clientX - rect.left) / rect.width).toFixed(4));
  const y = parseFloat(((e.clientY - rect.top) / rect.height).toFixed(4));
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

/**
 * Pixel distance between two page-space points.
 */
function screenDist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

// ---------------------------------------------------------------------------
// Snapping resolver
// ---------------------------------------------------------------------------

// Snap threshold in screen pixels — constant regardless of zoom.
// getBoundingClientRect() already returns post-transform coords, so distances
// computed from it are already in real screen pixels. No zoom scaling needed.
const SNAP_THRESHOLD_PX = 14;

/**
 * Structured snap resolver.
 *
 * Priority order:
 *   1. First vertex of current polygon (closure) — only when pts.length >= 3
 *   2. Vertices of existing completed regions (shared edges between polygons)
 *
 * Snapping to the polygon's own non-first vertices is intentionally excluded:
 * it causes false snaps when drawing near recently placed points and
 * interferes with fine placement at high zoom.
 *
 * The threshold is a fixed screen-pixel distance so the snap feel is
 * identical regardless of zoom level. normToScreen uses getBoundingClientRect
 * which already reflects the CSS transform, giving true screen coordinates.
 *
 * @param {number} clientX
 * @param {number} clientY
 * @param {DOMRect} rect    - imgEl.getBoundingClientRect() (post-transform)
 * @param {number[][]} currentPoints
 * @param {object[]} regions - completed regions for current view
 * @returns {{ coords: number[], isFirstPoint: boolean } | null}
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

  // --- Tier 2: vertices of completed regions (shared-edge snapping) ---
  let best = null;
  let bestDist = SNAP_THRESHOLD_PX;

  for (const region of regions) {
    for (const pt of region.points) {
      const s = normToScreen(pt, rect);
      const d = screenDist(clientX, clientY, s.x, s.y);
      if (d < bestDist) {
        bestDist = d;
        best = { coords: pt, isFirstPoint: false };
      }
    }
  }
  return best;
}

export default function App() {
  const [view, setView] = useState("front");
  const [images, setImages] = useState({ front: null, back: null, side: null });
  const [bounds, setBounds] = useState({ front: null, back: null, side: null });
  const [regionsByView, setRegionsByView] = useState({ front: [], back: [], side: [] });
  const [currentPoints, setCurrentPoints] = useState([]);
  const [regionName, setRegionName] = useState("");
  const [hoveredId, setHoveredId] = useState(null);
  
  // Viewport zoom & pan
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [mode, setMode] = useState("draw"); // "draw" or "pan"
  const [isDragging, setIsDragging] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [activeSnap, setActiveSnap] = useState(null);

  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const dragOffsetStartRef = useRef({ x: 0, y: 0 });

  const handleImageUpload = useCallback((e, targetView) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImages(prev => ({ ...prev, [targetView]: url }));
    setBounds(prev => ({ ...prev, [targetView]: null }));
  }, []);

  // Set up ResizeObserver to track the unscaled layout bounds of the image.
  // This handles initial load, window resize, and view switches automatically.
  useEffect(() => {
    if (!imgRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // contentRect gives the dimensions before CSS scale/translate transforms are applied
        const { width, height } = entry.contentRect;
        setBounds(prev => ({ ...prev, [view]: { width, height } }));
      }
    });

    observer.observe(imgRef.current);
    return () => observer.disconnect();
  }, [images, view]);

  // Track Spacebar to toggle pan mode temporarily
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === "Space" && document.activeElement.tagName !== "INPUT") {
        e.preventDefault();
        setIsSpacePressed(true);
      }
    };

    const handleKeyUp = (e) => {
      if (e.code === "Space") {
        setIsSpacePressed(false);
      }
    };

    const handleBlur = () => {
      setIsSpacePressed(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  // Handle canvas mouse down to start panning
  const handleMouseDown = useCallback((e) => {
    // Always track mouse start position to calculate drag distance correctly in handleCanvasClick
    dragStartRef.current = { x: e.clientX, y: e.clientY };

    const isPanActive = mode === "pan" || isSpacePressed || e.button === 1 || e.button === 2;
    if (!isPanActive) return;

    if (e.button === 2) {
      e.preventDefault();
    }

    setIsDragging(true);
    dragOffsetStartRef.current = { ...panOffset };
  }, [mode, isSpacePressed, panOffset]);

  // Handle window mouse move and mouse up when panning is active
  useEffect(() => {
    if (!isDragging) return;

    const handleWindowMouseMove = (e) => {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPanOffset({
        x: dragOffsetStartRef.current.x + dx,
        y: dragOffsetStartRef.current.y + dy,
      });
    };

    const handleWindowMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
    };
  }, [isDragging]);

  // ---------------------------------------------------------------------------
  // Snap helper — thin wrapper around the module-level resolveSnap
  // ---------------------------------------------------------------------------
  const getSnappedPoint = useCallback((clientX, clientY) => {
    if (!imgRef.current) return null;
    const rect = imgRef.current.getBoundingClientRect();
    return resolveSnap(clientX, clientY, rect, currentPoints, regionsByView[view]);
  }, [currentPoints, regionsByView, view]);

  // ---------------------------------------------------------------------------
  // handleFinishRegion — declared BEFORE handleCanvasClick so it can be
  // referenced in handleCanvasClick's dependency array without a TDZ error.
  // ---------------------------------------------------------------------------
  const handleFinishRegion = useCallback(() => {
    if (currentPoints.length < 3) return;
    const name = regionName.trim() || `${view}_region_${regionsByView[view].length + 1}`;
    const region = {
      id: crypto.randomUUID(),
      name,
      view,
      points: currentPoints,
    };
    setRegionsByView(prev => ({ ...prev, [view]: [...prev[view], region] }));
    setCurrentPoints([]);
    setRegionName("");
    setActiveSnap(null);
  }, [currentPoints, regionName, view, regionsByView]);

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

    // Suppress clicks that were drags
    const dx = Math.abs(e.clientX - dragStartRef.current.x);
    const dy = Math.abs(e.clientY - dragStartRef.current.y);
    if (dx > 3 || dy > 3) return;

    // Re-use the already-computed activeSnap when available so the click
    // snaps to exactly the vertex the indicator showed.  Fall back to a
    // fresh resolve for edge cases (first click, touch, etc.).
    const snap = activeSnap ?? getSnappedPoint(e.clientX, e.clientY);

    if (snap?.isFirstPoint) {
      // resolveSnap only sets isFirstPoint when currentPoints.length >= 3
      handleFinishRegion();
      setActiveSnap(null);
      return;
    }

    if (snap) {
      setCurrentPoints(prev => [...prev, snap.coords]);
      return;
    }

    const pt = eventToNorm(e, imgRef.current);
    if (!pt) return;
    setCurrentPoints(prev => [...prev, pt]);
  }, [images, view, mode, isSpacePressed, activeSnap, getSnappedPoint, handleFinishRegion]);

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
    setCurrentPoints(prev => prev.slice(0, -1));
  }, []);

  const handleDeleteRegion = useCallback((id) => {
    setRegionsByView(prev => ({
      ...prev,
      [view]: prev[view].filter(r => r.id !== id),
    }));
  }, [view]);

  const handleExport = useCallback(() => {
    const output = {};
    for (const v of VIEWS) {
      for (const region of regionsByView[v]) {
        const key = `${v}_${region.name}`;
        output[key] = { view: region.view, points: region.points };
      }
    }
    downloadJSON(output);
  }, [regionsByView]);

  const totalRegions = VIEWS.reduce((acc, v) => acc + regionsByView[v].length, 0);

  // Multiplicative wheel zoom: each scroll tick multiplies by a fixed factor,
  // so the zoom step feels proportionally equal whether at 50% or 800%.
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
            setZoom(1);
            setPanOffset({ x: 0, y: 0 });
            setActiveSnap(null);
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
              {/* SVG overlay — sized to match img exactly */}
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
                        onClick={e => e.stopPropagation()}
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

                {/* Current vertex dots — radius and stroke divided by zoom so
                    they stay a constant screen size regardless of zoom level */}
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

                {/* Snapping indicator — sizes divided by zoom for screen-invariant appearance */}
                {activeSnap && (() => {
                  const { x, y } = toXY(activeSnap.coords);
                  const r = (activeSnap.isFirstPoint ? 7 : 5) / zoom;
                  const sw = 1.5 / zoom;
                  const fontSize = 9 / zoom;
                  const labelOffset = 10 / zoom;
                  return (
                    <g>
                      <circle
                        cx={x} cy={y}
                        r={r}
                        fill={activeSnap.isFirstPoint ? "rgba(74, 222, 128, 0.2)" : "rgba(250, 204, 21, 0.15)"}
                        stroke={activeSnap.isFirstPoint ? "#4ade80" : "#facc15"}
                        strokeWidth={sw}
                        strokeDasharray={`${3 / zoom} ${2 / zoom}`}
                        style={{ pointerEvents: "none" }}
                      />
                      {activeSnap.isFirstPoint && (
                        <text
                          x={x + labelOffset} y={y + fontSize * 0.4}
                          fill="#4ade80"
                          fontSize={fontSize}
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
              {/* Mode Toggle */}
              <button
                onClick={() => setMode(m => m === "draw" ? "pan" : "draw")}
                style={toolbarBtnStyle(mode === "pan" || isSpacePressed)}
                title="Toggle Draw / Pan Mode (Spacebar)"
              >
                {mode === "pan" || isSpacePressed ? "✋ Pan" : "✏️ Draw"}
              </button>

              <div style={{ width: 1, height: 16, background: "#2a2a2a", margin: "0 4px" }} />

              {/* Zoom Controls */}
              <button
                onClick={() => setZoom(z => Math.max(0.5, z / 1.25))}
                style={toolbarBtnStyle(false)}
                title="Zoom Out (Scroll Down)"
              >
                -
              </button>
              <span style={{ fontSize: 11, minWidth: 42, textAlign: "center", userSelect: "none" }}>
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom(z => Math.min(8, z * 1.25))}
                style={toolbarBtnStyle(false)}
                title="Zoom In (Scroll Up)"
              >
                +
              </button>

              <div style={{ width: 1, height: 16, background: "#2a2a2a", margin: "0 4px" }} />

              {/* Reset View */}
              <button
                onClick={() => {
                  setZoom(1);
                  setPanOffset({ x: 0, y: 0 });
                }}
                style={toolbarBtnStyle(false)}
                title="Reset Zoom & Pan (Double Click Background)"
              >
                ↺
              </button>
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
                onClick={() => setCurrentPoints([])}
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