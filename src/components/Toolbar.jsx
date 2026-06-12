import { toolbarBtnStyle } from "../constants";

export default function Toolbar({
  mode, isSpacePressed, zoom,
  onToggleMode, onZoomIn, onZoomOut, onResetView,
  onUndo, onRedo, canUndo, canRedo,
}) {
  return (
    <div style={{
      position: "absolute", bottom: 12, right: 12,
      display: "flex", alignItems: "center", gap: 6,
      background: "rgba(17, 17, 17, 0.85)", backdropFilter: "blur(8px)",
      border: "1px solid #2a2a2a", padding: "4px 8px", borderRadius: 6, zIndex: 10,
      boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
    }}>
      <button onClick={onToggleMode} style={toolbarBtnStyle(mode === "pan" || isSpacePressed)} title="Toggle Draw / Pan (Space)">
        {mode === "pan" || isSpacePressed ? "Pan" : "Draw"}
      </button>
      <div style={{ width: 1, height: 16, background: "#2a2a2a", margin: "0 4px" }} />
      <button onClick={onUndo} disabled={!canUndo} style={{ ...toolbarBtnStyle(false), opacity: canUndo ? 1 : 0.3 }} title="Undo (Ctrl+Z)">
        Undo
      </button>
      <button onClick={onRedo} disabled={!canRedo} style={{ ...toolbarBtnStyle(false), opacity: canRedo ? 1 : 0.3 }} title="Redo (Ctrl+Shift+Z)">
        Redo
      </button>
      <div style={{ width: 1, height: 16, background: "#2a2a2a", margin: "0 4px" }} />
      <button onClick={onZoomOut} style={toolbarBtnStyle(false)} title="Zoom Out">-</button>
      <span style={{ fontSize: 11, minWidth: 42, textAlign: "center", userSelect: "none" }}>
        {Math.round(zoom * 100)}%
      </span>
      <button onClick={onZoomIn} style={toolbarBtnStyle(false)} title="Zoom In">+</button>
      <div style={{ width: 1, height: 16, background: "#2a2a2a", margin: "0 4px" }} />
      <button onClick={onResetView} style={toolbarBtnStyle(false)} title="Reset View">Reset</button>
    </div>
  );
}
