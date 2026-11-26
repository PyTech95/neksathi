import { useEffect, useState } from "react";
import { Navigation, Loader2 } from "lucide-react";
import { bgLocationSupported, startBackgroundLocation, stopBackgroundLocation, backgroundLocationStatus } from "@/lib/bglocation";

// Opt-in background location sharing (native app only). When on, the phone keeps
// posting its location to the family timeline even when the app is closed, and
// over-limit driving triggers a real-time alert to the circle.
export default function BackgroundLocationCard() {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { let m = true; backgroundLocationStatus().then((v) => m && setOn(v)); return () => { m = false; }; }, []);

  if (!bgLocationSupported()) return null;

  const toggle = async () => {
    setErr(""); setBusy(true);
    try {
      if (on) { await stopBackgroundLocation(); setOn(false); }
      else { const r = await startBackgroundLocation(); setOn(r); }
    } catch (e) {
      setErr(e?.message || "Couldn't change background sharing.");
    } finally { setBusy(false); }
  };

  return (
    <div className="glass" style={{ padding: "14px 16px", borderRadius: 14, marginBottom: 16, display: "flex", alignItems: "center", gap: 14 }} data-testid="bg-location-card">
      <span style={{ width: 42, height: 42, borderRadius: 11, flexShrink: 0, display: "grid", placeItems: "center", background: on ? "rgba(52,211,153,.16)" : "rgba(233,37,70,.12)", color: on ? "#34d399" : "#ff5a74", border: `1px solid ${on ? "rgba(52,211,153,.4)" : "var(--panel-brd)"}` }}>
        <Navigation size={19} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5 }}>Background location sharing</div>
        <div className="muted" style={{ fontSize: 12.5 }}>
          {on ? "On — your family sees your live trail and overspeed even when the app is closed." : "Keep sharing your trail & overspeed with family even when the app is closed."}
        </div>
        {err && <div style={{ color: "var(--danger)", fontSize: 12, marginTop: 4 }} data-testid="bg-location-error">{err}</div>}
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={on}
        data-testid="bg-location-toggle"
        style={{ width: 48, height: 28, borderRadius: 999, border: "none", cursor: "pointer", flexShrink: 0, position: "relative",
          background: on ? "linear-gradient(100deg,#059669,#34d399)" : "rgba(150,150,170,.3)" }}>
        {busy ? (
          <Loader2 size={14} className="spin" style={{ color: "#fff", position: "absolute", top: 7, left: 17 }} />
        ) : (
          <span style={{ position: "absolute", top: 3, left: on ? 23 : 3, width: 22, height: 22, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
        )}
      </button>
    </div>
  );
}
