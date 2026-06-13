import { useState, useRef, useCallback, useEffect } from "react";
import {
  newSegmentIntersectsPolygon,
  wouldMakeUncloseable,
  validatePolygon,
  simplifyPolygon,
  enforceWindingCCW,
  isNearDuplicate,
} from "./utils/geometry";
import { resolveSnap } from "./utils/coordinates";
import { quantize, downloadJSON } from "./utils/export";
import { useHistory } from "./utils/history";

import { usePencilDraw } from "./utils/usePencilDraw";
import { useTouchGestures } from "./utils/useTouchGestures";

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
  const [panelOpen, setPanelOpen] = useState(false);

  // -- Viewport --
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [mode, setMode] = useState("draw");

  // -- Polygon drag state --
  const [draggingId, setDraggingId] = useState(null);
  const dragPolyStart = useRef(null);

  // -- Snap --
  const activeSnapRef = useRef(null);
  const [activeSnapDisplay, setActiveSnapDisplay] = useState(null);

  // -- Refs --
  const containerRef = useRef(null);
  const imgRef = useRef(null);

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

  // -- Snap helper --
  const computeSnap = useCallback((clientX, clientY, pointerType = "pen") => {
    if (!imgRef.current) return null;
    const rect = imgRef.current.getBoundingClientRect();
    const pts = currentStroke.current.map(e => e.pt);
    return resolveSnap(clientX, clientY, rect, pts, regions, pointerType);
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
      setGeoError("Cannot close — closing segment intersects existing edges.");
      return;
    }

    const simplified = simplifyPolygon(pts);
    const validation = validatePolygon(simplified);
    if (!validation.valid) {
      setGeoError(`Invalid polygon: ${validation.reason}`);
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

  // =====================================================
  // Apple Pencil — point placement via pencil taps
  // =====================================================

  const handlePencilPlace = useCallback((normCoords, e) => {
    if (!image || !imgRef.current) return;
    if (mode !== "draw") {
      setSelectedId(null);
      return;
    }

    // Resolve snap from the pointer position
    const snap = activeSnapRef.current ?? computeSnap(e.clientX, e.clientY, "pen");

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
      candidate = normCoords;
    }

    const pts = currentStroke.current.map(e => e.pt);

    if (isNearDuplicate(pts, candidate)) {
      setGeoError("Duplicate point: too close to the previous vertex.");
      return;
    }

    if (wouldCreateIntersection(candidate)) {
      setGeoError("Cannot place — new segment would self-intersect.");
      return;
    }

    setGeoError(null);

    // Shared-edge auto-close check
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
    image, mode, regionName, regions,
    computeSnap, handleFinishRegion, wouldCreateIntersection, resetStroke, flushStroke, setRegions,
  ]);

  const handlePencilMove = useCallback((normCoords, e) => {
    if (draggingId) return;
    if (mode === "draw" && image) {
      const snap = computeSnap(e.clientX, e.clientY, "pen");
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
  }, [mode, draggingId, image, computeSnap]);

  const handlePencilLeave = useCallback(() => {
    activeSnapRef.current = null;
    setActiveSnapDisplay(null);
    setWarningMsg(null);
  }, []);

  // -- Pencil hook --
  const { handlers: pencilHandlers } = usePencilDraw({
    imgRef,
    onPlacePoint: handlePencilPlace,
    onPencilMove: handlePencilMove,
    onPencilLeave: handlePencilLeave,
    enabled: mode === "draw" && !!image,
  });

  // =====================================================
  // Touch gestures — finger pan, pinch-zoom, double-tap
  // =====================================================

  const handleDoubleTap = useCallback(() => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  }, []);

  const { handlers: touchHandlers } = useTouchGestures({
    containerRef,
    zoom,
    setZoom,
    panOffset,
    setPanOffset,
    onDoubleTap: handleDoubleTap,
  });

  // =====================================================
  // Polygon drag — finger only, in pan/select mode
  // =====================================================

  const handlePolygonPointerDown = useCallback((e, regionId) => {
    if (mode === "draw") return;
    // Only allow finger to drag polygons
    if (e.pointerType !== "touch") return;
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
      if (e.pointerType !== "touch") return;
      if (!imgRef.current || !dragPolyStart.current) return;
      const rect = imgRef.current.getBoundingClientRect();
      const normX = (e.clientX - rect.left) / rect.width;
      const normY = (e.clientY - rect.top) / rect.height;
      const dx = normX - dragPolyStart.current.normX;
      const dy = normY - dragPolyStart.current.normY;
      const newPoints = dragPolyStart.current.originalPoints.map(([px, py]) => [px + dx, py + dy]);
      setRegions(regions.map(r => r.id === draggingId ? { ...r, points: newPoints } : r));
    };
    const onUp = (e) => {
      if (e.pointerType !== "touch") return;
      if (imgRef.current && dragPolyStart.current) {
        const rect = imgRef.current.getBoundingClientRect();
        const normX = (e.clientX - rect.left) / rect.width;
        const normY = (e.clientY - rect.top) / rect.height;
        const dx = normX - dragPolyStart.current.normX;
        const dy = normY - dragPolyStart.current.normY;
        if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
          const newPoints = dragPolyStart.current.originalPoints.map(([px, py]) => [px + dx, py + dy]);
          setRegions(regions.map(r => r.id === draggingId ? { ...r, points: newPoints } : r));
        }
      }
      setDraggingId(null);
      dragPolyStart.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [draggingId, regions, setRegions]);

  // =====================================================
  // UI actions
  // =====================================================

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

  const handleMirrorRegion = useCallback((id) => {
    const source = regions.find(r => r.id === id);
    if (!source) return;

    let mirroredName;
    if (/_l$/i.test(source.name)) {
      mirroredName = source.name.replace(/_l$/i, '_r');
    } else if (/_r$/i.test(source.name)) {
      mirroredName = source.name.replace(/_r$/i, '_l');
    } else {
      mirroredName = source.name + '_mirrored';
    }

    const flippedPoints = source.points.map(([x, y]) => [1 - x, y]);
    const validPoints = enforceWindingCCW(flippedPoints);

    const newRegion = {
      id: crypto.randomUUID(),
      name: mirroredName,
      points: validPoints,
    };

    setRegions([...regions, newRegion]);
  }, [regions, setRegions]);

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
      alert(`Export blocked — invalid polygon(s):\n\n${errors.join("\n")}\n\nDelete and redraw the affected regions.`);
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

  // -- Merge pointer handlers: pencil + touch --
  const mergedPointerDown = useCallback((e) => {
    pencilHandlers.onPointerDown(e);
    touchHandlers.onPointerDown(e);
  }, [pencilHandlers, touchHandlers]);

  const mergedPointerMove = useCallback((e) => {
    pencilHandlers.onPointerMove(e);
    touchHandlers.onPointerMove(e);
  }, [pencilHandlers, touchHandlers]);

  const mergedPointerUp = useCallback((e) => {
    pencilHandlers.onPointerUp(e);
    touchHandlers.onPointerUp(e);
  }, [pencilHandlers, touchHandlers]);

  const mergedPointerCancel = useCallback((e) => {
    pencilHandlers.onPointerCancel(e);
    touchHandlers.onPointerCancel(e);
  }, [pencilHandlers, touchHandlers]);

  // -- Render --
  return (
    <div style={{
      width: "100%", height: "100%",
      background: "#0f0f0f", color: "var(--label-primary)",
      fontFamily: "-apple-system, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
      display: "flex", flexDirection: "column", overflow: "hidden",
      touchAction: "none",
    }}>
      <Header
        totalRegions={regions.length}
        onTogglePanel={() => setPanelOpen(p => !p)}
      />

      {/* Canvas */}
      <div
        ref={containerRef}
        style={{
          flex: 1, position: "relative", overflow: "hidden", background: "#0a0a0a",
          display: "flex", alignItems: "center", justifyContent: "center",
          touchAction: "none",
        }}
        onPointerDown={mergedPointerDown}
        onPointerMove={mergedPointerMove}
        onPointerUp={mergedPointerUp}
        onPointerCancel={mergedPointerCancel}
        onPointerLeave={pencilHandlers.onPointerLeave}
        onContextMenu={(e) => e.preventDefault()}
      >
        {!image ? (
          <label style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            gap: 16, padding: 40,
            touchAction: "manipulation",
          }}>
            <div style={{
              width: 100, height: 100,
              border: "2px dashed var(--separator)",
              borderRadius: 16,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 36, color: "var(--label-quaternary)",
            }}>
              +
            </div>
            <span style={{
              fontSize: 16, color: "var(--label-tertiary)",
              fontWeight: 500,
            }}>
              Tap to load image
            </span>
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleImageUpload} />
          </label>
        ) : (
          <div style={{
            position: "relative",
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
            transformOrigin: "center center",
            userSelect: "none",
            transition: draggingId ? "none" : "transform 0.12s ease-out",
          }}>
            <img
              ref={imgRef}
              src={image}
              alt="annotation target"
              draggable={false}
              style={{
                display: "block",
                maxHeight: "calc(100vh - 120px)",
                maxWidth: "100%",
                pointerEvents: "none",
                touchAction: "none",
              }}
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
              onPolygonPointerDown={handlePolygonPointerDown}
            />
          </div>
        )}

        <ErrorBanner message={geoError} onDismiss={() => setGeoError(null)} />
        {!geoError && <WarningBanner message={warningMsg} />}

        {image && (
          <Toolbar
            mode={mode}
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
            position: "absolute", bottom: `calc(12px + var(--safe-bottom))`, left: 12,
            fontSize: 13, color: "var(--label-tertiary)",
            background: "var(--material-thick)",
            backdropFilter: "blur(20px) saturate(180%)",
            WebkitBackdropFilter: "blur(20px) saturate(180%)",
            padding: "8px 14px",
            border: "1px solid var(--separator)",
            borderRadius: 10, zIndex: 10,
            fontWeight: 500,
            minHeight: 36,
            display: "flex", alignItems: "center",
            WebkitTapHighlightColor: "transparent",
            touchAction: "manipulation",
          }}>
            Swap image
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleImageUpload} />
          </label>
        )}

        {/* Drawing mode indicator */}
        {image && mode === "draw" && (
          <div style={{
            position: "absolute",
            top: 12, right: 12,
            background: "rgba(48, 209, 88, 0.15)",
            border: "1px solid rgba(48, 209, 88, 0.3)",
            borderRadius: 20,
            padding: "6px 14px",
            fontSize: 13, fontWeight: 600,
            color: "#30d158",
            zIndex: 10,
            display: "flex", alignItems: "center", gap: 6,
            pointerEvents: "none",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19l7-7 3 3-7 7-3-3z" />
              <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
            </svg>
            Pencil Draw
          </div>
        )}
      </div>

      {/* Slide-over sidebar panel */}
      <Sidebar
        isOpen={panelOpen}
        onClose={() => setPanelOpen(false)}
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
        onMirrorRegion={handleMirrorRegion}
        onExport={handleExport}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
      />
    </div>
  );
}
