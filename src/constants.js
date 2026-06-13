export const REGION_COLORS = [
  "#ef4444","#f97316","#eab308","#22c55e",
  "#06b6d4","#6366f1","#ec4899","#14b8a6",
  "#f59e0b","#84cc16","#8b5cf6","#f43f5e",
];

export function getColor(index) {
  return REGION_COLORS[index % REGION_COLORS.length];
}

// iPadOS-optimized button styles — 44pt minimum touch targets
export function btnStyle(bg, fg, disabled) {
  return {
    background: disabled ? "#1a1a1a" : bg,
    color: disabled ? "#444" : fg,
    border: `1px solid ${disabled ? "#2a2a2a" : fg + "44"}`,
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
    background: active ? "rgba(10, 132, 255, 0.18)" : "transparent",
    color: active ? "#0a84ff" : "rgba(235, 235, 245, 0.6)",
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
