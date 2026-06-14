import { useMemo } from "react";
import { getColor } from "../constants";

/**
 * Compute the visual centroid of a polygon (average of vertices).
 * For labels this gives a better "center" than the geometric centroid
 * for the kind of irregular muscle shapes we have.
 */
function polygonCentroid(points, b) {
  if (!points || points.length === 0) return { x: 0, y: 0 };
  let sx = 0, sy = 0;
  for (const [px, py] of points) {
    sx += px * b.width;
    sy += py * b.height;
  }
  return { x: sx / points.length, y: sy / points.length };
}

/**
 * Simple label de-overlap: iterate labels and push apart any that are
 * too close vertically. Works in pixel-space already divided by zoom.
 */
function resolveOverlaps(labels, minGap) {
  // Sort by y so we can push downward
  const sorted = labels.map((l, i) => ({ ...l, origIndex: i }));
  sorted.sort((a, b) => a.y - b.y);

  for (let pass = 0; pass < 5; pass++) {
    let moved = false;
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      // Only nudge if they're horizontally close too
      const dx = Math.abs(curr.x - prev.x);
      if (dx > minGap * 8) continue;
      const dy = curr.y - prev.y;
      if (dy < minGap) {
        const push = (minGap - dy) / 2 + 0.5;
        sorted[i - 1].y -= push;
        sorted[i].y += push;
        moved = true;
      }
    }
    if (!moved) break;
  }

  // Map back to original order
  const result = new Array(labels.length);
  for (const s of sorted) {
    result[s.origIndex] = { x: s.x, y: s.y };
  }
  return result;
}

// The font family stack: Inter first (clear l vs 1), then system sans-serif
const LABEL_FONT = "'Inter', 'SF Pro Display', -apple-system, system-ui, sans-serif";

export default function SVGOverlay({
  regions, originalRegions, currentPoints, zoom, bounds,
  hoveredId, setHoveredId, mode,
  activeSnapDisplay, closingWouldIntersect,
  selectedId, draggingId,
  onPolygonPointerDown,
  rdpPreview,
}) {
  // Pre-compute centroid positions for all labels, then de-overlap
  // (must be above the early return to satisfy React's rules of hooks)
  const labelPositions = useMemo(() => {
    if (!bounds || regions.length === 0) return [];
    const fontSize = 10 / zoom;
    const raw = regions.map((region) => polygonCentroid(region.points, bounds));
    return resolveOverlaps(raw, fontSize * 1.6);
  }, [regions, bounds, zoom]);

  if (!bounds) return null;
  const b = bounds;

  const toSVGStr = (pts) => pts.map(p => `${p[0] * b.width},${p[1] * b.height}`).join(" ");
  const toXY = (pt) => ({ x: pt[0] * b.width, y: pt[1] * b.height });


  return (
    <svg
      style={{
        position: "absolute", top: 0, left: 0,
        width: "100%", height: "100%",
        overflow: "visible",
        touchAction: "none",
      }}
    >
      {/* RDP preview: faded original polygons */}
      {rdpPreview && originalRegions && originalRegions.map((region, ri) => {
        const color = getColor(ri);
        const pts = toSVGStr(region.points);
        return (
          <polygon
            key={`orig-${region.id}`}
            points={pts}
            fill="none"
            stroke={color}
            strokeWidth={1 / zoom}
            strokeOpacity={0.25}
            strokeDasharray={`${4 / zoom} ${3 / zoom}`}
            vectorEffect="non-scaling-stroke"
            style={{ pointerEvents: "none" }}
          />
        );
      })}

      {/* Completed regions */}
      {regions.map((region, ri) => {
        const color = getColor(ri);
        const pts = toSVGStr(region.points);
        const isSelected = selectedId === region.id;
        const isDragging = draggingId === region.id;
        const isHovered = hoveredId === region.id;
        const sw = (isSelected ? 2.5 : isHovered ? 2 : 1.5) / zoom;
        const labelSize = 10 / zoom;
        const fillOpacity = isDragging ? 0.5 : isSelected ? 0.4 : isHovered ? 0.35 : 0.25;

        // Label position (centroid, de-overlapped)
        const labelPos = labelPositions[ri] || polygonCentroid(region.points, b);

        // Vertex count badge for RDP preview
        const origCount = rdpPreview && region._originalPoints
          ? region._originalPoints.length
          : null;
        const currentCount = region.points.length;

        // Approximate label width for background pill (rough: 6px per char at this size)
        const charWidth = labelSize * 0.55;
        const labelWidth = region.name.length * charWidth;
        const pillPadX = 4 / zoom;
        const pillPadY = 3 / zoom;
        const pillRadius = 3 / zoom;

        return (
          <g key={region.id}>
            <polygon
              points={pts}
              fill={color}
              fillOpacity={fillOpacity}
              stroke={isSelected ? "#fff" : color}
              strokeWidth={sw}
              vectorEffect="non-scaling-stroke"
              style={{
                touchAction: "none",
                cursor: mode === "draw" ? "crosshair" : isDragging ? "grabbing" : "grab",
              }}
              onPointerEnter={() => setHoveredId(region.id)}
              onPointerLeave={() => setHoveredId(null)}
              onPointerDown={(e) => {
                if (mode !== "draw" && onPolygonPointerDown) {
                  e.stopPropagation();
                  onPolygonPointerDown(e, region.id);
                }
              }}
            />
            {/* Label background pill */}
            <rect
              x={labelPos.x - labelWidth / 2 - pillPadX}
              y={labelPos.y - labelSize * 0.75 - pillPadY}
              width={labelWidth + pillPadX * 2}
              height={labelSize + pillPadY * 2}
              rx={pillRadius}
              ry={pillRadius}
              fill="rgba(0, 0, 0, 0.7)"
              stroke={color}
              strokeWidth={0.5 / zoom}
              strokeOpacity={0.5}
              style={{ pointerEvents: "none" }}
            />
            {/* Label text */}
            <text
              x={labelPos.x} y={labelPos.y}
              fill={isSelected ? "#fff" : color}
              fontSize={labelSize}
              fontFamily={LABEL_FONT}
              fontWeight="600"
              textAnchor="middle"
              dominantBaseline="central"
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              {region.name}
            </text>
            {/* RDP vertex reduction badge */}
            {rdpPreview && origCount !== null && (
              <>
                <rect
                  x={labelPos.x - (region.name.length * charWidth * 0.5) - pillPadX}
                  y={labelPos.y + labelSize * 0.6}
                  width={labelWidth + pillPadX * 2}
                  height={8 / zoom + pillPadY * 2}
                  rx={pillRadius}
                  ry={pillRadius}
                  fill="rgba(0, 0, 0, 0.6)"
                  style={{ pointerEvents: "none" }}
                />
                <text
                  x={labelPos.x} y={labelPos.y + labelSize * 0.6 + (8 / zoom + pillPadY * 2) / 2}
                  fill={color}
                  fontSize={8 / zoom}
                  fontFamily={LABEL_FONT}
                  fontWeight="400"
                  textAnchor="middle"
                  dominantBaseline="central"
                  opacity={0.8}
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {origCount}pt → {currentCount}pt ({Math.round((1 - currentCount / origCount) * 100)}%)
                </text>
              </>
            )}
          </g>
        );
      })}

      {/* In-progress polyline */}
      {currentPoints.length >= 2 && (
        <polyline
          points={toSVGStr(currentPoints)}
          fill="none"
          stroke="#c0c0c0"
          strokeWidth={2 / zoom}
          strokeDasharray={`${5 / zoom} ${3 / zoom}`}
          vectorEffect="non-scaling-stroke"
        />
      )}


      {/* Closing preview */}
      {currentPoints.length >= 3 && activeSnapDisplay?.isFirstPoint && (() => {
        const last = toXY(currentPoints[currentPoints.length - 1]);
        const first = toXY(currentPoints[0]);
        return (
          <line
            x1={last.x} y1={last.y}
            x2={first.x} y2={first.y}
            stroke={closingWouldIntersect ? "#666" : "rgba(200, 200, 200, 0.5)"}
            strokeWidth={1.5 / zoom}
            strokeDasharray={`${4 / zoom} ${3 / zoom}`}
            vectorEffect="non-scaling-stroke"
            style={{ pointerEvents: "none" }}
          />
        );
      })()}

      {/* Vertex dots — larger for touch visibility */}
      {currentPoints.map((pt, i) => {
        const { x, y } = toXY(pt);
        const r = (i === 0 ? 6 : 4) / zoom;
        return (
          <circle
            key={i} cx={x} cy={y} r={r}
            fill={i === 0 ? "#e0e0e0" : "#b0b0b0"}
            stroke="#0f0f0f" strokeWidth={1.5 / zoom}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}

      {/* Snap indicator — first-point closure */}
      {activeSnapDisplay?.isFirstPoint && (() => {
        const { x, y } = toXY(activeSnapDisplay.coords);
        const sw = 2 / zoom;
        const r = 10 / zoom;
        const fontSize = 11 / zoom;
        const labelOffset = 14 / zoom;
        return (
          <g style={{ pointerEvents: "none" }}>
            <circle
              cx={x} cy={y} r={r}
              fill="rgba(200, 200, 200, 0.15)"
              stroke="#d0d0d0"
              strokeWidth={sw}
              strokeDasharray={`${4 / zoom} ${3 / zoom}`}
            />
            <text
              x={x + labelOffset} y={y + fontSize * 0.4}
              fill="#d0d0d0" fontSize={fontSize}
              fontFamily={LABEL_FONT}
              fontWeight="600"
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              Close
            </text>
          </g>
        );
      })()}

      {/* Snap indicator — region vertex snap */}
      {activeSnapDisplay?.isRegionSnap && (() => {
        const { x, y } = toXY(activeSnapDisplay.coords);
        const sw = 2 / zoom;
        const r = 8 / zoom;
        const fontSize = 10 / zoom;
        const labelOffset = 12 / zoom;
        return (
          <g style={{ pointerEvents: "none" }}>
            <circle
              cx={x} cy={y} r={r}
              fill="rgba(80, 200, 200, 0.15)"
              stroke="#50c8c8"
              strokeWidth={sw}
            />
            {/* Small crosshair inside */}
            <line x1={x - 4 / zoom} y1={y} x2={x + 4 / zoom} y2={y}
              stroke="#50c8c8" strokeWidth={1 / zoom} opacity={0.6} />
            <line x1={x} y1={y - 4 / zoom} x2={x} y2={y + 4 / zoom}
              stroke="#50c8c8" strokeWidth={1 / zoom} opacity={0.6} />
            <text
              x={x + labelOffset} y={y + fontSize * 0.4}
              fill="#50c8c8" fontSize={fontSize}
              fontFamily={LABEL_FONT}
              fontWeight="600"
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              Snap: {activeSnapDisplay.regionName}
            </text>
          </g>
        );
      })()}
    </svg>
  );
}
