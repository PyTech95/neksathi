import { useEffect } from "react";
import { X } from "lucide-react";

// Reusable bottom-sheet drawer that slides up from the bottom of the screen.
// Used for pickers (vehicle type, ringtone) so the app shows a modern sheet
// instead of the plain native <select> dropdown.
export default function BottomSheet({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      data-testid="bottom-sheet-backdrop"
      style={{
        position: "fixed", inset: 0, zIndex: 7000,
        background: "rgba(3,3,8,.62)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        animation: "sheetFade .2s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        data-testid="bottom-sheet"
        style={{
          width: "100%", maxWidth: 520,
          background: "#0f0f17",
          borderTop: "1px solid rgba(233,37,70,.35)",
          borderTopLeftRadius: 22, borderTopRightRadius: 22,
          padding: "10px 16px calc(22px + env(safe-area-inset-bottom))",
          boxShadow: "0 -22px 55px -12px rgba(0,0,0,.75)",
          animation: "sheetUp .28s cubic-bezier(.2,.8,.2,1)",
          maxHeight: "82vh", overflowY: "auto",
        }}
      >
        {/* Sticky header: the drag handle, title and ✕ stay pinned at the top of
            the sheet, so the close button is always reachable even after the
            list below is scrolled. */}
        <div style={{ position: "sticky", top: 0, zIndex: 3, background: "#0f0f17", margin: "0 -16px", padding: "2px 16px 12px" }}>
          <div style={{ width: 42, height: 5, borderRadius: 999, background: "rgba(255,255,255,.22)", margin: "4px auto 12px" }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h3 style={{ fontSize: 18, margin: 0 }}>{title}</h3>
            <button
              type="button" onClick={onClose} aria-label="Close"
              style={{ background: "rgba(255,255,255,.08)", border: "none", color: "#fff", width: 32, height: 32, borderRadius: 10, display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0 }}
            >
              <X size={16} />
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
