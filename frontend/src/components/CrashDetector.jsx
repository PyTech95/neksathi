import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ShieldCheck, Siren, Loader2, CheckCircle2 } from "lucide-react";
import api from "@/lib/api";
import { getPosition, captureSosPhoto } from "@/lib/native";
import { startCrashWatch, ensureMotionPermission } from "@/lib/crash";

const KEY = "nk_crash_on";
const COUNTDOWN = 20; // seconds before an un-cancelled crash auto-sends SOS

export const crashEnabled = () => { try { return localStorage.getItem(KEY) === "1"; } catch (_) { return false; } };
export const setCrashEnabled = (on) => {
  try { localStorage.setItem(KEY, on ? "1" : "0"); } catch (_) {}
  try { window.dispatchEvent(new Event("nk-crash-change")); } catch (_) {}
};

// Mounted once (in the Shell). When crash detection is on it watches the
// accelerometer; a possible crash raises a full-screen countdown. "I'm OK"
// cancels; otherwise an SOS auto-sends to the family at zero.
export default function CrashDetector() {
  const [on, setOn] = useState(crashEnabled());
  const [phase, setPhase] = useState("idle"); // idle | countdown | sending | sent
  const [left, setLeft] = useState(COUNTDOWN);
  const tickRef = useRef(null);

  useEffect(() => {
    const onChange = () => setOn(crashEnabled());
    window.addEventListener("nk-crash-change", onChange);
    return () => window.removeEventListener("nk-crash-change", onChange);
  }, []);

  // Attach / detach the accelerometer watcher with the setting.
  useEffect(() => {
    if (!on) return;
    let stop = () => {};
    let alive = true;
    ensureMotionPermission().then((ok) => {
      if (!ok || !alive) return;
      stop = startCrashWatch(() => {
        setPhase((p) => (p === "idle" ? "countdown" : p)); // ignore while already handling one
      });
    });
    return () => { alive = false; try { stop(); } catch (_) {} };
  }, [on]);

  // Countdown → auto-send.
  useEffect(() => {
    if (phase !== "countdown") return;
    setLeft(COUNTDOWN);
    try { navigator.vibrate && navigator.vibrate([400, 200, 400, 200, 400]); } catch (_) {}
    tickRef.current = setInterval(() => {
      setLeft((n) => {
        if (n <= 1) { clearInterval(tickRef.current); sendSos(); return 0; }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(tickRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const cancel = () => { clearInterval(tickRef.current); setPhase("idle"); };

  const sendSos = async () => {
    setPhase("sending");
    let coords = {};
    try { const p = await getPosition({ timeout: 6000 }); coords = { latitude: p.latitude, longitude: p.longitude }; } catch (_) {}
    try {
      const r = await api.post("/me/sos", coords);
      const ev = r.data;
      // Attach a front-camera photo to the crash SOS (best-effort). Native
      // captures + uploads it; on web we grab a selfie. Never blocks the alert.
      if (ev?.id) {
        captureSosPhoto(ev.id, "user").then((webPhoto) => {
          if (webPhoto) api.post(`/me/sos-events/${ev.id}/photo`, { photo_base64: webPhoto }).catch(() => {});
        }).catch(() => {});
      }
    } catch (_) {}
    setPhase("sent");
    setTimeout(() => setPhase("idle"), 6000);
  };

  if (phase === "idle") return null;
  if (typeof document === "undefined") return null;

  const node = (
    <div data-testid="crash-overlay" style={{ position: "fixed", inset: 0, zIndex: 9500, background: "rgba(120,10,20,.92)", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 24 }}>
      {phase === "countdown" && (
        <>
          <AlertTriangle size={54} />
          <h1 style={{ fontSize: 28, margin: "16px 0 6px" }}>Possible crash detected</h1>
          <p style={{ fontSize: 15, opacity: .9, maxWidth: 340 }}>Sending an SOS with your location to your family in</p>
          <div style={{ fontSize: 68, fontWeight: 800, margin: "10px 0 6px", lineHeight: 1 }} data-testid="crash-countdown">{left}</div>
          <p style={{ fontSize: 14, opacity: .85, marginBottom: 26 }}>Tap "I'm OK" if you're safe.</p>
          <button onClick={cancel} data-testid="crash-cancel" style={{ width: "100%", maxWidth: 340, padding: "16px", borderRadius: 14, border: "none", cursor: "pointer", background: "#fff", color: "#b3122f", fontWeight: 800, fontSize: 17, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 12 }}>
            <ShieldCheck size={20} /> I'm OK — cancel
          </button>
          <button onClick={() => { clearInterval(tickRef.current); sendSos(); }} data-testid="crash-send-now" style={{ width: "100%", maxWidth: 340, padding: "14px", borderRadius: 14, border: "1px solid rgba(255,255,255,.5)", cursor: "pointer", background: "transparent", color: "#fff", fontWeight: 700, fontSize: 15, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Siren size={18} /> Send SOS now
          </button>
        </>
      )}
      {phase === "sending" && (<><Loader2 size={46} className="spin" /><h1 style={{ fontSize: 24, marginTop: 16 }}>Sending SOS…</h1></>)}
      {phase === "sent" && (<><CheckCircle2 size={54} /><h1 style={{ fontSize: 26, margin: "16px 0 6px" }}>SOS sent</h1><p style={{ opacity: .9 }}>Your family has been alerted with your location.</p></>)}
    </div>
  );
  return createPortal(node, document.body);
}
