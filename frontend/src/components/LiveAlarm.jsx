import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { X, Volume2, VolumeX, Siren, ParkingCircle, Ban, Lightbulb, DoorOpen, AlertTriangle, MessageSquare, ShieldAlert } from "lucide-react";
import api from "@/lib/api";

const META = {
  wrong_parking: { icon: <ParkingCircle size={18} />, label: "Wrong parking" },
  vehicle_blocking: { icon: <Ban size={18} />, label: "Vehicle blocking" },
  headlight_on: { icon: <Lightbulb size={18} />, label: "Headlight ON" },
  door_open: { icon: <DoorOpen size={18} />, label: "Door / window open" },
  emergency: { icon: <Siren size={18} />, label: "Emergency" },
  vehicle_damage: { icon: <AlertTriangle size={18} />, label: "Vehicle damage" },
  other: { icon: <MessageSquare size={18} />, label: "Other" },
  accident: { icon: <Siren size={18} />, label: "Accident" },
  theft: { icon: <ShieldAlert size={18} />, label: "Theft / suspicious" },
};

// Web Audio alarm — no asset needed. Three rising beeps.
function playAlarm(ctxRef) {
  try {
    if (!ctxRef.current) ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") ctx.resume();
    const now = ctx.currentTime;
    [0, 0.28, 0.56].forEach((t, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(660 + i * 220, now + t);
      gain.gain.setValueAtTime(0.0001, now + t);
      gain.gain.exponentialRampToValueAtTime(0.25, now + t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + t);
      osc.stop(now + t + 0.24);
    });
  } catch { /* audio blocked — banner still shows */ }
}

// Real-time incident alarm. Polls for new live incidents and, when one arrives,
// shows a top banner and plays an alert sound. The persistent header bell was
// removed (the notification bell is the single bell in the top bar); this keeps
// only the live pop-up alarm + its mute control.
export default function LiveAlarm() {
  const nav = useNavigate();
  const [active, setActive] = useState([]);
  const [banner, setBanner] = useState(null);
  const [muted, setMuted] = useState(() => localStorage.getItem("nk_alarm_muted") === "1");
  const seen = useRef(null);          // Set of known incident ids (null = not baseline'd yet)
  const audioCtx = useRef(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  const poll = useCallback(async () => {
    try {
      const { data } = await api.get("/incidents/live");
      const results = data.results || [];
      setActive(results);
      if (seen.current === null) {
        // First load — baseline existing incidents so we only alarm on NEW ones.
        seen.current = new Set(results.map((r) => r.id));
        return;
      }
      const fresh = results.filter((r) => !seen.current.has(r.id));
      if (fresh.length) {
        fresh.forEach((r) => seen.current.add(r.id));
        setBanner(fresh[0]);
        if (!mutedRef.current) playAlarm(audioCtx);
      }
    } catch { /* not logged in / transient */ }
  }, []);

  useEffect(() => {
    poll();
    const id = setInterval(poll, 10000);
    // Unlock audio on the first user gesture (browser autoplay policy).
    const unlock = () => { try { if (!audioCtx.current) audioCtx.current = new (window.AudioContext || window.webkitAudioContext)(); audioCtx.current.resume(); } catch { /* noop */ } };
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => { clearInterval(id); window.removeEventListener("pointerdown", unlock); };
  }, [poll]);

  const toggleMute = () => { const m = !muted; setMuted(m); localStorage.setItem("nk_alarm_muted", m ? "1" : "0"); };
  const bm = banner ? (META[banner.type] || META.other) : null;
  // `active` is kept polled for future use; referenced here to avoid an unused warning.
  void active;

  if (!banner) return null;
  return (
    <div className="alarm-banner" data-testid="alarm-banner" role="alert">
      <span className="alarm-banner-icon">{bm.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>{bm.label} — {banner.number_plate}</div>
        <div style={{ fontSize: 12, opacity: 0.9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {banner.scanner_note || "Someone scanned your vehicle QR and raised an alert."}
        </div>
      </div>
      <button className="alarm-view-btn" data-testid="alarm-view-btn" onClick={() => { nav("/incidents"); setBanner(null); }}>View</button>
      <button className="alarm-mute-btn" data-testid="alarm-mute-btn" onClick={toggleMute} title={muted ? "Unmute alarm sound" : "Mute alarm sound"}>
        {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </button>
      <button className="alarm-close-btn" data-testid="alarm-dismiss-btn" onClick={() => setBanner(null)}><X size={16} /></button>
    </div>
  );
}
