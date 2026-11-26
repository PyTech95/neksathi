import { useEffect, useState } from "react";
import { Navigation, Loader2, MapPin } from "lucide-react";
import Modal from "@/components/Modal";
import { bgLocationSupported, startBackgroundLocation, stopBackgroundLocation, backgroundLocationStatus } from "@/lib/bglocation";

// Opt-in background location sharing (native app only). Turning it ON first shows
// a prominent disclosure (required by Google Play before any background-location
// permission request), and only on consent does the background service start.
export default function BackgroundLocationCard() {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [showDisclosure, setShowDisclosure] = useState(false);

  useEffect(() => { let m = true; backgroundLocationStatus().then((v) => m && setOn(v)); return () => { m = false; }; }, []);

  if (!bgLocationSupported()) return null;

  const toggle = async () => {
    setErr("");
    if (on) {
      // Turning OFF needs no disclosure.
      setBusy(true);
      try { await stopBackgroundLocation(); setOn(false); }
      catch (e) { setErr(e?.message || "Couldn't change background sharing."); }
      finally { setBusy(false); }
    } else {
      // Turning ON → show the prominent disclosure first.
      setShowDisclosure(true);
    }
  };

  const confirmEnable = async () => {
    setShowDisclosure(false);
    setErr(""); setBusy(true);
    try { const r = await startBackgroundLocation(); setOn(r); }
    catch (e) { setErr(e?.message || "Couldn't change background sharing."); }
    finally { setBusy(false); }
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

      {/* Prominent disclosure — shown BEFORE any background-location permission is
          requested, as Google Play requires. */}
      <Modal open={showDisclosure} onClose={() => setShowDisclosure(false)} title="Share location in the background?">
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <span style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, display: "grid", placeItems: "center", background: "rgba(52,211,153,.14)", color: "#34d399", border: "1px solid rgba(52,211,153,.4)" }}><MapPin size={20} /></span>
            <p className="muted" style={{ fontSize: 13.5, margin: 0, lineHeight: 1.6 }}>
              Nek Sathi collects location data to share your live location with your family
              circle and to send real-time over-speed alerts — <b style={{ color: "var(--text)" }}>even when the
              app is closed or not in use.</b>
            </p>
          </div>
          <p className="muted" style={{ fontSize: 12.5, margin: 0, lineHeight: 1.6 }}>
            This stays on only while you keep "Background location sharing" turned on. An ongoing
            notification is shown while it is active, and you can turn it off anytime.
          </p>
          <button className="btn btn-primary btn-block" onClick={confirmEnable} data-testid="bg-location-allow">Allow</button>
          <button className="btn btn-ghost btn-block" onClick={() => setShowDisclosure(false)} data-testid="bg-location-deny">Not now</button>
        </div>
      </Modal>
    </div>
  );
}
