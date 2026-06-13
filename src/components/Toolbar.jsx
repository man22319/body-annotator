import { iconBtnStyle, toolbarBtnStyle } from "../constants";

export default function Toolbar({
  mode, zoom,
  onToggleMode, onZoomIn, onZoomOut, onResetView,
  onUndo, onRedo, canUndo, canRedo,
}) {
  return (
    <div style={{
      position: "absolute",
      bottom: `calc(12px + var(--safe-bottom))`,
      left: "50%", transform: "translateX(-50%)",
      display: "flex", alignItems: "center", gap: 2,
      background: "var(--material-thick)",
      backdropFilter: "blur(20px) saturate(180%)",
      WebkitBackdropFilter: "blur(20px) saturate(180%)",
      border: "1px solid var(--separator)",
      padding: "4px 6px", borderRadius: 14, zIndex: 10,
      boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    }}>
      {/* Draw / Pan toggle */}
      <button
        onClick={onToggleMode}
        style={toolbarBtnStyle(mode === "draw")}
        title="Draw Mode"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 19l7-7 3 3-7 7-3-3z" />
          <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
          <path d="M2 2l7.586 7.586" />
          <circle cx="11" cy="11" r="2" />
        </svg>
      </button>
      <button
        onClick={onToggleMode}
        style={toolbarBtnStyle(mode === "pan")}
        title="Pan Mode"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 9l-3 3 3 3" />
          <path d="M9 5l3-3 3 3" />
          <path d="M15 19l-3 3-3-3" />
          <path d="M19 9l3 3-3 3" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <line x1="12" y1="2" x2="12" y2="22" />
        </svg>
      </button>

      <Divider />

      {/* Undo / Redo */}
      <button onClick={onUndo} disabled={!canUndo} style={iconBtnStyle(!canUndo)} title="Undo">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="1 4 1 10 7 10" />
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
        </svg>
      </button>
      <button onClick={onRedo} disabled={!canRedo} style={iconBtnStyle(!canRedo)} title="Redo">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" />
        </svg>
      </button>

      <Divider />

      {/* Zoom */}
      <button onClick={onZoomOut} style={iconBtnStyle(false)} title="Zoom Out">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
          <line x1="8" y1="11" x2="14" y2="11" />
        </svg>
      </button>
      <span style={{
        fontSize: 13, minWidth: 48, textAlign: "center",
        userSelect: "none", color: "var(--label-secondary)",
        fontWeight: 500, fontVariantNumeric: "tabular-nums",
      }}>
        {Math.round(zoom * 100)}%
      </span>
      <button onClick={onZoomIn} style={iconBtnStyle(false)} title="Zoom In">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
          <line x1="11" y1="8" x2="11" y2="14" />
          <line x1="8" y1="11" x2="14" y2="11" />
        </svg>
      </button>

      <Divider />

      <button onClick={onResetView} style={iconBtnStyle(false)} title="Reset View">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3h7v7H3z" />
          <path d="M14 3h7v7h-7z" />
          <path d="M3 14h7v7H3z" />
          <path d="M14 14h7v7h-7z" />
        </svg>
      </button>
    </div>
  );
}

function Divider() {
  return (
    <div style={{
      width: 1, height: 24,
      background: "var(--separator)",
      margin: "0 4px",
    }} />
  );
}
