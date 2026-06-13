import { useState, useRef, useEffect } from "react";
import { getColor, btnStyle } from "../constants";

export default function Sidebar({
  isOpen, onClose,
  regionName, setRegionName, currentPoints,
  regions, hoveredId, setHoveredId, selectedId,
  onFinishRegion, onUndoPoint, onDiscard, onDeleteRegion, onMirrorRegion, onExport,
  onUndo, onRedo, canUndo, canRedo,
}) {
  const totalRegions = regions.length;
  const panelRef = useRef(null);
  const [closing, setClosing] = useState(false);

  // Animate close
  const handleClose = () => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      onClose();
    }, 250);
  };

  // Prevent touch events on panel from propagating to canvas
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const stop = (e) => {
      e.stopPropagation();
    };
    // Stop propagation to canvas but allow default behavior (scrolling, button clicks)
    el.addEventListener("pointerdown", stop, { passive: true });
    el.addEventListener("pointermove", stop, { passive: true });
    el.addEventListener("pointerup", stop, { passive: true });
    // Also prevent native touch gestures from leaking to canvas
    const preventTouch = (e) => e.stopPropagation();
    el.addEventListener("touchstart", preventTouch, { passive: true });
    el.addEventListener("touchmove", preventTouch, { passive: true });
    return () => {
      el.removeEventListener("pointerdown", stop);
      el.removeEventListener("pointermove", stop);
      el.removeEventListener("pointerup", stop);
      el.removeEventListener("touchstart", preventTouch);
      el.removeEventListener("touchmove", preventTouch);
    };
  }, [isOpen]);

  if (!isOpen && !closing) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{
          position: "fixed", inset: 0, zIndex: 90,
          background: "rgba(0,0,0,0.4)",
          animation: closing ? "fadeOut 0.25s ease forwards" : "fadeIn 0.2s ease forwards",
        }}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        style={{
          position: "fixed",
          top: 0, right: 0, bottom: 0,
          width: 320, maxWidth: "85vw",
          background: "var(--material-thick)",
          backdropFilter: "blur(40px) saturate(180%)",
          WebkitBackdropFilter: "blur(40px) saturate(180%)",
          borderLeft: "1px solid var(--separator)",
          display: "flex", flexDirection: "column",
          fontSize: 14, zIndex: 100,
          animation: closing
            ? "slideOutRight 0.25s ease forwards"
            : "slideInRight 0.3s cubic-bezier(0.32, 0.72, 0, 1) forwards",
          paddingTop: "var(--safe-top)",
          paddingBottom: "var(--safe-bottom)",
          touchAction: "manipulation",
        }}
      >
        {/* Panel header */}
        <div style={{
          padding: "16px 16px 12px",
          borderBottom: "1px solid var(--separator)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{
            fontSize: 17, fontWeight: 600,
            color: "var(--label-primary)",
            letterSpacing: "-0.02em",
          }}>
            Regions
          </span>
          <button
            onClick={handleClose}
            style={{
              background: "rgba(255,255,255,0.1)", border: "none",
              borderRadius: "50%", width: 30, height: 30,
              color: "var(--label-secondary)", fontSize: 16,
              display: "flex", alignItems: "center", justifyContent: "center",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            ✕
          </button>
        </div>

        {/* New Region form */}
        <div style={{ padding: "16px", borderBottom: "1px solid var(--separator)" }}>
          <div style={{
            color: "var(--label-tertiary)", fontSize: 12, fontWeight: 600,
            letterSpacing: "0.02em", textTransform: "uppercase", marginBottom: 10,
          }}>
            New Region
          </div>
          <input
            value={regionName}
            onChange={e => setRegionName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") onFinishRegion(); }}
            placeholder="region_name"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
            style={{
              width: "100%", background: "rgba(0,0,0,0.3)",
              border: "1px solid var(--separator)",
              borderRadius: 10, color: "var(--label-primary)",
              fontFamily: "'SF Mono', 'Menlo', monospace", fontSize: 14,
              padding: "10px 12px", marginBottom: 12, boxSizing: "border-box",
              outline: "none", minHeight: 44,
            }}
          />
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <button
              onClick={onFinishRegion}
              disabled={currentPoints.length < 3}
              style={{ ...btnStyle("#0a2a4a", "#0a84ff", currentPoints.length < 3), flex: 1 }}
            >
              Finish ({currentPoints.length}pt)
            </button>
            <button
              onClick={onUndoPoint}
              disabled={currentPoints.length === 0}
              style={{ ...btnStyle("#2a1a1a", "#ff453a", currentPoints.length === 0), flex: 1 }}
            >
              Undo Pt
            </button>
          </div>
          {currentPoints.length > 0 && (
            <button
              onClick={onDiscard}
              style={{
                ...btnStyle("rgba(255,255,255,0.05)", "var(--label-secondary)", false),
                width: "100%", fontSize: 14,
              }}
            >
              Discard Drawing
            </button>
          )}
        </div>

        {/* Region list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}>
          <div style={{
            color: "var(--label-tertiary)", fontSize: 12, fontWeight: 600,
            letterSpacing: "0.02em", textTransform: "uppercase", marginBottom: 10,
          }}>
            All Regions ({totalRegions})
          </div>
          {regions.length === 0 ? (
            <div style={{
              color: "var(--label-quaternary)", fontSize: 14, lineHeight: 1.6,
              padding: "20px 0", textAlign: "center",
            }}>
              Use Apple Pencil<br />to place vertices.<br />3+ points to finish.
            </div>
          ) : (
            regions.map((region, ri) => {
              const color = getColor(ri);
              const isSelected = selectedId === region.id;
              return (
                <div
                  key={region.id}
                  onPointerEnter={() => setHoveredId(region.id)}
                  onPointerLeave={() => setHoveredId(null)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 12px", marginBottom: 4, borderRadius: 10,
                    background: isSelected ? "rgba(10, 132, 255, 0.12)"
                      : hoveredId === region.id ? "rgba(255,255,255,0.04)" : "transparent",
                    border: `1px solid ${isSelected ? "rgba(10, 132, 255, 0.25)"
                      : hoveredId === region.id ? "var(--separator)" : "transparent"}`,
                    minHeight: 44,
                    transition: "background 0.15s",
                  }}
                >
                  <div style={{
                    display: "flex", alignItems: "center", gap: 10, minWidth: 0,
                  }}>
                    <div style={{
                      width: 10, height: 10, borderRadius: 3,
                      background: color, flexShrink: 0,
                    }} />
                    <span style={{
                      fontSize: 14, color: isSelected ? "var(--label-primary)" : "var(--label-secondary)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      fontWeight: isSelected ? 500 : 400,
                    }}>
                      {region.name}
                    </span>
                  </div>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
                  }}>
                    <span style={{ fontSize: 12, color: "var(--label-quaternary)" }}>
                      {region.points.length}pt
                    </span>
                    <button
                      onClick={() => onMirrorRegion(region.id)}
                      style={{
                        background: "rgba(10, 132, 255, 0.12)",
                        border: "1px solid rgba(10, 132, 255, 0.25)",
                        borderRadius: 8,
                        color: "var(--tint-blue)",
                        padding: "6px 8px",
                        minWidth: 40, minHeight: 40,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        WebkitTapHighlightColor: "transparent",
                      }}
                      title="Mirror"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="16 3 21 3 21 8" />
                        <line x1="4" y1="20" x2="21" y2="3" />
                        <polyline points="21 16 21 21 16 21" />
                        <line x1="15" y1="15" x2="21" y2="21" />
                        <line x1="4" y1="4" x2="9" y2="9" />
                      </svg>
                    </button>
                    <button
                      onClick={() => onDeleteRegion(region.id)}
                      style={{
                        background: "rgba(255, 69, 58, 0.12)",
                        border: "1px solid rgba(255, 69, 58, 0.25)",
                        borderRadius: 8,
                        color: "var(--tint-red)",
                        padding: "6px 8px",
                        minWidth: 40, minHeight: 40,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        WebkitTapHighlightColor: "transparent",
                      }}
                      title="Delete"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <line x1="10" y1="11" x2="10" y2="17" />
                        <line x1="14" y1="11" x2="14" y2="17" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 16px",
          borderTop: "1px solid var(--separator)",
        }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <button
              onClick={onUndo} disabled={!canUndo}
              style={{ ...btnStyle("#0a1a2a", "#0a84ff", !canUndo), flex: 1 }}
            >
              Undo
            </button>
            <button
              onClick={onRedo} disabled={!canRedo}
              style={{ ...btnStyle("#0a1a2a", "#0a84ff", !canRedo), flex: 1 }}
            >
              Redo
            </button>
          </div>
          <button
            onClick={onExport}
            disabled={totalRegions === 0}
            style={{
              ...btnStyle("#0a2a0a", "#30d158", totalRegions === 0),
              width: "100%",
            }}
          >
            Export JSON
          </button>
        </div>
      </div>
    </>
  );
}
