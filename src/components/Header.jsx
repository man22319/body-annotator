import { btnStyle } from "../constants";

export default function Header({ totalRegions, onExport }) {
  return (
    <div style={{
      borderBottom: "1px solid #2a2a2a", padding: "12px 20px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      background: "#111", zIndex: 5,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", color: "#e8e6e0", textTransform: "uppercase" }}>
          Region Annotator
        </span>
        <span style={{ fontSize: 11, color: "#555", letterSpacing: "0.06em" }}>body — named polygons</span>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "#555" }}>{totalRegions} region{totalRegions !== 1 ? "s" : ""}</span>
        <button onClick={onExport} style={btnStyle("#1a3a1a", "#4ade80", totalRegions === 0)}>
          Export JSON
        </button>
      </div>
    </div>
  );
}
