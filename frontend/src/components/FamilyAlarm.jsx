import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ShieldAlert, BellRing, VolumeX, Bell, MapPin, CheckCircle2 } from "lucide-react";
import api from "@/lib/api";

function useAlarm() {
  const ctxRef = useRef(null);
  const nodesRef = useRef(null);
  const [on, setOn] = useState(false);
  const stop = () => {
    if (nodesRef.current) { try { nodesRef.current.osc1.stop(); nodesRef.current.osc2.stop(); nodesRef.current.lfo.stop(); } catch (_) {} nodesRef.current = null; }
    setOn(false);
  };
  const start = () => {
    if (nodesRef.current) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ctxRef.current) ctxRef.current = new AC();
    const ctx = ctxRef.current; ctx.resume();
    const gain = ctx.createGain(); gain.gain.value = 0.0001;
    gain.gain.exponentialRampToValueAtTime(0.6, ctx.currentTime + 0.05); gain.connect(ctx.destination);
    const osc1 = ctx.createOscillator(); const osc2 = ctx.createOscillator();
    osc1.type = "sawtooth"; osc2.type = "square";
    const lfo = ctx.createOscillator(); const lfoGain = ctx.createGain();
    lfo.frequency.value = 2; lfoGain.gain.value = 400;
    lfo.connect(lfoGain); lfoGain.connect(osc1.frequency); lfoGain.connect(osc2.frequency);
    osc1.frequency.value = 1000; osc2.frequency.value = 700;
    osc1.connect(gain); osc2.connect(gain);
    osc1.start(); osc2.start(); lfo.start();
    nodesRef.current = { osc1, osc2, lfo, gain };
    setOn(true);
  };
  useEffect(() => () => stop(), []);
  return { on, start, stop };
}

export default function FamilyAlarm() {
  const [sos, setSos] = useState([]);
  const [nudge, setNudge] = useState({ active: false });
  const [muted, setMuted] = useState(() => localStorage.getItem("sosMuted") === "1");
  const alarm = useAlarm();
  const seen = useRef(null);
  const nudgeRef = useRef(false);
  const nav = useNavigate();
  const onFamily = useLocation().pathname === "/family";

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const items = (await api.get("/family/active-sos")).data.items || [];
        if (cancelled) return;
        setSos(items);
        const ids = new Set(items.map((s) => s.id));
        if (seen.current === null) seen.current = ids;
        else {
          const isNew = [...ids].some((id) => !seen.current.has(id));
          seen.current = ids;
          if (isNew && items.length && !muted) alarm.start();
          if (!items.length && !nudgeRef.current) alarm.stop();
        }
      } catch (_) {}
      try {
        const n = (await api.get("/family/nudge-state")).data;
        if (cancelled) return;
        setNudge(n);
        if (n.active && !nudgeRef.current) alarm.start();
        if (!n.active && nudgeRef.current && !sos.length) alarm.stop();
        nudgeRef.current = n.active;
      } catch (_) {}
    };
    tick();
    const t = setInterval(tick, 15000);
    return () => { cancelled = true; clearInterval(t); };
  }, [muted]);

  const toggleMute = () => { const v = !muted; setMuted(v); localStorage.setItem("sosMuted", v ? "1" : "0"); if (v) alarm.stop(); };
  const dismissNudge = async () => { alarm.stop(); nudgeRef.current = false; setNudge({ active: false }); try { await api.post("/family/nudge/clear"); } catch (_) {} };

  const showSos = sos.length > 0 && !onFamily;
  if (!showSos && !nudge.active) return null;

  return (
    <div data-testid="global-family-alarm" style={{ position: "fixed", top: 74, left: "50%", transform: "translateX(-50%)", zIndex: 4000, width: "min(560px, 92vw)", display: "grid", gap: 10 }}>
      {showSos && sos.map((s) => (
        <div key={s.id} data-testid={`global-sos-${s.id}`} className="glass" style={{ padding: "12px 16px", borderRadius: 14, border: "1px solid rgba(255,59,92,.7)", background: "rgba(35,10,16,.96)", boxShadow: "0 12px 40px rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <ShieldAlert size={22} style={{ color: "#ff3b5c", animation: "sosPulse .7s infinite" }} />
            <div><div style={{ fontWeight: 800, color: "#ff3b5c", fontSize: 14 }}>🆘 {s.member_name} raised an SOS</div><div style={{ fontSize: 12, opacity: .8 }}>{new Date(s.created_at).toLocaleTimeString()}{s.escalated ? " · escalated" : ""}</div></div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn btn-danger btn-sm" onClick={() => nav("/family")} data-testid={`global-sos-view-${s.id}`}><MapPin size={14} /> View</button>
            {alarm.on && <button className="btn btn-ghost btn-sm" onClick={alarm.stop} data-testid="global-sos-silence"><VolumeX size={14} /> Silence</button>}
            <button className="btn btn-ghost btn-sm" onClick={toggleMute} data-testid="global-sos-mute">{muted ? <Bell size={14} /> : <VolumeX size={14} />}</button>
          </div>
        </div>
      ))}
      {nudge.active && (
        <div data-testid="global-nudge" className="glass" style={{ padding: "12px 16px", borderRadius: 14, border: "1px solid rgba(34,211,238,.7)", background: "rgba(8,24,30,.96)", boxShadow: "0 12px 40px rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <BellRing size={22} className="neon" style={{ animation: "sosPulse .7s infinite" }} />
            <div style={{ fontWeight: 700, fontSize: 14 }}>{nudge.guardian_name || "Your guardian"} is trying to reach you!</div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={dismissNudge} data-testid="global-nudge-dismiss"><CheckCircle2 size={14} /> I'm here</button>
        </div>
      )}
    </div>
  );
}
