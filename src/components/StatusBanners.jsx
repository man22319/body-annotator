export function ErrorBanner({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div style={{
      position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
      background: "rgba(100, 100, 100, 0.15)", border: "1px solid rgba(150, 150, 150, 0.25)",
      color: "#a0a0a0",
      padding: "10px 16px", borderRadius: 12, fontSize: 14,
      fontFamily: "-apple-system, 'SF Pro Text', system-ui, sans-serif",
      fontWeight: 500,
      zIndex: 20, maxWidth: "calc(100% - 48px)",
      display: "flex", alignItems: "center", gap: 12,
      backdropFilter: "blur(20px) saturate(180%)",
      WebkitBackdropFilter: "blur(20px) saturate(180%)",
      boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
    }}>
      <span style={{ flexShrink: 0, fontSize: 18 }}>⚠</span>
      <span style={{ flex: 1 }}>{message}</span>
      <button onClick={onDismiss}
        style={{
          background: "none", border: "none",
          color: "#888", fontSize: 18,
          padding: "4px 8px", minHeight: 36, minWidth: 36,
          display: "flex", alignItems: "center", justifyContent: "center",
          WebkitTapHighlightColor: "transparent",
          touchAction: "manipulation",
        }}
      >
        ✕
      </button>
    </div>
  );
}

export function WarningBanner({ message }) {
  if (!message) return null;
  return (
    <div style={{
      position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
      background: "rgba(120, 120, 120, 0.1)", border: "1px solid rgba(150, 150, 150, 0.2)",
      color: "#b0b0b0",
      padding: "10px 16px", borderRadius: 12, fontSize: 14,
      fontFamily: "-apple-system, 'SF Pro Text', system-ui, sans-serif",
      fontWeight: 500,
      zIndex: 20, maxWidth: "calc(100% - 48px)",
      display: "flex", alignItems: "center", gap: 12,
      backdropFilter: "blur(20px) saturate(180%)",
      WebkitBackdropFilter: "blur(20px) saturate(180%)",
      boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
      pointerEvents: "none",
    }}>
      <span style={{ flexShrink: 0, fontSize: 18 }}>⚠</span>
      <span>{message}</span>
    </div>
  );
}
