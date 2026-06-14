export default function Header({ totalRegions, onTogglePanel }) {
  return (
    <div style={{
      borderBottom: "1px solid var(--separator)",
      padding: `calc(8px + var(--safe-top)) 16px 8px`,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      background: "var(--material-thick)",
      backdropFilter: "blur(20px) saturate(180%)",
      WebkitBackdropFilter: "blur(20px) saturate(180%)",
      zIndex: 15,
      minHeight: 44,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{
          fontSize: 17, fontWeight: 600, letterSpacing: "-0.02em",
          color: "var(--label-primary)",
        }}>
          Annotator
        </span>
        <span style={{
          fontSize: 13, color: "var(--label-tertiary)",
          fontWeight: 400,
        }}>
          {totalRegions} region{totalRegions !== 1 ? "s" : ""}
        </span>
      </div>

      <button
        onClick={onTogglePanel}
        style={{
          background: "rgba(255,255,255,0.08)",
          border: "none", borderRadius: 8,
          color: "var(--label-secondary)",
          fontSize: 14, fontWeight: 500,
          padding: "8px 14px",
          minHeight: 36,
          fontFamily: "-apple-system, 'SF Pro Text', system-ui, sans-serif",
          WebkitTapHighlightColor: "transparent",
          display: "flex", alignItems: "center", gap: 6,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="15" y1="3" x2="15" y2="21" />
        </svg>
        Regions
      </button>
    </div>
  );
}
