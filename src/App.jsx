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

// FIX 1: single canonical point function — called from event handlers only, never render
function getPoint(e, imgEl) {
  const rect = imgEl.getBoundingClientRect();
  const x = parseFloat(((e.clientX - rect.left) / rect.width).toFixed(4));
  const y = parseFloat(((e.clientY - rect.top) / rect.height).toFixed(4));
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return [x, y];
}

export default function App() {
  const [view, setView] = useState("front");
  const [images, setImages] = useState({ front: null, back: null, side: null });
  // FIX 3: store rendered bounds once on load/resize, no DOM reads during render
  const [bounds, setBounds] = useState({ front: null, back: null, side: null });
  const [regionsByView, setRegionsByView] = useState({ front: [], back: [], side: [] });
  const [currentPoints, setCurrentPoints] = useState([]);
  const [regionName, setRegionName] = useState("");
  // FIX 4: hover by stable ID, not index
  const [hoveredId, setHoveredId] = useState(null);
  // FIX 2: zoom only, pan removed entirely
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef(null);
  const imgRef = useRef(null);

  const handleImageUpload = useCallback((e, targetView) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImages(prev => ({ ...prev, [targetView]: url }));
    setBounds(prev => ({ ...prev, [targetView]: null }));
  }, []);

  // FIX 3: capture bounds on image load and on resize
  const captureBounds = useCallback(() => {
    if (!imgRef.current) return;
    const r = imgRef.current.getBoundingClientRect();
    setBounds(prev => ({ ...prev, [view]: { width: r.width, height: r.height } }));
  }, [view]);

  useEffect(() => {
    window.addEventListener("resize", captureBounds);
    return () => window.removeEventListener("resize", captureBounds);
  }, [captureBounds]);

  const handleCanvasClick = useCallback((e) => {
    if (!images[view] || !imgRef.current) return;
    const pt = getPoint(e, imgRef.current); // FIX 1: single function
    if (!pt) return;
    setCurrentPoints(prev => [...prev, pt]);
  }, [images, view]);

  const handleFinishRegion = useCallback(() => {
    if (currentPoints.length < 3) return;
    const name = regionName.trim() || `${view}_region_${regionsByView[view].length + 1}`;
    // FIX 4: stable UUID id, name separate
    // FIX 5: namespace export key with view to prevent silent collision
    const region = {
      id: crypto.randomUUID(),
      name,
      view,
      points: currentPoints,
    };
    setRegionsByView(prev => ({ ...prev, [view]: [...prev[view], region] }));
    setCurrentPoints([]);
    setRegionName("");
  }, [currentPoints, regionName, view, regionsByView]);

  const handleUndoPoint = useCallback(() => {
    setCurrentPoints(prev => prev.slice(0, -1));
  }, []);

  const handleDeleteRegion = useCallback((id) => {
    setRegionsByView(prev => ({
      ...prev,
      [view]: prev[view].filter(r => r.id !== id), // FIX 4: by ID
    }));
  }, [view]);

  const handleExport = useCallback(() => {
    const output = {};
    for (const v of VIEWS) {
      for (const region of regionsByView[v]) {
        // FIX 5: namespace key → no silent overwrite
        const key = `${v}_${region.name}`;
        output[key] = { view: region.view, points: region.points };
      }
    }
    downloadJSON(output);
  }, [regionsByView]);

  const totalRegions = VIEWS.reduce((acc, v) => acc + regionsByView[v].length, 0);

  // Wheel zoom — no pan
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    setZoom(z => Math.min(4, Math.max(0.5, z - e.deltaY * 0.001)));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // FIX 3: use stored bounds for SVG coordinate math, never read DOM during render
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
      minHeight: "100vh",
      background: "#0f0f0f",
      color: "#e8e6e0",
      fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        borderBottom: "1px solid #2a2a2a",
        padding: "12px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "#111",
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
      <div style={{ display: "flex", borderBottom: "1px solid #2a2a2a", background: "#111" }}>
        {VIEWS.map(v => (
          <button key={v} onClick={() => { setView(v); setCurrentPoints([]); }} style={{
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

      {/* Main */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Canvas */}
        <div ref={containerRef} style={{
          flex: 1,
          position: "relative",
          overflow: "hidden",
          background: "#0a0a0a",
          cursor: images[view] ? "crosshair" : "default",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
          onClick={handleCanvasClick}
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
            // FIX 2: scale only, no translate pan
            <div style={{
              position: "relative",
              transform: `scale(${zoom})`,
              transformOrigin: "center center",
              userSelect: "none",
            }}>
              <img
                ref={imgRef}
                src={images[view]}
                onLoad={captureBounds}  // FIX 3: capture on load
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
                {/* Completed regions — FIX 3+4: bounds-based coords, hovered by ID */}
                {regionsByView[view].map((region, ri) => {
                  const color = getColor(ri);
                  const pts = toSVGStr(region.points);
                  const first = toXY(region.points[0]);
                  return (
                    <g key={region.id}>
                      <polygon
                        points={pts}
                        fill={color}
                        fillOpacity={hoveredId === region.id ? 0.45 : 0.25}
                        stroke={color}
                        strokeWidth={hoveredId === region.id ? 2 : 1.5}
                        style={{ cursor: "pointer" }}
                        onMouseEnter={() => setHoveredId(region.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        onClick={e => e.stopPropagation()}
                      />
                      <text
                        x={first.x} y={first.y - 6}
                        fill={color}
                        fontSize="10"
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
                    strokeWidth={1.5}
                    strokeDasharray="4 2"
                  />
                )}

                {/* Current vertex dots — FIX 3: bounds-based */}
                {currentPoints.map((pt, i) => {
                  const { x, y } = toXY(pt);
                  return (
                    <circle
                      key={i}
                      cx={x} cy={y}
                      r={i === 0 ? 5 : 3.5}
                      fill={i === 0 ? "#facc15" : "#fde68a"}
                      stroke="#0f0f0f"
                      strokeWidth={1}
                    />
                  );
                })}
              </svg>
            </div>
          )}

          {/* Zoom indicator */}
          {images[view] && (
            <div style={{
              position: "absolute",
              bottom: 12, right: 12,
              fontSize: 10, color: "#444",
              letterSpacing: "0.06em",
              background: "#111",
              padding: "3px 7px",
              borderRadius: 3,
              border: "1px solid #222",
            }}>
              {Math.round(zoom * 100)}% · scroll to zoom
            </div>
          )}

          {images[view] && (
            <label style={{
              position: "absolute",
              bottom: 12, left: 12,
              fontSize: 10, color: "#444",
              cursor: "pointer",
              background: "#111",
              padding: "3px 7px",
              border: "1px solid #222",
              borderRadius: 3,
              letterSpacing: "0.06em",
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
                  // FIX 4: key and hover by stable ID
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
                        onClick={() => handleDeleteRegion(region.id)} // FIX 4: pass ID
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
  };
}