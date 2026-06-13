export function ErrorBanner({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div style={{
      position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
      background: "rgba(255, 69, 58, 0.12)", border: "1px solid rgba(255, 69, 58, 0.3)",
      color: "#ff6961",
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
          color: "#ff453a", fontSize: 18,
          padding: "4px 8px", minHeight: 36, minWidth: 36,
          display: "flex", alignItems: "center", justifyContent: "center",
          WebkitTapHighlightColor: "transparent",
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
      background: "rgba(255, 214, 10, 0.1)", border: "1px solid rgba(255, 214, 10, 0.25)",
      color: "#ffd60a",
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
