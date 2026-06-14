import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  newSegmentIntersectsPolygon,
  validatePolygon,
  simplifyPolygon,
  enforceWindingCCW,
  isNearDuplicate,
} from "./utils/geometry";
import { resolveSnap } from "./utils/coordinates";
import { downloadJSON, buildRawExport, buildGymPlanExport } from "./utils/export";
import { useHistory } from "./utils/history";
import { rdpSimplify } from "./utils/rdp";

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

  // -- RDP state --
  const [rdpEpsilon, setRdpEpsilon] = useState(0);
  const [rdpPreview, setRdpPreview] = useState(false);

  // -- Export state --
  const [exportView, setExportView] = useState("front");
  const [nameSuffix, setNameSuffix] = useState("none"); // "none" | "_l" | "_r"

  // -- Viewport --
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
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
  const fileInputRef = useRef(null);
  const jsonInputRef = useRef(null);

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
        // Center the image when it first loads / resizes
        const container = containerRef.current;
        const img = imgRef.current;
        if (container && img) {
          const cRect = container.getBoundingClientRect();
          const z = zoomRef.current ?? 1;
          setPanOffset({
            x: (cRect.width - img.offsetWidth * z) / 2,
            y: (cRect.height - img.offsetHeight * z) / 2,
          });
        }
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
    const baseName = regionName.trim() || `region_${regions.length + 1}`;
    const suffix = nameSuffix !== "none" ? nameSuffix : "";
    const name = baseName + suffix;
    const region = { id: crypto.randomUUID(), name, points: wound };
    setRegions([...regions, region]);
    resetStroke();
    setRegionName("");
    activeSnapRef.current = null;
    setActiveSnapDisplay(null);
    setGeoError(null);
    setWarningMsg(null);
  }, [regionName, nameSuffix, regions, wouldClosingIntersect, resetStroke, setRegions]);

  // =====================================================
  // Apple Pencil — point placement via pencil taps
  // =====================================================

  const handlePencilPlace = useCallback((normCoords, e) => {
    if (!image || !imgRef.current) return;
    if (mode !== "draw") {
      setSelectedId(null);
      return;
    }

    // Check for snap targets
    const snap = activeSnapRef.current ?? computeSnap(e.clientX, e.clientY, "pen");

    if (snap?.isFirstPoint) {
      handleFinishRegion();
      activeSnapRef.current = null;
      setActiveSnapDisplay(null);
      return;
    }

    // Use snap coordinates if snapping to an existing region vertex, else raw
    const candidate = snap?.isRegionSnap ? snap.coords : normCoords;

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

    currentStroke.current = [...currentStroke.current, { pt: candidate, meta: null }];
    flushStroke();
  }, [
    image, mode,
    computeSnap, handleFinishRegion, wouldCreateIntersection, flushStroke,
  ]);

  const handlePencilMove = useCallback((normCoords, e) => {
    if (draggingId) return;
    if (mode === "draw" && image) {
      const snap = computeSnap(e.clientX, e.clientY, "pen");
      activeSnapRef.current = snap;
      setActiveSnapDisplay(snap);
      setWarningMsg(null);
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

  // Compute the pan offset that centers the image in the container at a given zoom
  const getCenterOffset = useCallback((z = 1) => {
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img) return { x: 0, y: 0 };
    const cRect = container.getBoundingClientRect();
    return {
      x: (cRect.width - img.offsetWidth * z) / 2,
      y: (cRect.height - img.offsetHeight * z) / 2,
    };
  }, []);


  const handleDoubleTap = useCallback(() => {
    const offset = getCenterOffset(1);
    setZoom(1);
    setPanOffset(offset);
  }, [getCenterOffset]);

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

  const handleRenameRegion = useCallback((id, newName) => {
    setRegions(regions.map(r => r.id === id ? { ...r, name: newName } : r));
  }, [regions, setRegions]);


  // -- RDP preview regions (computed, not stored) --
  const previewRegions = useMemo(() => {
    if (!rdpPreview || rdpEpsilon <= 0) return regions;
    return regions.map(r => ({
      ...r,
      _originalPoints: r.points,
      points: rdpSimplify(r.points, rdpEpsilon),
    }));
  }, [regions, rdpEpsilon, rdpPreview]);

  // -- Apply RDP permanently --
  const handleApplyRdp = useCallback(() => {
    if (rdpEpsilon <= 0) return;
    const updated = regions.map(r => ({
      ...r,
      points: rdpSimplify(r.points, rdpEpsilon),
    }));
    setRegions(updated);
    setRdpPreview(false);
  }, [regions, rdpEpsilon, setRegions]);

  // -- Export for Gym Plan (structured) --
  const handleExportGymPlan = useCallback(() => {
    const { output, errors } = buildGymPlanExport(regions, exportView, rdpEpsilon);
    if (errors.length > 0) {
      alert(`Export blocked — invalid polygon(s):\n\n${errors.join("\n")}\n\nDelete and redraw the affected regions.`);
      return;
    }
    downloadJSON(output, `muscles_${exportView}.json`);
  }, [regions, exportView, rdpEpsilon]);

  // -- Export raw (original format) --
  const handleExportRaw = useCallback(() => {
    const { output, errors } = buildRawExport(regions);
    if (errors.length > 0) {
      alert(`Export blocked — invalid polygon(s):\n\n${errors.join("\n")}\n\nDelete and redraw the affected regions.`);
      return;
    }
    downloadJSON(output, "regions_raw.json");
  }, [regions]);

  // -- Import --
  const handleImportJSON = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        const imported = [];
        for (const [name, value] of Object.entries(data)) {
          if (value && Array.isArray(value.points) && value.points.length >= 3) {
            imported.push({
              id: crypto.randomUUID(),
              name,
              points: value.points.map(([x, y]) => [x, y]),
            });
          }
        }
        if (imported.length === 0) {
          alert("No valid regions found in the JSON file.");
          return;
        }
        setRegions([...regions, ...imported]);
      } catch (err) {
        alert(`Failed to parse JSON: ${err.message}`);
      }
    };
    reader.readAsText(file);
    // Reset so the same file can be re-imported
    e.target.value = "";
  }, [regions, setRegions]);

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
          touchAction: "none",
        }}
        onPointerDown={mergedPointerDown}
        onPointerMove={mergedPointerMove}
        onPointerUp={mergedPointerUp}
        onPointerCancel={mergedPointerCancel}
        onPointerLeave={pencilHandlers.onPointerLeave}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Hidden file input — triggered explicitly to bypass touch event suppression */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={handleImageUpload}
        />
        {/* Hidden JSON file input for importing regions */}
        <input
          ref={jsonInputRef}
          type="file"
          accept=".json,application/json"
          style={{ display: "none" }}
          onChange={handleImportJSON}
        />

        {!image ? (
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              position: "absolute", top: "50%", left: "50%",
              transform: "translate(-50%, -50%)",
              display: "flex", flexDirection: "column", alignItems: "center",
              gap: 16, padding: 40,
              background: "none", border: "none", cursor: "pointer",
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
            }}
          >
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
          </button>
        ) : (
          <div style={{
            position: "relative",
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            userSelect: "none",
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
              regions={rdpPreview ? previewRegions : regions}
              originalRegions={rdpPreview ? regions : null}
              currentPoints={currentPoints}
              zoom={zoom}
              bounds={bounds}
              hoveredId={hoveredId}
              setHoveredId={setHoveredId}
              mode={mode}
              activeSnapDisplay={activeSnapDisplay}
              closingWouldIntersect={closingWouldIntersect}
              selectedId={selectedId}
              draggingId={draggingId}
              onPolygonPointerDown={handlePolygonPointerDown}
              rdpPreview={rdpPreview}
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
            onZoomIn={() => {
              const container = containerRef.current;
              if (!container) { setZoom(z => Math.min(30, z * 1.15)); return; }
              const rect = container.getBoundingClientRect();
              const cx = rect.width / 2;
              const cy = rect.height / 2;
              setZoom(prevZoom => {
                const newZoom = Math.min(30, prevZoom * 1.15);
                const scale = newZoom / prevZoom;
                setPanOffset(prev => ({
                  x: cx - scale * (cx - prev.x),
                  y: cy - scale * (cy - prev.y),
                }));
                return newZoom;
              });
            }}
            onZoomOut={() => {
              const container = containerRef.current;
              if (!container) { setZoom(z => Math.max(0.1, z / 1.15)); return; }
              const rect = container.getBoundingClientRect();
              const cx = rect.width / 2;
              const cy = rect.height / 2;
              setZoom(prevZoom => {
                const newZoom = Math.max(0.1, prevZoom / 1.15);
                const scale = newZoom / prevZoom;
                setPanOffset(prev => ({
                  x: cx - scale * (cx - prev.x),
                  y: cy - scale * (cy - prev.y),
                }));
                return newZoom;
              });
            }}
            onResetView={() => { setZoom(1); setPanOffset(getCenterOffset(1)); }}
            onUndo={currentPoints.length > 0 ? handleUndoPoint : undo}
            onRedo={redo}
            canUndo={currentPoints.length > 0 || canUndo}
            canRedo={canRedo}
          />
        )}

        {image && (
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
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
              fontFamily: "inherit",
            }}
          >
            Swap image
          </button>
        )}

        {/* Drawing mode indicator */}
        {image && mode === "draw" && (
          <div style={{
            position: "absolute",
            top: 12, right: 12,
            background: "rgba(200, 200, 200, 0.1)",
            border: "1px solid rgba(200, 200, 200, 0.2)",
            borderRadius: 20,
            padding: "6px 14px",
            fontSize: 13, fontWeight: 600,
            color: "#c0c0c0",
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
        onRenameRegion={handleRenameRegion}
        onExportGymPlan={handleExportGymPlan}
        onExportRaw={handleExportRaw}
        onImport={() => jsonInputRef.current?.click()}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        rdpEpsilon={rdpEpsilon}
        setRdpEpsilon={setRdpEpsilon}
        rdpPreview={rdpPreview}
        setRdpPreview={setRdpPreview}
        onApplyRdp={handleApplyRdp}
        exportView={exportView}
        setExportView={setExportView}
        nameSuffix={nameSuffix}
        setNameSuffix={setNameSuffix}
      />
    </div>
  );
}
