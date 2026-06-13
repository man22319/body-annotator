export const REGION_COLORS = [
  "#FF6B6B", // coral red
  "#4ECDC4", // teal
  "#FFE66D", // golden yellow
  "#A78BFA", // soft purple
  "#FF9F43", // tangerine
  "#2ED573", // emerald green
  "#54A0FF", // sky blue
  "#FF6B81", // pink
  "#1DD1A1", // mint
  "#F368E0", // magenta
  "#FECA57", // lemon
  "#48DBFB", // cyan
  "#FF9FF3", // light pink
  "#00D2D3", // aqua
  "#C44569", // berry
  "#F8B500", // amber
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
