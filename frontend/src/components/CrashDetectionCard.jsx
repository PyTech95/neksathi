import { useState } from "react";
import { CarFront, AlertTriangle } from "lucide-react";
import { crashEnabled, setCrashEnabled } from "@/components/CrashDetector";
import { ensureMotionPermission } from "@/lib/crash";

// Toggle for accelerometer crash detection. When on, a hard impact raises a
// countdown that auto-sends an SOS unless the user cancels.
export default function CrashDetectionCard() {
  const [on, setOn] = useState(crashEnabled());
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    try {
      if (!on) { await ensureMotionPermission(); }
      setCrashEnabled(!on);
      setOn(!on);
    } finally { setBusy(false); }
  };

  return (
    <div className="glass" style={{ padding: "14px 16px", borderRadius: 14, display: "flex", alignItems: "center", gap: 14 }} data-testid="crash-card">
      <span style={{ width: 42, height: 42, borderRadius: 11, flexShrink: 0, display: "grid", placeItems: "center", background: on ? "rgba(52,211,153,.16)" : "rgba(233,37,70,.12)", color: on ? "#34d399" : "#ff5a74", border: `1px solid ${on ? "rgba(52,211,153,.4)" : "var(--panel-brd)"}` }}>
        <CarFront size={19} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5 }}>Crash detection</div>
        <div className="muted" style={{ fontSize: 12.5 }}>
          {on ? "On — a hard impact starts a countdown, then auto-sends an SOS unless you cancel." : "Detect a hard impact and auto-send an SOS to your family if you don't respond."}
        </div>
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={on}
        data-testid="crash-toggle"
        style={{ width: 48, height: 28, borderRadius: 999, border: "none", cursor: "pointer", flexShrink: 0, position: "relative",
          background: on ? "linear-gradient(100deg,#059669,#34d399)" : "rgba(150,150,170,.3)" }}>
        <span style={{ position: "absolute", top: 3, left: on ? 23 : 3, width: 22, height: 22, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
      </button>
    </div>
  );
}
