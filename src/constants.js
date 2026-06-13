// Golden-angle color generator — infinite distinct colors
const GOLDEN_ANGLE = 137.508;

export function getColor(index) {
  const hue = (index * GOLDEN_ANGLE) % 360;
  const saturation = 70 + (index % 3) * 10;   // 70-90%
  const lightness = 60 + (index % 4) * 5;      // 60-75%
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
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
