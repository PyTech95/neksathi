import { useEffect, useState } from "react";
import { Flashlight, FlashlightOff } from "lucide-react";
import { setTorch, torchSupported } from "@/lib/torch";

// Emergency flashlight toggle. Drives the native torch in the app; best-effort
// on the web. Turns itself off if the user leaves the screen.
export default function FlashlightCard() {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const toggle = async () => {
    setErr(""); setBusy(true);
    try {
      const next = !on;
      await setTorch(next);
      setOn(next);
    } catch (e) {
      setErr(e?.message || "Couldn't control the flashlight.");
      setOn(false);
    } finally {
      setBusy(false);
    }
  };

  // Safety: make sure the torch is off when this card unmounts.
  useEffect(() => () => { try { setTorch(false); } catch (_) {} }, []);

  if (!torchSupported()) return null;

  return (
    <div className="glass" style={{ padding: 20, borderRadius: 18, textAlign: "center" }} data-testid="flashlight-card">
      <p className="muted" style={{ marginTop: 0, fontSize: 13, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Flashlight</p>
      <p className="muted" style={{ marginTop: 4, fontSize: 14 }}>Turn on your phone's torch to signal for help or light your way.</p>
      <button
        data-testid="flashlight-toggle"
        onClick={toggle}
        disabled={busy}
        style={{
          width: 110, height: 110, borderRadius: "50%", border: "none", cursor: "pointer", margin: "16px auto 10px",
          display: "grid", placeItems: "center",
          background: on ? "radial-gradient(circle at 30% 30%,#fde68a,#f5a524)" : "var(--panel)",
          color: on ? "#1a1205" : "var(--text)",
          border: on ? "none" : "1px solid var(--panel-brd)",
          boxShadow: on ? "0 0 0 10px rgba(245,165,36,.18),0 14px 40px -10px rgba(245,165,36,.6)" : "none",
        }}>
        {on ? <Flashlight size={40} /> : <FlashlightOff size={40} />}
      </button>
      <div>
        <button className={`btn ${on ? "btn-primary" : "btn-ghost"}`} onClick={toggle} disabled={busy} data-testid="flashlight-label-btn">
          {on ? <><FlashlightOff size={16} /> Turn off</> : <><Flashlight size={16} /> Turn on</>}
        </button>
      </div>
      {err && <p style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 10 }} data-testid="flashlight-error">{err}</p>}
    </div>
  );
}
