import { useState, useRef, useCallback, useEffect } from "react";
import {
  newSegmentIntersectsPolygon,
  wouldMakeUncloseable,
  validatePolygon,
  simplifyPolygon,
  enforceWindingCCW,
  isNearDuplicate,
} from "./utils/geometry";
import { eventToNorm, resolveSnap } from "./utils/coordinates";
import { quantize, downloadJSON } from "./utils/export";
import { useHistory } from "./utils/history";

import Header from "./components/Header";
import Toolbar from "./components/Toolbar";
import SVGOverlay from "./components/SVGOverlay";
import Sidebar from "./components/Sidebar";
import { ErrorBanner, WarningBanner } from "./components/StatusBanners";

export default function App() {
  // -- Image state --
  const [image, setImage] = useState(null);
  const [bounds, setBounds] = useState(null);

  // -- Regions with undo/redo --
  const { state: regions, set: setRegions, undo, redo, canUndo, canRedo } = useHistory([]);

  // -- Drawing state --
  const [currentPoints, setCurrentPoints] = useState([]);
  const currentStroke = useRef([]);
  const [regionName, setRegionName] = useState("");

  // -- UI state --
  const [hoveredId, setHoveredId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [geoError, setGeoError] = useState(null);
  const [warningMsg, setWarningMsg] = useState(null);

  // -- Viewport --
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [mode, setMode] = useState("draw");
  const [isDragging, setIsDragging] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  // -- Polygon drag state --
  const [draggingId, setDraggingId] = useState(null);
  const dragPolyStart = useRef(null); // { normX, normY, originalPoints }

  // -- Snap --
  const activeSnapRef = useRef(null);
  const [activeSnapDisplay, setActiveSnapDisplay] = useState(null);

  // -- Refs --
  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const dragOffsetStartRef = useRef({ x: 0, y: 0 });

  // -- Stroke helpers --
  const flushStroke = useCallback(() => {
    setCurrentPoints(currentStroke.current.map(e => e.pt));
  }, []);

  const resetStroke = useCallback(() => {
    currentStroke.current = [];
    setCurrentPoints([]);
  }, []);

  // -- Image upload --
  const handleImageUpload = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImage(URL.createObjectURL(file));
    setBounds(null);
  }, []);

  // -- Resize observer --
  useEffect(() => {
    if (!imgRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setBounds({ width, height });
      }
    });
    observer.observe(imgRef.current);
    return () => observer.disconnect();
  }, [image]);

  // -- Keyboard --
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === "Space" && document.activeElement.tagName !== "INPUT") {
        e.preventDefault();
        setIsSpacePressed(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ" && document.activeElement.tagName !== "INPUT") {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else if (currentStroke.current.length > 0) {
          // Undo drawing point
          currentStroke.current = currentStroke.current.slice(0, -1);
          flushStroke();
          setGeoError(null);
          setWarningMsg(null);
        } else {
          undo();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyY" && document.activeElement.tagName !== "INPUT") {
        e.preventDefault();
        redo();
      }
      if (e.code === "Escape") {
        resetStroke();
        setSelectedId(null);
        setGeoError(null);
        setWarningMsg(null);
      }
    };
    const handleKeyUp = (e) => { if (e.code === "Space") setIsSpacePressed(false); };
    const handleBlur = () => setIsSpacePressed(false);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [flushStroke, resetStroke, undo, redo]);

  // -- Pan dragging --
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
    const onMove = (e) => {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPanOffset({ x: dragOffsetStartRef.current.x + dx, y: dragOffsetStartRef.current.y + dy });
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDragging]);

  // -- Polygon drag --
  const handlePolygonMouseDown = useCallback((e, regionId) => {
    if (mode === "draw") return;
    e.preventDefault();
    setSelectedId(regionId);
    setDraggingId(regionId);
    const rect = imgRef.current.getBoundingClientRect();
    const normX = (e.clientX - rect.left) / rect.width;
    const normY = (e.clientY - rect.top) / rect.height;
    const region = regions.find(r => r.id === regionId);
    if (!region) return;
    dragPolyStart.current = { normX, normY, originalPoints: region.points.map(p => [...p]) };
  }, [mode, regions]);

  useEffect(() => {
    if (!draggingId) return;
    const onMove = (e) => {
      if (!imgRef.current || !dragPolyStart.current) return;
      const rect = imgRef.current.getBoundingClientRect();
      const normX = (e.clientX - rect.left) / rect.width;
      const normY = (e.clientY - rect.top) / rect.height;
      const dx = normX - dragPolyStart.current.normX;
      const dy = normY - dragPolyStart.current.normY;
      const newPoints = dragPolyStart.current.originalPoints.map(([px, py]) => [px + dx, py + dy]);
      // Update regions in place for real-time feedback (no history push yet)
      setRegions(regions.map(r => r.id === draggingId ? { ...r, points: newPoints } : r));
    };
    const onUp = (e) => {
      if (imgRef.current && dragPolyStart.current) {
        const rect = imgRef.current.getBoundingClientRect();
        const normX = (e.clientX - rect.left) / rect.width;
        const normY = (e.clientY - rect.top) / rect.height;
        const dx = normX - dragPolyStart.current.normX;
        const dy = normY - dragPolyStart.current.normY;
        // Only push to history if actually moved
        if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
          const newPoints = dragPolyStart.current.originalPoints.map(([px, py]) => [px + dx, py + dy]);
          setRegions(regions.map(r => r.id === draggingId ? { ...r, points: newPoints } : r));
        }
      }
      setDraggingId(null);
      dragPolyStart.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [draggingId, regions, setRegions]);

  // -- Snap helper --
  const computeSnap = useCallback((clientX, clientY) => {
    if (!imgRef.current) return null;
    const rect = imgRef.current.getBoundingClientRect();
    const pts = currentStroke.current.map(e => e.pt);
    return resolveSnap(clientX, clientY, rect, pts, regions);
  }, [regions]);

  // -- Geometry guards --
  const wouldCreateIntersection = useCallback((candidate) => {
    const pts = currentStroke.current.map(e => e.pt);
    if (pts.length < 2) return false;
    return newSegmentIntersectsPolygon(pts, pts[pts.length - 1], candidate, false).intersects;
  }, []);

  const wouldClosingIntersect = useCallback(() => {
    const pts = currentStroke.current.map(e => e.pt);
    if (pts.length < 3) return false;
    return newSegmentIntersectsPolygon(pts, pts[pts.length - 1], pts[0], true).intersects;
  }, []);

  // -- Finish region --
  const handleFinishRegion = useCallback(() => {
    const pts = currentStroke.current.map(e => e.pt);
    if (pts.length < 3) return;

    if (wouldClosingIntersect()) {
      setGeoError("Cannot close -- closing segment intersects existing edges. Undo the last point(s).");
      return;
    }

    const simplified = simplifyPolygon(pts);
    const validation = validatePolygon(simplified);
    if (!validation.valid) {
      setGeoError(`Invalid polygon: ${validation.reason} Undo and correct.`);
      return;
    }

    const wound = enforceWindingCCW(simplified);
    const name = regionName.trim() || `region_${regions.length + 1}`;
    const region = { id: crypto.randomUUID(), name, points: wound };
    setRegions([...regions, region]);
    resetStroke();
    setRegionName("");
    activeSnapRef.current = null;
    setActiveSnapDisplay(null);
    setGeoError(null);
    setWarningMsg(null);
  }, [regionName, regions, wouldClosingIntersect, resetStroke, setRegions]);

  // -- Canvas mouse events --
  const handleCanvasMouseMove = useCallback((e) => {
    if (isDragging || draggingId) return;
    if (mode === "draw" && !isSpacePressed && image) {
      const snap = computeSnap(e.clientX, e.clientY);
      activeSnapRef.current = snap;
      setActiveSnapDisplay(snap);

      if (snap && !snap.isFirstPoint) {
        const pts = currentStroke.current.map(e => e.pt);
        if (pts.length >= 2 && wouldMakeUncloseable(pts, snap.coords)) {
          setWarningMsg("Placing here will make the polygon impossible to close.");
        } else {
          setWarningMsg(null);
        }
      } else {
        setWarningMsg(null);
      }
    } else {
      activeSnapRef.current = null;
      setActiveSnapDisplay(null);
      setWarningMsg(null);
    }
  }, [mode, isSpacePressed, isDragging, draggingId, image, computeSnap]);

  const handleCanvasClick = useCallback((e) => {
    if (e.button !== 0) return;
    if (mode === "pan" || isSpacePressed) return;
    if (!image || !imgRef.current) return;

    const dx = Math.abs(e.clientX - dragStartRef.current.x);
    const dy = Math.abs(e.clientY - dragStartRef.current.y);
    if (dx > 3 || dy > 3) return;

    // In non-draw mode, clicking the background deselects
    if (mode !== "draw") {
      setSelectedId(null);
      return;
    }

    const snap = activeSnapRef.current ?? computeSnap(e.clientX, e.clientY);

    if (snap?.isFirstPoint) {
      handleFinishRegion();
      activeSnapRef.current = null;
      setActiveSnapDisplay(null);
      return;
    }

    let candidate;
    let meta = null;

    if (snap) {
      candidate = snap.coords;
      if (snap.regionId) {
        meta = snap.isEdgeSnap
          ? { regionId: snap.regionId, isEdgeSnap: true }
          : { regionId: snap.regionId, pointIndex: snap.pointIndex, isEdgeSnap: false };
      }
    } else {
      candidate = eventToNorm(e, imgRef.current);
      if (!candidate) return;
    }

    const pts = currentStroke.current.map(e => e.pt);

    if (isNearDuplicate(pts, candidate)) {
      setGeoError("Duplicate point: too close to the previous vertex.");
      return;
    }

    if (wouldCreateIntersection(candidate)) {
      setGeoError("Cannot place point -- new segment would create a self-intersection.");
      return;
    }

    setGeoError(null);

    const firstEntry = currentStroke.current[0];
    const firstMeta = firstEntry?.meta ?? null;
    const isSharedEdgeClose =
      meta &&
      firstMeta &&
      !meta.isEdgeSnap &&
      !firstMeta.isEdgeSnap &&
      meta.regionId === firstMeta.regionId &&
      meta.pointIndex !== firstMeta.pointIndex &&
      currentStroke.current.length >= 2;

    if (isSharedEdgeClose) {
      const tentative = [...currentStroke.current, { pt: candidate, meta }];
      if (tentative.length >= 3) {
        const tentativePts = tentative.map(e => e.pt);
        const simplified = simplifyPolygon(tentativePts);
        const validation = validatePolygon(simplified);
        if (!validation.valid) {
          setGeoError(`Invalid polygon on auto-close: ${validation.reason}`);
          return;
        }
        const wound = enforceWindingCCW(simplified);
        const name = regionName.trim() || `region_${regions.length + 1}`;
        const region = { id: crypto.randomUUID(), name, points: wound };
        setRegions([...regions, region]);
        resetStroke();
        setRegionName("");
        activeSnapRef.current = null;
        setActiveSnapDisplay(null);
        setGeoError(null);
        setWarningMsg(null);
      } else {
        currentStroke.current = tentative;
        flushStroke();
      }
      return;
    }

    currentStroke.current = [...currentStroke.current, { pt: candidate, meta }];
    flushStroke();
  }, [
    image, mode, isSpacePressed, regionName, regions,
    computeSnap, handleFinishRegion, wouldCreateIntersection, resetStroke, flushStroke, setRegions,
  ]);

  const handleDoubleClick = useCallback((e) => {
    if (e.target === containerRef.current || e.target === imgRef.current) {
      setZoom(1);
      setPanOffset({ x: 0, y: 0 });
    }
  }, []);

  const handleContextMenu = useCallback((e) => {
    if (mode === "pan" || isSpacePressed || isDragging || e.button === 2) e.preventDefault();
  }, [mode, isSpacePressed, isDragging]);

  const handleUndoPoint = useCallback(() => {
    if (currentStroke.current.length === 0) return;
    currentStroke.current = currentStroke.current.slice(0, -1);
    flushStroke();
    setGeoError(null);
    setWarningMsg(null);
  }, [flushStroke]);

  const handleDeleteRegion = useCallback((id) => {
    setRegions(regions.filter(r => r.id !== id));
    if (selectedId === id) setSelectedId(null);
  }, [regions, selectedId, setRegions]);

  // -- Export --
  const handleExport = useCallback(() => {
    const output = {};
    const errors = [];

    for (const region of regions) {
      const key = region.name;
      const validation = validatePolygon(region.points);
      if (!validation.valid) {
        errors.push(`${key}: ${validation.reason}`);
        continue;
      }
      const simplified = simplifyPolygon(region.points);
      const wound = enforceWindingCCW(simplified);
      const quantized = wound.map(([x, y]) => [quantize(x), quantize(y)]);
      output[key] = {
        winding: "ccw",
        pointCount: quantized.length,
        points: quantized,
      };
    }

    if (errors.length > 0) {
      alert(`Export blocked -- invalid polygon(s):\n\n${errors.join("\n")}\n\nDelete and redraw the affected regions.`);
      return;
    }
    downloadJSON(output);
  }, [regions]);

  // -- Derived --
  const closingWouldIntersect =
    currentPoints.length >= 3 &&
    newSegmentIntersectsPolygon(
      currentPoints,
      currentPoints[currentPoints.length - 1],
      currentPoints[0],
      true,
    ).intersects;

  // -- Smooth zoom + trackpad pan --
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      // Pinch-to-zoom (trackpad) or Ctrl+scroll (mouse)
      const factor = e.deltaY < 0 ? 1.06 : 1 / 1.06;
      setZoom(z => Math.min(30, Math.max(0.1, z * factor)));
    } else {
      // Two-finger swipe (trackpad) or plain scroll → pan
      setPanOffset(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
    }
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // -- Render --
  return (
    <div style={{
      width: "100%", height: "100%",
      background: "#0f0f0f", color: "#e8e6e0",
      fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      <Header totalRegions={regions.length} onExport={handleExport} />

      {/* Main */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Canvas */}
        <div
          ref={containerRef}
          style={{
            flex: 1, position: "relative", overflow: "hidden", background: "#0a0a0a",
            cursor: !image ? "default"
              : draggingId ? "grabbing"
              : (mode === "pan" || isSpacePressed) ? (isDragging ? "grabbing" : "grab")
              : "crosshair",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onClick={handleCanvasClick}
          onDoubleClick={handleDoubleClick}
          onContextMenu={handleContextMenu}
          onMouseLeave={() => {
            activeSnapRef.current = null;
            setActiveSnapDisplay(null);
            setWarningMsg(null);
          }}
        >
          {!image ? (
            <label style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, cursor: "pointer", color: "#444" }}>
              <div style={{ width: 80, height: 80, border: "1px dashed #333", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, color: "#333" }}>+</div>
              <span style={{ fontSize: 12, letterSpacing: "0.08em" }}>Load image</span>
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleImageUpload} />
            </label>
          ) : (
            <div style={{
              position: "relative",
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
              transformOrigin: "center center",
              userSelect: "none",
              transition: isDragging || draggingId ? "none" : "transform 0.15s ease-out",
            }}>
              <img
                ref={imgRef}
                src={image}
                alt="annotation target"
                draggable={false}
                style={{ display: "block", maxHeight: "calc(100vh - 120px)", maxWidth: "100%", pointerEvents: "none" }}
              />
              <SVGOverlay
                regions={regions}
                currentPoints={currentPoints}
                zoom={zoom}
                bounds={bounds}
                hoveredId={hoveredId}
                setHoveredId={setHoveredId}
                mode={mode}
                activeSnapDisplay={activeSnapDisplay}
                closingWouldIntersect={closingWouldIntersect}
                warningMsg={warningMsg}
                selectedId={selectedId}
                draggingId={draggingId}
                onPolygonMouseDown={handlePolygonMouseDown}
              />
            </div>
          )}

          <ErrorBanner message={geoError} onDismiss={() => setGeoError(null)} />
          {!geoError && <WarningBanner message={warningMsg} />}

          {image && (
            <Toolbar
              mode={mode}
              isSpacePressed={isSpacePressed}
              zoom={zoom}
              onToggleMode={() => setMode(m => m === "draw" ? "pan" : "draw")}
              onZoomIn={() => setZoom(z => Math.min(30, z * 1.15))}
              onZoomOut={() => setZoom(z => Math.max(0.1, z / 1.15))}
              onResetView={() => { setZoom(1); setPanOffset({ x: 0, y: 0 }); }}
              onUndo={currentPoints.length > 0 ? handleUndoPoint : undo}
              onRedo={redo}
              canUndo={currentPoints.length > 0 || canUndo}
              canRedo={canRedo}
            />
          )}

          {image && (
            <label style={{
              position: "absolute", bottom: 12, left: 12,
              fontSize: 10, color: "#888", cursor: "pointer",
              background: "#111", padding: "4px 8px",
              border: "1px solid #222", borderRadius: 4, letterSpacing: "0.06em", zIndex: 10,
            }}>
              swap image
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleImageUpload} />
            </label>
          )}
        </div>

        <Sidebar
          regionName={regionName}
          setRegionName={setRegionName}
          currentPoints={currentPoints}
          regions={regions}
          hoveredId={hoveredId}
          setHoveredId={setHoveredId}
          selectedId={selectedId}
          onFinishRegion={handleFinishRegion}
          onUndoPoint={handleUndoPoint}
          onDiscard={() => { resetStroke(); setGeoError(null); setWarningMsg(null); }}
          onDeleteRegion={handleDeleteRegion}
          onExport={handleExport}
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
        />
      </div>
    </div>
  );
}
