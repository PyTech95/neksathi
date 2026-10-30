import { useEffect, useState } from "react";
import api from "@/lib/api";

// Shows the selfie the sender's phone captured with their SOS (when "capture
// image" was on). Fetched on demand from the family photo endpoint; tap to
// enlarge. Renders nothing if there is no photo / it can't be loaded.
export default function SosPhoto({ sosId, testPrefix = "sos" }) {
  const [src, setSrc] = useState(null);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let m = true;
    setSrc(null); setFailed(false);
    api.get(`/family/sos/${sosId}/photo`)
      .then((r) => { if (m) setSrc(r.data?.photo_base64 || null); })
      .catch(() => { if (m) setFailed(true); });
    return () => { m = false; };
  }, [sosId]);

  if (failed) return null;

  if (!src) {
    return (
      <div data-testid={`${testPrefix}-photo-loading`} style={{ height: 120, borderRadius: 12, background: "rgba(255,255,255,.06)", display: "grid", placeItems: "center", color: "var(--muted)", fontSize: 12.5 }}>
        Loading photo…
      </div>
    );
  }

  return (
    <>
      <div style={{ position: "relative" }}>
        <img
          src={src}
          alt="SOS capture"
          onClick={() => setOpen(true)}
          data-testid={`${testPrefix}-photo`}
          style={{ width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 12, cursor: "zoom-in", border: "1px solid rgba(255,59,92,.4)", display: "block" }}
        />
        <span style={{ position: "absolute", left: 8, bottom: 8, background: "rgba(0,0,0,.6)", color: "#fff", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999 }}>📸 Captured now</span>
      </div>
      {open && (
        <div
          onClick={() => setOpen(false)}
          data-testid={`${testPrefix}-photo-full`}
          style={{ position: "fixed", inset: 0, zIndex: 5000, background: "rgba(0,0,0,.9)", display: "grid", placeItems: "center", padding: 16, cursor: "zoom-out" }}
        >
          <img src={src} alt="SOS capture" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 12 }} />
        </div>
      )}
    </>
  );
}
