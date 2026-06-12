import { getColor } from "../constants";

export default function SVGOverlay({
  regions, currentPoints, zoom, bounds,
  hoveredId, setHoveredId, mode,
  activeSnapDisplay, closingWouldIntersect, warningMsg,
  selectedId, draggingId,
  onPolygonMouseDown,
}) {
  if (!bounds) return null;
  const b = bounds;

  const toSVGStr = (pts) => pts.map(p => `${p[0] * b.width},${p[1] * b.height}`).join(" ");
  const toXY = (pt) => ({ x: pt[0] * b.width, y: pt[1] * b.height });

  return (
    <svg style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", overflow: "visible" }}>
      {/* Completed regions */}
      {regions.map((region, ri) => {
        const color = getColor(ri);
        const pts = toSVGStr(region.points);
        const first = toXY(region.points[0]);
        const isSelected = selectedId === region.id;
        const isDragging = draggingId === region.id;
        const isHovered = hoveredId === region.id;
        const sw = (isSelected ? 2.5 : isHovered ? 2 : 1.5) / zoom;
        const labelSize = 10 / zoom;
        const fillOpacity = isDragging ? 0.5 : isSelected ? 0.4 : isHovered ? 0.35 : 0.25;
        return (
          <g key={region.id}>
            <polygon
              points={pts}
              fill={color}
              fillOpacity={fillOpacity}
              stroke={isSelected ? "#fff" : color}
              strokeWidth={sw}
              vectorEffect="non-scaling-stroke"
              style={{ cursor: mode === "draw" ? "crosshair" : isDragging ? "grabbing" : "grab" }}
              onMouseEnter={() => setHoveredId(region.id)}
              onMouseLeave={() => setHoveredId(null)}
              onMouseDown={(e) => {
                if (mode !== "draw" && onPolygonMouseDown) {
                  e.stopPropagation();
                  onPolygonMouseDown(e, region.id);
                }
              }}
              onClick={e => { if (mode !== "draw") e.stopPropagation(); }}
            />
            <text
              x={first.x} y={first.y - 6 / zoom}
              fill={isSelected ? "#fff" : color} fontSize={labelSize}
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

      {/* Preview segment: last point to snap/cursor */}
      {currentPoints.length >= 1 && activeSnapDisplay && !activeSnapDisplay.isFirstPoint && (() => {
        const last = toXY(currentPoints[currentPoints.length - 1]);
        const next = toXY(activeSnapDisplay.coords);
        const isUncloseable = warningMsg != null;
        return (
          <line
            x1={last.x} y1={last.y}
            x2={next.x} y2={next.y}
            stroke={isUncloseable ? "#f87171" : "#facc1588"}
            strokeWidth={1 / zoom}
            strokeDasharray={`${3 / zoom} ${2 / zoom}`}
            vectorEffect="non-scaling-stroke"
            style={{ pointerEvents: "none" }}
          />
        );
      })()}

      {/* Closing preview */}
      {currentPoints.length >= 3 && activeSnapDisplay?.isFirstPoint && (() => {
        const last = toXY(currentPoints[currentPoints.length - 1]);
        const first = toXY(currentPoints[0]);
        return (
          <line
            x1={last.x} y1={last.y}
            x2={first.x} y2={first.y}
            stroke={closingWouldIntersect ? "#f87171" : "#4ade8088"}
            strokeWidth={1 / zoom}
            strokeDasharray={`${3 / zoom} ${2 / zoom}`}
            vectorEffect="non-scaling-stroke"
            style={{ pointerEvents: "none" }}
          />
        );
      })()}

      {/* Vertex dots */}
      {currentPoints.map((pt, i) => {
        const { x, y } = toXY(pt);
        const r = (i === 0 ? 4 : 2.5) / zoom;
        return (
          <circle
            key={i} cx={x} cy={y} r={r}
            fill={i === 0 ? "#facc15" : "#fde68a"}
            stroke="#0f0f0f" strokeWidth={1 / zoom}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}

      {/* Snap indicator */}
      {activeSnapDisplay && (() => {
        const { x, y } = toXY(activeSnapDisplay.coords);
        const sw = 1.5 / zoom;

        if (activeSnapDisplay.isEdgeSnap) {
          if (!b) return null;
          const region = regions.find(r => r.id === activeSnapDisplay.regionId);
          if (!region) return null;
          const pts = region.points;
          const ai = activeSnapDisplay.pointIndex;
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
              <circle cx={x} cy={y} r={2.5 / zoom} fill="#a78bfa" vectorEffect="non-scaling-stroke" />
            </g>
          );
        }

        const r = (activeSnapDisplay.isFirstPoint ? 7 : 5) / zoom;
        const fontSize = 9 / zoom;
        const labelOffset = 10 / zoom;
        return (
          <g style={{ pointerEvents: "none" }}>
            <circle
              cx={x} cy={y} r={r}
              fill={activeSnapDisplay.isFirstPoint ? "rgba(74, 222, 128, 0.2)" : "rgba(250, 204, 21, 0.15)"}
              stroke={activeSnapDisplay.isFirstPoint ? "#4ade80" : "#facc15"}
              strokeWidth={sw}
              strokeDasharray={`${3 / zoom} ${2 / zoom}`}
            />
            {activeSnapDisplay.isFirstPoint && (
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
  );
}
