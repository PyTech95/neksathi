import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

// Reusable CENTERED modal/popup dialog (not a bottom sheet).
//
// Rendered through a PORTAL into <body> so it escapes any ancestor that has a
// transform / filter / backdrop-filter (e.g. our `.glass` cards). Without the
// portal, `position: fixed` would be relative to that ancestor instead of the
// viewport, which pushed the popup down the page (especially on mobile).
//
// It is also a scroll container: the backdrop scrolls and an inner wrapper with
// `min-height:100%` + flex-centering holds the card, so when the card fits it
// sits dead-center, and when it's taller than the screen (small phones, or when
// the keyboard shrinks the viewport) the whole popup scrolls — every control
// (Verify button, close ✕) always stays reachable and nothing is clipped.
export default function Modal({ open, onClose, title, children, maxWidth = 440 }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";   // lock background; the overlay scrolls instead
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const node = (
    <div
      onClick={onClose}
      data-testid="modal-backdrop"
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        overflowY: "auto", WebkitOverflowScrolling: "touch",
        background: "rgba(3,3,8,.72)", backdropFilter: "blur(5px)", WebkitBackdropFilter: "blur(5px)",
        animation: "sheetFade .18s ease",
      }}
    >
      <div
        style={{
          minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center",
          padding: "24px 16px", boxSizing: "border-box",
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          data-testid="modal"
          style={{
            width: "100%", maxWidth,
            background: "#0f0f17",
            border: "1px solid rgba(233,37,70,.35)",
            borderRadius: 20,
            padding: "18px 20px 22px",
            boxShadow: "0 28px 70px -14px rgba(0,0,0,.85)",
            animation: "modalPop .22s cubic-bezier(.2,.8,.2,1)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 12 }}>
            <h3 style={{ fontSize: 18, margin: 0 }}>{title}</h3>
            <button
              type="button" onClick={onClose} aria-label="Close"
              style={{ background: "rgba(255,255,255,.08)", border: "none", color: "#fff", width: 32, height: 32, borderRadius: 10, display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0 }}
            >
              <X size={16} />
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
