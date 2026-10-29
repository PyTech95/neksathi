import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ShieldAlert, BellRing, VolumeX, Bell, CheckCircle2, X } from "lucide-react";
import api from "@/lib/api";
import SosActions from "@/components/SosActions";

// SOS ids this phone dismissed with ✕: popup + siren hidden here only; the SOS
// stays active for everyone else until someone marks it resolved.
const DISMISS_KEY = "nk_sos_dismissed";
function loadDismissed() { try { return new Set(JSON.parse(localStorage.getItem(DISMISS_KEY) || "[]")); } catch (_) { return new Set(); } }
function saveDismissed(set) { try { localStorage.setItem(DISMISS_KEY, JSON.stringify([...set].slice(-50))); } catch (_) {} }

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
  const [dismissed, setDismissed] = useState(loadDismissed);
  const alarm = useAlarm();
  const seen = useRef(null);
  const nudgeRef = useRef(false);
  const nav = useNavigate();
  const _path = useLocation().pathname;
  const onFamily = _path === "/family" || _path === "/safety";

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        // The sender's own SOS never rings or pops up on their phone (is_me);
        // SOS dismissed with ✕ on this phone stay hidden here.
        const items = ((await api.get("/family/active-sos")).data.items || []).filter((s) => !s.is_me && !dismissed.has(s.id));
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
    const t = setInterval(tick, 8000);
    return () => { cancelled = true; clearInterval(t); };
  }, [muted, dismissed]);

  // Mute = no sound for any SOS until unmuted. Unmuting while an SOS is active
  // starts the siren again right away.
  const toggleMute = () => {
    const v = !muted; setMuted(v); localStorage.setItem("sosMuted", v ? "1" : "0");
    if (v) alarm.stop(); else if (sos.length) alarm.start();
  };
  // Guardian (or the member) marks an SOS handled → it clears for everyone.
  const resolveSos = async (id) => {
    try { await api.post(`/family/sos/${id}/resolve`); } catch (_) {}
    setSos((cur) => { const next = cur.filter((s) => s.id !== id); if (!next.length) alarm.stop(); return next; });
  };
  // ✕ on the popup: hide it (and stop the siren) on THIS phone only.
  const dismissSos = (id) => {
    const next = new Set(dismissed); next.add(id); saveDismissed(next); setDismissed(next);
    setSos((cur) => { const rest = cur.filter((s) => s.id !== id); if (!rest.length) alarm.stop(); return rest; });
  };
  const dismissNudge = async () => { alarm.stop(); nudgeRef.current = false; setNudge({ active: false }); try { await api.post("/family/nudge/clear"); } catch (_) {} };

  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth <= 640);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 640);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const showSos = sos.length > 0 && !onFamily;
  if (!showSos && !nudge.active) return null;
  const visibleSos = showSos ? sos.slice(0, isMobile ? 1 : 3) : [];
  const extraSos = showSos ? sos.length - visibleSos.length : 0;

  return (
    <div data-testid="global-family-alarm" style={{ position: "fixed", top: 74, left: "50%", transform: "translateX(-50%)", zIndex: 4000, width: "min(560px, 92vw)", display: "grid", gap: 10, pointerEvents: "none" }}>
      {visibleSos.map((s) => (
        <div key={s.id} data-testid={`global-sos-${s.id}`} className="glass" style={{ pointerEvents: "auto", padding: "14px 16px", borderRadius: 16, border: "1px solid rgba(255,59,92,.7)", background: "rgba(35,10,16,.97)", boxShadow: "0 12px 40px rgba(0,0,0,.55)", display: "grid", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <ShieldAlert size={24} style={{ color: "#ff3b5c", animation: "alarmRing .9s infinite", flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, color: "#ff3b5c", fontSize: 15 }}>🆘 {s.member_name} raised an SOS{s.source && s.source !== "app" ? " (quick SOS)" : ""}</div>
              <div style={{ fontSize: 12.5, opacity: .85 }}>{new Date(s.created_at).toLocaleTimeString()}{s.escalated ? " · escalated" : ""}{s.message ? ` · "${s.message}"` : ""}</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => dismissSos(s.id)} data-testid={`global-sos-dismiss-${s.id}`} title="Hide on this phone (SOS stays active for the family)" aria-label="Dismiss" style={{ padding: "4px 8px" }}><X size={16} /></button>
          </div>
          <SosActions sos={s} testPrefix={`global-sos-${s.id}`} />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {alarm.on
              ? <button className="btn btn-ghost btn-sm" onClick={alarm.stop} data-testid="global-sos-silence"><VolumeX size={14} /> Silence</button>
              : !muted && <button className="btn btn-ghost btn-sm" onClick={alarm.start} data-testid="global-sos-ring"><Bell size={14} /> Ring again</button>}
            <button className="btn btn-ghost btn-sm" onClick={toggleMute} data-testid="global-sos-mute" title={muted ? "Alerts are muted — tap to unmute" : "Mute all SOS sounds"}>
              {muted ? <><Bell size={14} /> Unmute</> : <><VolumeX size={14} /> Mute</>}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => nav("/family")} data-testid={`global-sos-view-${s.id}`}>Family page</button>
            {s.can_resolve !== false && (
              <button className="btn btn-primary btn-sm" onClick={() => resolveSos(s.id)} data-testid={`global-sos-resolve-${s.id}`}><CheckCircle2 size={14} /> Mark resolved</button>
            )}
          </div>
        </div>
      ))}
      {extraSos > 0 && (
        <button data-testid="global-sos-more" onClick={() => nav("/family")} className="glass" style={{ pointerEvents: "auto", cursor: "pointer", padding: "8px 16px", borderRadius: 999, border: "1px solid rgba(255,59,92,.5)", background: "rgba(35,10,16,.9)", color: "#ff8aa0", fontWeight: 700, fontSize: 13, justifySelf: "center" }}>
          +{extraSos} more SOS alert{extraSos > 1 ? "s" : ""} · view all
        </button>
      )}
      {nudge.active && (
        <div data-testid="global-nudge" className="glass" style={{ pointerEvents: "auto", padding: "12px 16px", borderRadius: 14, border: "1px solid rgba(233,37,70,.7)", background: "rgba(8,24,30,.96)", boxShadow: "0 12px 40px rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <BellRing size={22} className="neon" style={{ animation: "alarmRing .9s infinite" }} />
            <div style={{ fontWeight: 700, fontSize: 14 }}>{nudge.guardian_name || "Your guardian"} is trying to reach you!</div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={dismissNudge} data-testid="global-nudge-dismiss"><CheckCircle2 size={14} /> I'm here</button>
        </div>
      )}
    </div>
  );
}
