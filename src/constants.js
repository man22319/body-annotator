export const REGION_COLORS = [
  "#c0c0c0","#a0a0a0","#808080","#d0d0d0",
  "#b0b0b0","#909090","#e0e0e0","#707070",
  "#c8c8c8","#989898","#b8b8b8","#a8a8a8",
];

export function getColor(index) {
  return REGION_COLORS[index % REGION_COLORS.length];
}

// iPadOS-optimized button styles — 44pt minimum touch targets
export function btnStyle(bg, fg, disabled) {
  return {
    background: disabled ? "#1a1a1a" : bg,
    color: disabled ? "#444" : fg,
    border: `1px solid ${disabled ? "#2a2a2a" : "rgba(255,255,255,0.12)"}`,
    borderRadius: 10, padding: "10px 16px", fontSize: 14,
    fontFamily: "-apple-system, 'SF Pro Text', system-ui, sans-serif",
    fontWeight: 500,
    letterSpacing: "-0.01em",
    cursor: disabled ? "not-allowed" : "pointer",
    whiteSpace: "nowrap",
    transition: "background 0.15s, transform 0.1s",
    minHeight: 44,
    WebkitTapHighlightColor: "transparent",
    touchAction: "manipulation",
  };
}

export function toolbarBtnStyle(active) {
  return {
    background: active ? "rgba(255, 255, 255, 0.12)" : "transparent",
    color: active ? "#e0e0e0" : "rgba(235, 235, 245, 0.6)",
    border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 14,
    fontFamily: "-apple-system, 'SF Pro Text', system-ui, sans-serif",
    fontWeight: 500,
    cursor: "pointer", outline: "none",
    transition: "background 0.15s, color 0.15s",
    minHeight: 44, minWidth: 44,
    display: "flex", alignItems: "center", justifyContent: "center",
    WebkitTapHighlightColor: "transparent",
    touchAction: "manipulation",
  };
}

// Icon button for toolbar actions (undo, redo, zoom)
export function iconBtnStyle(disabled) {
  return {
    background: "transparent",
    color: disabled ? "rgba(235, 235, 245, 0.18)" : "rgba(235, 235, 245, 0.6)",
    border: "none", borderRadius: 8, padding: "8px",
    fontSize: 18,
    cursor: disabled ? "not-allowed" : "pointer",
    outline: "none",
    transition: "background 0.15s, color 0.15s",
    minHeight: 44, minWidth: 44,
    display: "flex", alignItems: "center", justifyContent: "center",
    WebkitTapHighlightColor: "transparent",
    touchAction: "manipulation",
  };
}
