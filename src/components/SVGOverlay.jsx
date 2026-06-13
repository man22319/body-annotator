import { getColor } from "../constants";

export default function SVGOverlay({
  regions, currentPoints, zoom, bounds,
  hoveredId, setHoveredId, mode,
  activeSnapDisplay, closingWouldIntersect,
  selectedId, draggingId,
  onPolygonPointerDown,
}) {
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
      {/* Completed regions */}
      {regions.map((region, ri) => {
        const color = getColor(ri);
        const pts = toSVGStr(region.points);
        const first = toXY(region.points[0]);
        const isSelected = selectedId === region.id;
        const isDragging = draggingId === region.id;
        const isHovered = hoveredId === region.id;
        const sw = (isSelected ? 2.5 : isHovered ? 2 : 1.5) / zoom;
        const labelSize = 9 / zoom;
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
            <text
              x={first.x} y={first.y - 8 / zoom}
              fill={isSelected ? "#fff" : color}
              fontSize={labelSize}
              fontFamily="'IBM Plex Mono', monospace"
              fontWeight="500"
              letterSpacing="0.02em"
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

      {/* Snap indicator — only for first-point closure */}
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
              fontFamily="'IBM Plex Mono', monospace"
              fontWeight="600"
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              Close
            </text>
          </g>
        );
      })()}
    </svg>
  );
}
