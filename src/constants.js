export const REGION_COLORS = [
  "#ef4444","#f97316","#eab308","#22c55e",
  "#06b6d4","#6366f1","#ec4899","#14b8a6",
  "#f59e0b","#84cc16","#8b5cf6","#f43f5e",
];

export function getColor(index) {
  return REGION_COLORS[index % REGION_COLORS.length];
}

// Shared inline-style helpers
export function btnStyle(bg, fg, disabled) {
  return {
    background: disabled ? "#161616" : bg,
    color: disabled ? "#333" : fg,
    border: `1px solid ${disabled ? "#222" : fg + "44"}`,
    borderRadius: 3, padding: "5px 10px", fontSize: 11,
    fontFamily: "IBM Plex Mono, monospace", letterSpacing: "0.06em",
    cursor: disabled ? "not-allowed" : "pointer",
    whiteSpace: "nowrap", transition: "background 0.2s, color 0.2s",
  };
}

export function toolbarBtnStyle(active) {
  return {
    background: active ? "rgba(96, 165, 250, 0.15)" : "transparent",
    color: active ? "#60a5fa" : "#888",
    border: "none", borderRadius: 4, padding: "4px 8px", fontSize: 11,
    fontFamily: "inherit", cursor: "pointer", outline: "none",
    transition: "background 0.2s, color 0.2s",
  };
}
