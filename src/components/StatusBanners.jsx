export function ErrorBanner({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div style={{
      position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
      background: "#1a0808", border: "1px solid #7f1d1d", color: "#fca5a5",
      padding: "8px 14px", borderRadius: 4, fontSize: 11,
      fontFamily: "IBM Plex Mono, monospace", letterSpacing: "0.04em",
      zIndex: 20, maxWidth: "calc(100% - 48px)",
      display: "flex", alignItems: "center", gap: 10,
      boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
    }}>
      <span style={{ flexShrink: 0, opacity: 0.7, fontWeight: 700 }}>!</span>
      <span style={{ flex: 1 }}>{message}</span>
      <button onClick={onDismiss}
        style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 14, padding: "0 2px", lineHeight: 1 }}>
        x
      </button>
    </div>
  );
}

export function WarningBanner({ message }) {
  if (!message) return null;
  return (
    <div style={{
      position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
      background: "#1a1200", border: "1px solid #78350f", color: "#fcd34d",
      padding: "7px 14px", borderRadius: 4, fontSize: 11,
      fontFamily: "IBM Plex Mono, monospace", letterSpacing: "0.04em",
      zIndex: 20, maxWidth: "calc(100% - 48px)",
      display: "flex", alignItems: "center", gap: 10,
      boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
      pointerEvents: "none",
    }}>
      <span style={{ flexShrink: 0, opacity: 0.6, fontWeight: 700 }}>!</span>
      <span>{message}</span>
    </div>
  );
}
