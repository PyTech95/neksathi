import { useEffect, useRef, useState } from "react";
import api, { PUBLIC_WEB } from "@/lib/api";
import { ShieldAlert, Plus, Trash2, Pencil, X, Phone, Siren, Volume2, VolumeX, Users, MapPin, Star, Loader2, CheckCircle2, Ambulance, Flame, Shield, Baby, VenetianMask, Landmark, Train, ShieldQuestion, RadioTower, Copy, Share2, Square, Building2, Navigation, Smartphone, ChevronRight, Camera, Mic, Play, Radar } from "lucide-react";
import { loadLeaflet } from "@/lib/leaflet";
import { getPosition, captureSosPhoto, startSosTracking, stopSosTracking } from "@/lib/native";
import { Link } from "react-router-dom";
import SosActions from "@/components/SosActions";
import { API } from "@/lib/api";
import { setCallAuth } from "@/lib/callsetup";
import { isNativeApp, volumeSosStatus, setVolumeSos, testVolumeSos, requestSosPermissions } from "@/lib/volumesos";
import SosDisplayCard from "@/components/SosDisplayCard";
import CrashDetectionCard from "@/components/CrashDetectionCard";
import { useT } from "@/lib/i18n";

// App-only card: opt-in "SOS by volume button". Volume-up x3 within 5s on the
// lock screen (or app closed) sends an SOS with location to the chosen family
// members. Sender's phone: a short vibration only. This card switches it on/off,
// shows what's missing, and can fire a test SOS.
function VolumeSosCard({ recipientCount, onSent }) {
  const { t } = useT();
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const refresh = async () => setSt(await volumeSosStatus());
  useEffect(() => {
    try { setCallAuth(API, localStorage.getItem("nk_token")); } catch (_) {}
    refresh();
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  if (!st || !st.supported) return null;
  const toggle = async () => { setBusy("toggle"); setSt(await setVolumeSos(!st.enabled)); setBusy(""); };
  const test = async () => {
    setBusy("test"); setMsg(t("sf.vs.testSending"));
    await testVolumeSos();
    setTimeout(async () => { await refresh(); setBusy(""); setMsg(t("sf.vs.testSent")); onSent && onSent(); }, 6000);
  };
  const alive = st.enabled && st.running;
  return (
    <div className="glass" style={{ padding: 18, borderRadius: 18, marginTop: 18, borderColor: alive ? "rgba(52,211,153,.4)" : "rgba(255,255,255,.08)" }} data-testid="volume-sos-card">
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Volume2 size={22} style={{ color: alive ? "#34d399" : undefined }} className={alive ? "" : "neon"} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{t("sf.vs.title")} {alive ? <span style={{ color: "#34d399", fontSize: 12.5, marginLeft: 6 }}>● {t("sf.vs.active")}</span> : <span className="muted" style={{ fontSize: 12.5, marginLeft: 6 }}>{t("common.off")}</span>}</div>
          <div className="muted" style={{ fontSize: 12.5 }}>{t("sf.vs.desc1")} <b>{t("sf.vs.descBold")}</b> {t("sf.vs.desc2")}</div>
        </div>
        <button className={`btn btn-sm ${st.enabled ? "btn-ghost" : "btn-primary"}`} onClick={toggle} disabled={!!busy} data-testid="volume-sos-toggle">{busy === "toggle" ? <Loader2 className="spin" size={14} /> : st.enabled ? t("sf.vs.turnOff") : t("sf.vs.turnOn")}</button>
      </div>
      {st.enabled && (
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
          <button className="btn btn-ghost btn-sm" onClick={test} disabled={!!busy || !st.auth || recipientCount === 0} data-testid="volume-sos-test">{busy === "test" ? <Loader2 className="spin" size={14} /> : <Siren size={14} />} {t("sf.vs.sendTest")}</button>
          {!st.auth && <span className="muted" style={{ fontSize: 12 }}>{t("sf.vs.signInAgain")}</span>}
          {st.auth && recipientCount === 0 && <span className="muted" style={{ fontSize: 12 }}>{t("sf.vs.pickRecipients")}</span>}
          {st.pending && <span className="muted" style={{ fontSize: 12 }}>{t("sf.vs.pending")}</span>}
          {msg && <span className="muted" style={{ fontSize: 12 }} data-testid="volume-sos-msg">{msg}</span>}
        </div>
      )}
      {st.enabled && st.camera === false && (
        <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }} data-testid="volume-sos-camera-warn">
          <span className="muted" style={{ fontSize: 12 }}>{t("sf.vs.camWarn")}</span>
          <button className="btn btn-ghost btn-sm" onClick={async () => { await requestSosPermissions(); setTimeout(refresh, 1200); }}>{t("sf.vs.grantCam")}</button>
        </div>
      )}
      {st.enabled && (
        <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
          {t("sf.vs.trayNote")}
        </div>
      )}
    </div>
  );
}

const HELPLINES = [
  { num: "112", label: "All-in-one Emergency", icon: <ShieldAlert size={18} />, tone: "#ff3b5c" },
  { num: "100", label: "Police", icon: <Shield size={18} />, tone: "#e92546" },
  { num: "101", label: "Fire Brigade", icon: <Flame size={18} />, tone: "#f5a524" },
  { num: "102", label: "Ambulance", icon: <Ambulance size={18} />, tone: "#34d399" },
  { num: "108", label: "Emergency / Disaster", icon: <Ambulance size={18} />, tone: "#34d399" },
  { num: "1091", label: "Women Helpline", icon: <VenetianMask size={18} />, tone: "#ff6b81" },
  { num: "1098", label: "Child Helpline", icon: <Baby size={18} />, tone: "#ff4d67" },
  { num: "1930", label: "Cyber Crime", icon: <ShieldQuestion size={18} />, tone: "#f472b6" },
  { num: "1073", label: "Road Accident", icon: <ShieldAlert size={18} />, tone: "#fb7185" },
  { num: "14567", label: "Senior Citizen", icon: <Landmark size={18} />, tone: "#a3e635" },
  { num: "139", label: "Railway Enquiry", icon: <Train size={18} />, tone: "#e92546" },
];

function useSiren() {
  const ctxRef = useRef(null);
  const nodesRef = useRef(null);
  const [on, setOn] = useState(false);

  const stop = () => {
    if (nodesRef.current) {
      try { nodesRef.current.osc1.stop(); nodesRef.current.osc2.stop(); } catch (_) {}
      nodesRef.current = null;
    }
    setOn(false);
  };
  const start = () => {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ctxRef.current) ctxRef.current = new AC();
    const ctx = ctxRef.current;
    ctx.resume();
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    gain.gain.exponentialRampToValueAtTime(0.6, ctx.currentTime + 0.05);
    gain.connect(ctx.destination);
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = "sawtooth"; osc2.type = "square";
    // Wailing sweep 600<->1400 Hz
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 2; lfoGain.gain.value = 400;
    lfo.connect(lfoGain); lfoGain.connect(osc1.frequency); lfoGain.connect(osc2.frequency);
    osc1.frequency.value = 1000; osc2.frequency.value = 700;
    osc1.connect(gain); osc2.connect(gain);
    osc1.start(); osc2.start(); lfo.start();
    nodesRef.current = { osc1, osc2, lfo, gain };
    setOn(true);
  };
  useEffect(() => () => stop(), []);
  return { on, toggle: () => (on ? stop() : start()) };
}

function Sos({ recipientCount, inFamily, onSent }) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [arming, setArming] = useState(false);
  const [count, setCount] = useState(3);
  const timer = useRef(null);
  const firedRef = useRef(false);
  // Which camera the auto SOS photo uses — the person's choice, remembered.
  const [cam, setCam] = useState(() => { try { return localStorage.getItem("nk_sos_cam") || "user"; } catch { return "user"; } });
  const setCamPref = (v) => { setCam(v); try { localStorage.setItem("nk_sos_cam", v); } catch { /* ignore */ } };

  const fire = async () => {
    setBusy(true); setResult(null);
    let coords = {};
    try {
      const pos = await getPosition({ timeout: 6000, enableHighAccuracy: true });
      coords = { latitude: pos.latitude, longitude: pos.longitude };
    } catch (_) { /* location optional */ }
    try {
      // Send the alert first — it must never wait on the camera.
      const r = await api.post("/me/sos", { ...coords });
      const ev = r.data;
      setResult({ ...ev });
      onSent && onSent();
      // Keep sharing live location with responders while the SOS is active.
      startSosTracking((p) => api.post("/me/location", p));
      // Auto silent front photo, fire-and-forget. Native captures + uploads it
      // itself and only when the phone is unlocked; web grabs a selfie and we
      // attach it here. Either way it never delays or blocks the SOS.
      captureSosPhoto(ev.id, cam).then((webPhoto) => {
        if (webPhoto) {
          api.post(`/me/sos-events/${ev.id}/photo`, { photo_base64: webPhoto })
            .then(() => setResult((x) => (x && x.id === ev.id ? { ...x, _photo: webPhoto } : x)))
            .catch(() => {});
        }
      }).catch(() => {});
    } catch (e) {
      setResult({ error: e?.response?.data?.detail || t("sf.sosErr") });
    } finally { setBusy(false); }
  };

  const beginArm = () => {
    if (arming) return;
    if (!inFamily) { setResult({ error: t("sf.needFamily") }); return; }
    if (recipientCount === 0) { setResult({ error: t("sf.needRecipients") }); return; }
    firedRef.current = false;
    setArming(true); setCount(3);
    let c = 3;
    timer.current = setInterval(() => {
      c -= 1;
      setCount(c);
      if (c <= 0) {
        clearInterval(timer.current);
        setArming(false);
        if (!firedRef.current) { firedRef.current = true; fire(); }
      }
    }, 1000);
  };
  const cancel = () => { clearInterval(timer.current); firedRef.current = false; setArming(false); setCount(3); };
  const [acked, setAcked] = useState(false);
  const ackSafe = async () => { try { await api.post(`/me/sos-events/${result.id}/ack`); setAcked(true); stopSosTracking(); } catch (_) {} };
  useEffect(() => () => { stopSosTracking(); }, []);

  return (
    <div className="glass" style={{ padding: 28, borderRadius: 20, textAlign: "center", position: "relative", overflow: "hidden" }} data-testid="sos-panel">
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 0%, rgba(255,59,92,.22), transparent 60%)", pointerEvents: "none" }} />
      <p className="muted" style={{ marginTop: 0, fontSize: 13, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>{t("sf.sosTitle")}</p>
      <p className="muted" style={{ marginTop: 4, fontSize: 14 }}>{t("sf.sosSub")}</p>

      {!arming ? (
        <button
          data-testid="sos-trigger-btn"
          onClick={beginArm}
          disabled={busy}
          style={{
            width: 168, height: 168, borderRadius: "50%", border: "none", cursor: "pointer", margin: "18px auto 8px",
            display: "grid", placeItems: "center", color: "#fff", fontWeight: 900, fontSize: 26, letterSpacing: 2,
            background: "radial-gradient(circle at 30% 30%, #ff5a75, #e11d48)",
            boxShadow: "0 0 0 10px rgba(255,59,92,.12), 0 20px 50px -10px rgba(255,59,92,.7)",
            animation: busy ? "none" : "sosPulse 1.8s ease-in-out infinite",
          }}>
          {busy ? <Loader2 className="spin" size={40} /> : <><ShieldAlert size={44} /><span style={{ marginTop: 6, fontSize: 22 }}>SOS</span></>}
        </button>
      ) : (
        <div style={{ margin: "18px auto 8px", width: 168, height: 168, borderRadius: "50%", display: "grid", placeItems: "center",
          background: "radial-gradient(circle at 30% 30%, #ff5a75, #e11d48)", boxShadow: "0 0 0 10px rgba(255,59,92,.18)" }}>
          <div style={{ textAlign: "center", color: "#fff" }} data-testid="sos-countdown">
            <div style={{ fontSize: 56, fontWeight: 900, lineHeight: 1 }}>{count}</div>
            <div style={{ fontSize: 12, opacity: .9 }}>{t("sf.sending")}</div>
          </div>
        </div>
      )}

      {arming ? (
        <button className="btn btn-ghost" data-testid="sos-cancel-btn" onClick={cancel} style={{ margin: "6px auto 0" }}>{t("common.cancel")}</button>
      ) : (
        <>
          <p className="muted" data-testid="sos-photo-note" style={{ fontSize: 12.5, marginTop: 10, display: "flex", alignItems: "flex-start", justifyContent: "center", gap: 6, maxWidth: 330, marginLeft: "auto", marginRight: "auto", textAlign: "left" }}>
            <Camera size={14} style={{ flexShrink: 0, marginTop: 1 }} /> <span>{t("sf.photoNote", { side: cam === "environment" ? t("sf.backLower") : t("sf.frontLower") })}</span>
          </p>
          {/* Front / back camera chooser for the auto SOS photo */}
          <div style={{ display: "inline-flex", gap: 6, marginTop: 10, background: "rgba(255,255,255,.04)", border: "1px solid var(--panel-brd)", borderRadius: 11, padding: 4 }} data-testid="sos-cam-chooser">
            {[["user", "sf.front"], ["environment", "sf.back"]].map(([v, l]) => (
              <button key={v} type="button" onClick={() => setCamPref(v)} data-testid={`sos-cam-${v}`}
                style={{ border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 700, padding: "6px 16px", borderRadius: 8,
                  background: cam === v ? "linear-gradient(135deg,#b3122f,#e92546)" : "transparent", color: cam === v ? "#fff" : "var(--muted)" }}>
                {t(l)}
              </button>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>{t("sf.countdownNote")}</p>
        </>
      )}

      {result && !result.error && (
        <div data-testid="sos-result" className="glass" style={{ marginTop: 16, padding: "12px 14px", borderRadius: 12, borderColor: "rgba(52,211,153,.4)", color: "#34d399", fontWeight: 700 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}><CheckCircle2 size={18} /> {t("sf.sosSentTo", { n: result.notified })} · {result.channels?.join(", ")}</div>
          {result._photo && <img src={result._photo} alt="evidence" data-testid="sos-result-photo" style={{ marginTop: 10, width: 120, height: 90, objectFit: "cover", borderRadius: 8 }} />}
          {/* The person in trouble can call for help themselves, too. */}
          <div style={{ marginTop: 12 }}><SosActions sos={result} compact testPrefix="sos-own" /></div>
          <div style={{ marginTop: 12, fontWeight: 500, color: "var(--text)", fontSize: 12.5 }}>
            {acked ? (
              <span style={{ color: "#34d399", display: "inline-flex", alignItems: "center", gap: 6 }} data-testid="sos-acked"><CheckCircle2 size={14} /> {t("sf.markedSafe")}</span>
            ) : (
              <>
                <p className="muted" style={{ margin: "0 0 8px" }}>{t("sf.escalateNote", { n: 3 })}</p>
                <button className="btn btn-ghost btn-sm" onClick={ackSafe} data-testid="sos-ack-btn"><CheckCircle2 size={14} /> {t("sf.imSafe")}</button>
              </>
            )}
          </div>
        </div>
      )}
      {result?.error && (
        <div data-testid="sos-error" style={{ marginTop: 16, color: "#ff7591", fontWeight: 700, fontSize: 14 }}>{result.error}</div>
      )}
    </div>
  );
}

function LiveShare() {
  const { t } = useT();
  const [shares, setShares] = useState([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const watchRef = useRef(null);
  const postTimer = useRef(null);
  const lastPos = useRef(null);

  const active = shares[0];
  const url = active ? `${PUBLIC_WEB}/live/${active.token}` : "";

  const load = async () => {
    try { setShares((await api.get("/me/live-shares")).data); } catch (_) {}
  };
  useEffect(() => { load(); }, []);

  const pushLoop = () => {
    const send = async () => {
      if (!lastPos.current) return;
      try { await api.post("/me/location", lastPos.current); } catch (_) {}
    };
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => { lastPos.current = { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy }; send(); },
      () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    postTimer.current = setInterval(send, 8000);
  };
  const stopLoop = () => {
    if (watchRef.current != null) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null; }
    if (postTimer.current) { clearInterval(postTimer.current); postTimer.current = null; }
  };
  useEffect(() => () => stopLoop(), []);
  useEffect(() => { if (active && watchRef.current == null) pushLoop(); if (!active) stopLoop(); /* eslint-disable-next-line */ }, [active]);

  const start = async () => {
    setBusy(true);
    try { await api.post("/me/live-share", { duration_min: 60 }); await load(); } finally { setBusy(false); }
  };
  const stop = async () => {
    if (!active) return;
    setBusy(true);
    try { await api.post(`/me/live-share/${active.id}/stop`); stopLoop(); await load(); } finally { setBusy(false); }
  };
  const copy = () => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const shareWa = () => window.open(`https://wa.me/?text=${encodeURIComponent(t("sf.ls.waText", { url }))}`, "_blank");

  return (
    <div className="glass" style={{ padding: 22, borderRadius: 18, marginTop: 18 }} data-testid="live-share-panel">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <RadioTower size={20} className="neon" />
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>{t("sf.ls.title")}</h2>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 12.5 }}>{t("sf.ls.sub")}</p>
        </div>
      </div>

      {!active ? (
        <button className="btn btn-primary" onClick={start} disabled={busy} data-testid="live-share-start-btn">
          {busy ? <Loader2 className="spin" size={16} /> : <><RadioTower size={16} /> {t("sf.ls.start")}</>}
        </button>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <div className="glass" style={{ padding: "12px 14px", borderRadius: 12, display: "flex", alignItems: "center", gap: 10 }} data-testid="live-share-active">
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#34d399", boxShadow: "0 0 0 4px rgba(52,211,153,.25)", flexShrink: 0 }} />
            <span style={{ fontWeight: 700 }}>{t("sf.ls.active")}</span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input className="input" readOnly value={url} data-testid="live-share-url" style={{ flex: "1 1 240px", minWidth: 0 }} />
            <button className="btn btn-ghost" onClick={copy} data-testid="live-share-copy-btn">{copied ? <><CheckCircle2 size={16} /> {t("common.copied")}</> : <><Copy size={16} /> {t("common.copy")}</>}</button>
            <button className="btn btn-ghost" onClick={shareWa} data-testid="live-share-wa-btn"><Share2 size={16} /> WhatsApp</button>
            <button className="btn btn-danger" onClick={stop} disabled={busy} data-testid="live-share-stop-btn">{busy ? <Loader2 className="spin" size={16} /> : <><Square size={15} /> {t("sf.ls.stop")}</>}</button>
          </div>
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>{t("sf.ls.note")}</p>
        </div>
      )}
    </div>
  );
}

function NearbyPolice() {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [stations, setStations] = useState(null);
  const [err, setErr] = useState("");
  const mapEl = useRef(null);
  const mapObj = useRef(null);

  const find = async () => {
    setErr(""); setBusy(true); setStations(null);
    try {
      const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000, enableHighAccuracy: true }));
      const { latitude, longitude } = pos.coords;
      const r = await api.get(`/safety/nearby-police?lat=${latitude}&lng=${longitude}&radius=8000`);
      setStations(r.data.stations);
      drawMap(latitude, longitude, r.data.stations);
    } catch (e) {
      setErr(e?.code === 1 ? t("sf.np.denied") : (e?.response?.data?.detail || t("sf.np.err")));
    } finally { setBusy(false); }
  };

  const drawMap = (lat, lng, list) => {
    loadLeaflet().then((L) => {
      if (!mapEl.current) return;
      if (mapObj.current) { mapObj.current.remove(); mapObj.current = null; }
      const map = L.map(mapEl.current, { zoomControl: true }).setView([lat, lng], 13);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(map);
      L.circleMarker([lat, lng], { radius: 8, color: "#e92546", fillColor: "#b3122f", fillOpacity: 1, weight: 3 }).addTo(map).bindPopup(t("sf.np.youHere"));
      list.forEach((s) => {
        L.marker([s.latitude, s.longitude]).addTo(map).bindPopup(`<b>${s.name}</b><br/>${t("sf.np.kmAway", { km: s.distance_km })}`);
      });
      mapObj.current = map;
    });
  };
  useEffect(() => () => { if (mapObj.current) mapObj.current.remove(); }, []);

  return (
    <div className="glass" style={{ padding: 22, borderRadius: 18, marginTop: 18 }} data-testid="police-panel">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Building2 size={20} className="neon" />
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>{t("sf.np.title")}</h2>
            <p className="muted" style={{ margin: "2px 0 0", fontSize: 12.5 }}>{t("sf.np.sub")}</p>
          </div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={find} disabled={busy} data-testid="police-find-btn">
          {busy ? <Loader2 className="spin" size={16} /> : <><Navigation size={16} /> {t("sf.np.find")}</>}
        </button>
      </div>
      {err && <div style={{ color: "#ff7591", fontSize: 13, marginBottom: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }} data-testid="police-error">{err}<button className="btn btn-ghost btn-sm" onClick={find} disabled={busy} data-testid="police-retry-btn">{t("common.retry")}</button></div>}
      {stations && (
        <>
          <div ref={mapEl} data-testid="police-map" style={{ height: 300, borderRadius: 12, overflow: "hidden", border: "1px solid var(--panel-brd)", marginBottom: 12 }} />
          {stations.length === 0 ? (
            <p className="muted" data-testid="police-empty">{t("sf.np.empty")}</p>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {stations.slice(0, 8).map((s) => (
                <div key={s.id} data-testid="police-row" className="glass" style={{ padding: "10px 14px", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</div>
                    <div className="muted" style={{ fontSize: 12.5 }}>{t("sf.np.kmAway", { km: s.distance_km })}{s.address ? ` · ${s.address}` : ""}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {s.phone && <a className="btn btn-ghost btn-sm" href={`tel:${s.phone}`}><Phone size={14} /></a>}
                    <a className="btn btn-ghost btn-sm" href={`https://maps.google.com/?q=${s.latitude},${s.longitude}`} target="_blank" rel="noreferrer"><Navigation size={14} /></a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AudioRecorder() {
  const { t } = useT();
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const recRef = useRef(null);
  const chunks = useRef([]);
  const startTs = useRef(0);
  const tick = useRef(null);
  const audioRef = useRef(null);

  const load = async () => { try { setItems((await api.get("/me/audio-evidence")).data); } catch (_) {} };
  useEffect(() => { load(); return () => { if (tick.current) clearInterval(tick.current); }; }, []);

  const start = async () => {
    setErr("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunks.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((trk) => trk.stop());
        const blob = new Blob(chunks.current, { type: "audio/webm" });
        const dur = Date.now() - startTs.current;
        const reader = new FileReader();
        reader.onloadend = async () => {
          setBusy(true);
          try { await api.post("/me/audio-evidence", { audio_base64: reader.result, duration_ms: dur, mime: "audio/webm" }); await load(); }
          catch (e) { setErr(e?.response?.data?.detail || t("sf.au.saveErr")); }
          finally { setBusy(false); }
        };
        reader.readAsDataURL(blob);
      };
      mr.start(); recRef.current = mr; startTs.current = Date.now(); setElapsed(0); setRecording(true);
      tick.current = setInterval(() => setElapsed(Math.floor((Date.now() - startTs.current) / 1000)), 500);
    } catch (_) { setErr(t("sf.au.micDenied")); }
  };
  const stop = () => { if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop(); if (tick.current) clearInterval(tick.current); setRecording(false); };
  const playRec = async (id) => {
    const r = await api.get(`/me/audio-evidence/${id}/play`);
    if (audioRef.current) { audioRef.current.src = r.data.audio_base64; audioRef.current.play(); }
  };
  const remove = async (id) => { if (!window.confirm(t("sf.au.delConfirm"))) return; await api.delete(`/me/audio-evidence/${id}`); load(); };

  return (
    <div className="glass" style={{ padding: 22, borderRadius: 18, marginTop: 18 }} data-testid="audio-panel">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <Mic size={20} className="neon" />
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>{t("sf.au.title")}</h2>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 12.5 }}>{t("sf.au.sub")}</p>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {!recording ? (
          <button className="btn btn-primary" onClick={start} disabled={busy} data-testid="audio-start-btn">{busy ? <Loader2 className="spin" size={16} /> : <><Mic size={16} /> {t("sf.au.start")}</>}</button>
        ) : (
          <button className="btn btn-danger" onClick={stop} data-testid="audio-stop-btn"><Square size={15} /> {t("sf.au.stop", { n: elapsed })}</button>
        )}
        {recording && <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#ff3b5c", fontWeight: 700 }}><span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff3b5c", animation: "sosPulse 1s infinite" }} /> {t("sf.au.recording")}</span>}
      </div>
      {err && <div style={{ color: "#ff7591", fontSize: 13, marginTop: 10 }} data-testid="audio-error">{err}</div>}
      <audio ref={audioRef} style={{ display: "none" }} />
      {items.length > 0 && (
        <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
          {items.map((a) => (
            <div key={a.id} data-testid={`audio-row-${a.id}`} className="glass" style={{ padding: "10px 14px", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontSize: 13.5 }}>{t("sf.au.recordingLabel")} · {a.duration_ms ? `${Math.round(a.duration_ms / 1000)}s` : "—"} · {new Date(a.created_at).toLocaleString()}</span>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => playRec(a.id)} data-testid={`audio-play-${a.id}`}><Play size={14} /></button>
                <button className="btn btn-ghost btn-sm" onClick={() => remove(a.id)} data-testid={`audio-delete-${a.id}`}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Who in the family circle gets this user's SOS. SOS is sent ONLY to the ticked
// members; if none are ticked, the SOS button won't fire. Lives on the Safety
// page so the panic button and its recipients sit together.
function SosRecipients({ data, onChange }) {
  const { t } = useT();
  const [sel, setSel] = useState(() => new Set((data.items || []).filter((m) => m.selected).map((m) => m.user_id)));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setSel(new Set((data.items || []).filter((m) => m.selected).map((m) => m.user_id))); }, [data]);
  if (!data.in_family) {
    return (
      <div className="glass" style={{ padding: 18, borderRadius: 18, marginTop: 18, border: "1px solid rgba(245,165,36,.4)" }} data-testid="sos-recipients-panel">
        <h2 style={{ margin: "0 0 6px", fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}><ShieldAlert size={17} style={{ color: "#f5a524" }} /> {t("sf.sr.title")}</h2>
        <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>{t("sf.sr.needFamily1")} <b>{t("sf.sr.familyCircle")}</b> {t("sf.sr.needFamily2")}</p>
      </div>
    );
  }
  const toggle = (id) => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n); setSaved(false); };
  const save = async () => {
    setBusy(true);
    try { await api.put("/me/sos-recipients", { user_ids: [...sel] }); setSaved(true); onChange && onChange(); }
    finally { setBusy(false); }
  };
  return (
    <div className="glass" style={{ padding: 18, borderRadius: 18, marginTop: 18, border: sel.size ? "1px solid rgba(52,211,153,.35)" : "1px solid rgba(255,59,92,.45)" }} data-testid="sos-recipients-panel">
      <h2 style={{ margin: "0 0 4px", fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}><ShieldAlert size={17} style={{ color: "#ff3b5c" }} /> {t("sf.sr.title")}</h2>
      <p className="muted" style={{ margin: "0 0 12px", fontSize: 13 }}>{t("sf.sr.tick")} {sel.size === 0 && <b style={{ color: "#ff7591" }}>{t("sf.sr.pickOne")}</b>}</p>
      <div style={{ display: "grid", gap: 8 }}>
        {(data.items || []).map((m) => (
          <label key={m.user_id} data-testid={`sos-rec-${m.user_id}`} onClick={() => toggle(m.user_id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, cursor: "pointer", background: sel.has(m.user_id) ? "rgba(52,211,153,.1)" : "rgba(255,255,255,.04)", border: `1px solid ${sel.has(m.user_id) ? "rgba(52,211,153,.4)" : "var(--panel-brd)"}` }}>
            <span style={{ width: 22, height: 22, borderRadius: 6, display: "grid", placeItems: "center", background: sel.has(m.user_id) ? "linear-gradient(100deg,#059669,#34d399)" : "transparent", border: sel.has(m.user_id) ? "none" : "1px solid var(--panel-brd)" }}>{sel.has(m.user_id) && <CheckCircle2 size={14} color="#fff" />}</span>
            <span style={{ flex: 1, fontWeight: 600 }}>{m.name}{m.is_guardian ? " 👑" : ""}</span>
            <span className="muted" style={{ fontSize: 12 }}>{m.relation || t("sf.sr.family")}</span>
          </label>
        ))}
      </div>
      <button className="btn btn-primary btn-sm" onClick={save} disabled={busy} data-testid="sos-rec-save" style={{ marginTop: 12 }}>
        {busy ? <Loader2 className="spin" size={14} /> : <CheckCircle2 size={14} />} {saved ? t("common.saved") : t("sf.sr.save")}
      </button>
    </div>
  );
}

export default function Safety() {
  const { t } = useT();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "", relation: "", is_primary: false });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState([]);
  const [sosRec, setSosRec] = useState({ in_family: false, items: [] });
  const siren = useSiren();

  const load = async () => {
    setLoading(true);
    try {
      const [c, h, sr] = await Promise.all([
        api.get("/me/emergency-contacts"),
        api.get("/me/sos-events"),
        api.get("/me/sos-recipients").catch(() => ({ data: { in_family: false, items: [] } })),
      ]);
      setContacts(c.data); setHistory(h.data); setSosRec(sr.data || { in_family: false, items: [] });
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const recipientCount = (sosRec.items || []).filter((m) => m.selected).length;

  const openAdd = () => { setEditing(null); setForm({ name: "", phone: "", relation: "", is_primary: false }); setErr(""); setShow(true); };
  const openEdit = (c) => { setEditing(c.id); setForm({ name: c.name, phone: c.phone, relation: c.relation || "", is_primary: c.is_primary }); setErr(""); setShow(true); };

  const save = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      if (editing) await api.put(`/me/emergency-contacts/${editing}`, form);
      else await api.post("/me/emergency-contacts", form);
      setShow(false); load();
    } catch (e) { setErr(e?.response?.data?.detail || t("sf.contactSaveErr")); } finally { setBusy(false); }
  };
  const remove = async (id) => {
    if (!window.confirm(t("sf.removeContactConfirm"))) return;
    await api.delete(`/me/emergency-contacts/${id}`); load();
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="page" data-testid="safety-page" style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 20px 80px" }}>
      <style>{`@keyframes sosPulse{0%,100%{box-shadow:0 0 0 10px rgba(255,59,92,.12),0 20px 50px -10px rgba(255,59,92,.7)}50%{box-shadow:0 0 0 22px rgba(255,59,92,0),0 20px 50px -10px rgba(255,59,92,.7)}}.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <div style={{ marginBottom: 22 }}>
        <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800 }}>{t("sf.center")}</h1>
        <p className="muted" style={{ marginTop: 6 }}>{t("sf.centerSub")}</p>
      </div>

      <Link to="/helplines" data-testid="safety-helplines-link" className="glass glass-hover" style={{ display: "flex", alignItems: "center", gap: 13, padding: "14px 16px", borderRadius: 16, marginBottom: 18, textDecoration: "none", color: "var(--text)", border: "1px solid var(--panel-brd)" }}>
        <span style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, display: "grid", placeItems: "center", background: "rgba(255,59,92,.14)", color: "#ff3b5c", border: "1px solid rgba(255,59,92,.4)" }}><Phone size={20} /></span>
        <span style={{ flex: 1 }}><b style={{ fontSize: 15.5 }}>{t("sf.helplinesCard")}</b><div className="muted" style={{ fontSize: 13 }}>{t("sf.helplinesCardSub")}</div></span>
        <ChevronRight size={18} className="muted" />
      </Link>

      {isNativeApp() && <VolumeSosCard recipientCount={recipientCount} onSent={load} />}
      {isNativeApp() && <SosDisplayCard />}

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 18, alignItems: "start", marginTop: isNativeApp() ? 18 : 0 }} className="safety-grid">
        <Sos recipientCount={recipientCount} inFamily={sosRec.in_family} onSent={load} />

        {/* Siren */}
        <div className="glass" style={{ padding: 24, borderRadius: 20, textAlign: "center" }} data-testid="siren-panel">
          <p className="muted" style={{ marginTop: 0, fontSize: 13, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>{t("sf.sirenTitle")}</p>
          <p className="muted" style={{ marginTop: 4, fontSize: 14 }}>{t("sf.sirenSub")}</p>
          <button
            data-testid="siren-toggle-btn"
            onClick={siren.toggle}
            style={{
              width: 130, height: 130, borderRadius: "50%", border: "none", cursor: "pointer", margin: "18px auto 10px",
              display: "grid", placeItems: "center", color: "#fff",
              background: siren.on ? "radial-gradient(circle at 30% 30%,#f5a524,#e0770a)" : "radial-gradient(circle at 30% 30%,#b3122f,#8c0f24)",
              boxShadow: siren.on ? "0 0 0 10px rgba(245,165,36,.2)" : "0 14px 40px -10px rgba(233,37,70,.6)",
              animation: siren.on ? "sosPulse 0.7s ease-in-out infinite" : "none",
            }}>
            <Siren size={46} />
          </button>
          <div>
            <button className={`btn ${siren.on ? "btn-danger" : "btn-ghost"}`} onClick={siren.toggle} data-testid="siren-label-btn">
              {siren.on ? <><VolumeX size={16} /> {t("sf.stopSiren")}</> : <><Volume2 size={16} /> {t("sf.startSiren")}</>}
            </button>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 18 }}><CrashDetectionCard /></div>

      {/* SOS recipients — who in the family circle receives this user's SOS */}
      <SosRecipients data={sosRec} onChange={load} />

      {/* Emergency contacts */}
      <div className="glass" style={{ padding: 22, borderRadius: 18, marginTop: 18 }} data-testid="contacts-panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Users size={20} className="neon" />
            <div>
              <h2 style={{ margin: 0, fontSize: 18 }}>{t("sf.contactsTitle")}</h2>
              <p className="muted" style={{ margin: "2px 0 0", fontSize: 12.5 }}>{t("sf.contactsSub")}</p>
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={openAdd} data-testid="add-contact-btn"><Plus size={16} /> {t("sf.addContact")}</button>
        </div>

        {loading ? (
          <div className="spinner" data-testid="contacts-loading" />
        ) : contacts.length === 0 ? (
          <p className="muted" data-testid="contacts-empty" style={{ textAlign: "center", padding: "18px 0" }}>{t("sf.contactsEmpty")}</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {contacts.map((c) => (
              <div key={c.id} data-testid={`contact-row-${c.id}`} className="glass" style={{ padding: "12px 14px", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                  <span style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0, background: "linear-gradient(135deg,#b3122f,#e92546)", display: "grid", placeItems: "center", fontWeight: 800, color: "#fff" }}>{c.name?.[0]?.toUpperCase() || "?"}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                      {c.name}
                      {c.is_primary && <span title="Primary" style={{ color: "#f5a524", display: "inline-flex" }}><Star size={14} fill="#f5a524" /></span>}
                    </div>
                    <div className="muted" style={{ fontSize: 13 }}>{c.phone}{c.relation ? ` · ${c.relation}` : ""}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <a className="btn btn-ghost btn-sm" href={`tel:${c.phone}`} data-testid={`contact-call-${c.id}`}><Phone size={14} /></a>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(c)} data-testid={`contact-edit-${c.id}`}><Pencil size={14} /></button>
                  <button className="btn btn-ghost btn-sm" onClick={() => remove(c.id)} data-testid={`contact-delete-${c.id}`}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Live location sharing */}
      <LiveShare />

      {/* Nearby police */}
      <NearbyPolice />

      {/* Surround audio recording */}
      <AudioRecorder />

      {/* Safe zones / geo-fencing link */}
      <Link to="/safe-zones" data-testid="safe-zones-card" className="glass glass-hover" style={{ display: "flex", alignItems: "center", gap: 14, padding: 20, borderRadius: 18, marginTop: 18, textDecoration: "none", color: "var(--text)" }}>
        <span style={{ width: 46, height: 46, borderRadius: 12, display: "grid", placeItems: "center", background: "rgba(233,37,70,.14)", color: "#e92546", flexShrink: 0 }}><Radar size={22} /></span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{t("sf.geoTitle")}</div>
          <div className="muted" style={{ fontSize: 13 }}>{t("sf.geoSub")}</div>
        </div>
        <ChevronRight size={20} className="muted" />
      </Link>

      {/* Stolen phone / FIR guide link */}
      <Link to="/stolen-phone" data-testid="stolen-phone-card" className="glass glass-hover" style={{ display: "flex", alignItems: "center", gap: 14, padding: 20, borderRadius: 18, marginTop: 18, textDecoration: "none", color: "var(--text)" }}>
        <span style={{ width: 46, height: 46, borderRadius: 12, display: "grid", placeItems: "center", background: "rgba(179,18,47,.15)", color: "#ff6b81", flexShrink: 0 }}><Smartphone size={22} /></span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{t("sf.stolenTitle")}</div>
          <div className="muted" style={{ fontSize: 13 }}>{t("sf.stolenSub")}</div>
        </div>
        <ChevronRight size={20} className="muted" />
      </Link>

      {/* Helplines */}
      <div className="glass" style={{ padding: 22, borderRadius: 18, marginTop: 18 }} data-testid="helplines-panel">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <Phone size={20} className="neon" />
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>{t("sf.helplinesTitle")}</h2>
            <p className="muted" style={{ margin: "2px 0 0", fontSize: 12.5 }}>{t("sf.helplinesSub")}</p>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))", gap: 10 }}>
          {HELPLINES.map((h) => (
            <a key={h.num} href={`tel:${h.num}`} data-testid={`helpline-${h.num}`} className="glass glass-hover"
              style={{ padding: "12px 14px", borderRadius: 12, display: "flex", alignItems: "center", gap: 12, textDecoration: "none", color: "var(--text)" }}>
              <span style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, display: "grid", placeItems: "center", color: h.tone, background: "rgba(255,255,255,.05)" }}>{h.icon}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 18 }}>{h.num}</div>
                <div className="muted" style={{ fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t("sf.hl." + h.num)}</div>
              </div>
            </a>
          ))}
        </div>
      </div>

      {/* SOS history */}
      {history.length > 0 && (
        <div className="glass" style={{ padding: 22, borderRadius: 18, marginTop: 18 }} data-testid="sos-history-panel">
          <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>{t("sf.historyTitle")}</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {history.map((e) => (
              <div key={e.id} data-testid={`sos-event-${e.id}`} className="glass" style={{ padding: "10px 14px", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                {!e.acknowledged && <div style={{ width: "100%" }}><SosActions sos={e} compact testPrefix={`sos-event-${e.id}`} /></div>}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <ShieldAlert size={16} style={{ color: "#ff3b5c" }} />
                  <span style={{ fontSize: 13.5 }}>{e.source && e.source !== "app" ? t("sf.quickSos") : t("sf.sosLabel")} · {t("sf.alerted", { n: e.notified })}{(e.channels || []).length ? ` · ${e.channels.join(", ")}` : ""}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  {e.latitude != null && (
                    <a href={`https://maps.google.com/?q=${e.latitude},${e.longitude}`} target="_blank" rel="noreferrer" className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12.5 }}><MapPin size={13} /> {t("sf.map")}</a>
                  )}
                  <span className="muted" style={{ fontSize: 12 }}>{new Date(e.created_at).toLocaleString()}</span>
                  {/* An SOS stays active for the family until it is acknowledged —
                      let the member mark it safe from here too, not only from the
                      box shown right after sending. */}
                  {e.acknowledged
                    ? <span style={{ fontSize: 12, color: "#34d399", display: "inline-flex", alignItems: "center", gap: 4 }} data-testid={`sos-event-acked-${e.id}`}><CheckCircle2 size={13} /> {t("sf.safe")}</span>
                    : <button className="btn btn-primary btn-sm" data-testid={`sos-event-ack-${e.id}`}
                        onClick={async () => { try { await api.post(`/me/sos-events/${e.id}/ack`); } catch (_) {} load(); }}>
                        <CheckCircle2 size={14} /> {t("sf.imSafeShort")}
                      </button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add / edit modal */}
      {show && (
        <div className="modal-overlay" data-testid="contact-modal" onClick={() => setShow(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(3,3,10,.7)", backdropFilter: "blur(6px)", display: "grid", placeItems: "center", zIndex: 100, padding: 16 }}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={save} className="glass" style={{ width: "100%", maxWidth: 440, padding: 24, borderRadius: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ margin: 0 }}>{editing ? t("sf.editContact") : t("sf.addContactTitle")}</h3>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShow(false)} data-testid="contact-modal-close"><X size={16} /></button>
            </div>
            {err && <div style={{ color: "#ff7591", fontSize: 13, marginBottom: 10 }} data-testid="contact-error">{err}</div>}
            <div className="field" style={{ marginBottom: 12 }}>
              <label>{t("common.name")}</label>
              <input className="input" value={form.name} onChange={set("name")} required data-testid="contact-name-input" placeholder={t("sf.namePh")} />
            </div>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>{t("sf.phoneNum")}</label>
              <input className="input" value={form.phone} onChange={set("phone")} required data-testid="contact-phone-input" placeholder={t("sf.phonePh")} />
            </div>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>{t("sf.relation")}</label>
              <input className="input" value={form.relation} onChange={set("relation")} data-testid="contact-relation-input" placeholder={t("sf.relationPh")} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 18 }} data-testid="contact-primary-toggle" onClick={() => setForm({ ...form, is_primary: !form.is_primary })}>
              <span style={{ width: 20, height: 20, borderRadius: 6, border: "1px solid var(--panel-brd)", background: form.is_primary ? "linear-gradient(100deg,#b3122f,#e92546)" : "transparent", display: "grid", placeItems: "center" }}>{form.is_primary && <CheckCircle2 size={14} color="#fff" />}</span>
              <span style={{ fontSize: 13.5 }}>{t("sf.markPrimary")}</span>
            </label>
            <button className="btn btn-primary btn-block" disabled={busy} type="submit" data-testid="contact-save-btn">
              {busy ? <Loader2 className="spin" size={16} /> : (editing ? t("common.save") : t("sf.addContact"))}
            </button>
          </form>
        </div>
      )}
      <style>{`@media(max-width:820px){.safety-grid{grid-template-columns:1fr!important}}`}</style>
    </div>
  );
}
