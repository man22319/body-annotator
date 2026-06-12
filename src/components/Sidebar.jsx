import { getColor, btnStyle } from "../constants";

export default function Sidebar({
  regionName, setRegionName, currentPoints,
  regions, hoveredId, setHoveredId, selectedId,
  onFinishRegion, onUndoPoint, onDiscard, onDeleteRegion, onMirrorRegion, onExport,
  onUndo, onRedo, canUndo, canRedo,
}) {
  const totalRegions = regions.length;
  return (
    <div style={{
      width: 240, background: "#111", borderLeft: "1px solid #2a2a2a",
      display: "flex", flexDirection: "column", fontSize: 12, zIndex: 5,
    }}>
      {/* New Region form */}
      <div style={{ padding: "16px", borderBottom: "1px solid #1e1e1e" }}>
        <div style={{ color: "#555", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
          New Region
        </div>
        <input
          value={regionName}
          onChange={e => setRegionName(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") onFinishRegion(); }}
          placeholder="region_name"
          style={{
            width: "100%", background: "#0f0f0f", border: "1px solid #2a2a2a",
            borderRadius: 3, color: "#e8e6e0", fontFamily: "inherit", fontSize: 12,
            padding: "6px 8px", marginBottom: 10, boxSizing: "border-box", outline: "none",
          }}
        />
        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          <button onClick={onFinishRegion} disabled={currentPoints.length < 3} style={btnStyle("#1a2a3a", "#60a5fa", currentPoints.length < 3)}>
            Finish ({currentPoints.length}pt)
          </button>
          <button onClick={onUndoPoint} disabled={currentPoints.length === 0} style={btnStyle("#2a1a1a", "#f87171", currentPoints.length === 0)}>
            Undo Pt
          </button>
        </div>
        {currentPoints.length > 0 && (
          <button onClick={onDiscard} style={{ ...btnStyle("#1a1a1a", "#555", false), width: "100%", fontSize: 11 }}>
            Discard
          </button>
        )}
        <div style={{ marginTop: 10, fontSize: 10, color: "#333", lineHeight: 1.7 }}>
          <div>Ctrl+Z — undo / Ctrl+Y — redo</div>
          <div>Esc — discard</div>
          <div>Space — pan mode</div>
          <div>Two-finger swipe — pan</div>
          <div>Pinch / Ctrl+scroll — zoom</div>
        </div>
      </div>

      {/* Region list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>
        <div style={{ color: "#555", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
          Regions
        </div>
        {regions.length === 0 ? (
          <div style={{ color: "#333", fontSize: 11, lineHeight: 1.6 }}>
            Click the image<br />to place vertices.<br />3+ points to finish.
          </div>
        ) : (
          regions.map((region, ri) => {
            const color = getColor(ri);
            const isSelected = selectedId === region.id;
            return (
              <div
                key={region.id}
                onMouseEnter={() => setHoveredId(region.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "5px 7px", marginBottom: 4, borderRadius: 3,
                  background: isSelected ? "#1e1e2e" : hoveredId === region.id ? "#1a1a1a" : "transparent",
                  border: `1px solid ${isSelected ? "#60a5fa44" : hoveredId === region.id ? "#2a2a2a" : "transparent"}`,
                  cursor: "default",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: isSelected ? "#e8e6e0" : "#c8c6c0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {region.name}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                  <span style={{ fontSize: 10, color: "#444" }}>{region.points.length}pt</span>
                  <button
                    onClick={() => onMirrorRegion(region.id)}
                    style={{ background: "none", border: "none", color: "#60a5fa", cursor: "pointer", fontSize: 13, padding: "0 2px", lineHeight: 1 }}
                    title="Duplicate & Mirror"
                  >◨</button>
                  <button
                    onClick={() => onDeleteRegion(region.id)}
                    style={{ background: "none", border: "none", color: "#444", cursor: "pointer", fontSize: 13, padding: "0 2px", lineHeight: 1 }}
                    title="Delete region"
                  >x</button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: "12px", borderTop: "1px solid #1e1e1e" }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          <button onClick={onUndo} disabled={!canUndo} style={{ ...btnStyle("#1a1a2a", "#60a5fa", !canUndo), flex: 1 }}>
            Undo
          </button>
          <button onClick={onRedo} disabled={!canRedo} style={{ ...btnStyle("#1a1a2a", "#60a5fa", !canRedo), flex: 1 }}>
            Redo
          </button>
        </div>
        <button
          onClick={onExport}
          disabled={totalRegions === 0}
          style={{ ...btnStyle("#1a3a1a", "#4ade80", totalRegions === 0), width: "100%" }}
        >
          Export JSON
        </button>
      </div>
    </div>
  );
}
