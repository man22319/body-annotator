// ===========================================================================
// Export helpers
// ===========================================================================

export function quantize(v) {
  return Math.round(v * 1e6) / 1e6;
}

export function downloadJSON(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "regions.json";
  a.click();
  URL.revokeObjectURL(url);
}
