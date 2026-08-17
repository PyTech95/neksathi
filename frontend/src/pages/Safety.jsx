import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { ShieldAlert, Plus, Trash2, Pencil, X, Phone, Siren, Volume2, VolumeX, Users, MapPin, Star, Loader2, CheckCircle2, Ambulance, Flame, Shield, Baby, VenetianMask, Landmark, Train, ShieldQuestion, RadioTower, Copy, Share2, Square, Link2, ShieldCheck, ShieldX, Search, Building2, Navigation } from "lucide-react";
import { loadLeaflet } from "@/lib/leaflet";

const HELPLINES = [
  { num: "112", label: "All-in-one Emergency", icon: <ShieldAlert size={18} />, tone: "#ff3b5c" },
  { num: "100", label: "Police", icon: <Shield size={18} />, tone: "#22d3ee" },
  { num: "101", label: "Fire Brigade", icon: <Flame size={18} />, tone: "#f5a524" },
  { num: "102", label: "Ambulance", icon: <Ambulance size={18} />, tone: "#34d399" },
  { num: "108", label: "Emergency / Disaster", icon: <Ambulance size={18} />, tone: "#34d399" },
  { num: "1091", label: "Women Helpline", icon: <VenetianMask size={18} />, tone: "#c084fc" },
  { num: "1098", label: "Child Helpline", icon: <Baby size={18} />, tone: "#60a5fa" },
  { num: "1930", label: "Cyber Crime", icon: <ShieldQuestion size={18} />, tone: "#f472b6" },
  { num: "1073", label: "Road Accident", icon: <ShieldAlert size={18} />, tone: "#fb7185" },
  { num: "14567", label: "Senior Citizen", icon: <Landmark size={18} />, tone: "#a3e635" },
  { num: "139", label: "Railway Enquiry", icon: <Train size={18} />, tone: "#38bdf8" },
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

function Sos({ contactsCount, onSent }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [arming, setArming] = useState(false);
  const [count, setCount] = useState(3);
  const timer = useRef(null);

  const fire = async () => {
    setBusy(true); setResult(null);
    let coords = {};
    try {
      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 6000, enableHighAccuracy: true }));
      coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    } catch (_) { /* location optional */ }
    try {
      const r = await api.post("/me/sos", coords);
      setResult(r.data);
      onSent && onSent();
    } catch (e) {
      setResult({ error: e?.response?.data?.detail || "Could not send SOS" });
    } finally { setBusy(false); }
  };

  const beginArm = () => {
    if (contactsCount === 0) { setResult({ error: "Add at least one emergency contact first." }); return; }
    setArming(true); setCount(3);
    timer.current = setInterval(() => {
      setCount((c) => {
        if (c <= 1) { clearInterval(timer.current); setArming(false); fire(); return 0; }
        return c - 1;
      });
    }, 1000);
  };
  const cancel = () => { clearInterval(timer.current); setArming(false); setCount(3); };

  return (
    <div className="glass" style={{ padding: 28, borderRadius: 20, textAlign: "center", position: "relative", overflow: "hidden" }} data-testid="sos-panel">
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 0%, rgba(255,59,92,.22), transparent 60%)", pointerEvents: "none" }} />
      <p className="muted" style={{ marginTop: 0, fontSize: 13, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Emergency SOS</p>
      <p className="muted" style={{ marginTop: 4, fontSize: 14 }}>Instantly alert all your trusted contacts with your live location.</p>

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
            <div style={{ fontSize: 12, opacity: .9 }}>sending…</div>
          </div>
        </div>
      )}

      {arming ? (
        <button className="btn btn-ghost" data-testid="sos-cancel-btn" onClick={cancel} style={{ margin: "6px auto 0" }}>Cancel</button>
      ) : (
        <p className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>Tap and hold-free — a 3-second countdown protects against accidental taps.</p>
      )}

      {result && !result.error && (
        <div data-testid="sos-result" className="glass" style={{ marginTop: 16, padding: "12px 14px", borderRadius: 12, borderColor: "rgba(52,211,153,.4)", display: "inline-flex", alignItems: "center", gap: 8, color: "#34d399", fontWeight: 700 }}>
          <CheckCircle2 size={18} /> SOS sent to {result.notified} contact{result.notified === 1 ? "" : "s"} · {result.channels?.join(", ")}
        </div>
      )}
      {result?.error && (
        <div data-testid="sos-error" style={{ marginTop: 16, color: "#ff7591", fontWeight: 700, fontSize: 14 }}>{result.error}</div>
      )}
    </div>
  );
}

function LiveShare() {
  const [shares, setShares] = useState([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const watchRef = useRef(null);
  const postTimer = useRef(null);
  const lastPos = useRef(null);

  const active = shares[0];
  const url = active ? `${window.location.origin}/live/${active.token}` : "";

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
  const shareWa = () => window.open(`https://wa.me/?text=${encodeURIComponent(`Follow my live location on Nek Sathi: ${url}`)}`, "_blank");

  return (
    <div className="glass" style={{ padding: 22, borderRadius: 18, marginTop: 18 }} data-testid="live-share-panel">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <RadioTower size={20} className="neon" />
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Live Location Sharing</h2>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 12.5 }}>Share a live link so loved ones can follow you in real time.</p>
        </div>
      </div>

      {!active ? (
        <button className="btn btn-primary" onClick={start} disabled={busy} data-testid="live-share-start-btn">
          {busy ? <Loader2 className="spin" size={16} /> : <><RadioTower size={16} /> Start sharing (1 hour)</>}
        </button>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <div className="glass" style={{ padding: "12px 14px", borderRadius: 12, display: "flex", alignItems: "center", gap: 10 }} data-testid="live-share-active">
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#34d399", boxShadow: "0 0 0 4px rgba(52,211,153,.25)", flexShrink: 0 }} />
            <span style={{ fontWeight: 700 }}>You're sharing your live location</span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input className="input" readOnly value={url} data-testid="live-share-url" style={{ flex: "1 1 240px", minWidth: 0 }} />
            <button className="btn btn-ghost" onClick={copy} data-testid="live-share-copy-btn">{copied ? <><CheckCircle2 size={16} /> Copied</> : <><Copy size={16} /> Copy</>}</button>
            <button className="btn btn-ghost" onClick={shareWa} data-testid="live-share-wa-btn"><Share2 size={16} /> WhatsApp</button>
            <button className="btn btn-danger" onClick={stop} disabled={busy} data-testid="live-share-stop-btn">{busy ? <Loader2 className="spin" size={16} /> : <><Square size={15} /> Stop</>}</button>
          </div>
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>Keep this tab open — your device updates the location automatically while sharing.</p>
        </div>
      )}
    </div>
  );
}

function LinkChecker() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");

  const check = async (e) => {
    e.preventDefault(); setErr(""); setRes(null); setBusy(true);
    try {
      const r = await api.post("/safety/link-check", { url });
      setRes(r.data);
    } catch (e) { setErr(e?.response?.data?.detail || "Could not scan this link."); }
    finally { setBusy(false); }
  };

  return (
    <div className="glass" style={{ padding: 22, borderRadius: 18, marginTop: 18 }} data-testid="link-checker-panel">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <Link2 size={20} className="neon" />
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Safe Link Checker</h2>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 12.5 }}>Scan a link for phishing or malware before you open it.</p>
        </div>
      </div>
      <form onSubmit={check} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} required placeholder="Paste a link e.g. https://…" data-testid="link-checker-input" style={{ flex: "1 1 260px", minWidth: 0 }} />
        <button className="btn btn-primary" disabled={busy} type="submit" data-testid="link-checker-btn">
          {busy ? <Loader2 className="spin" size={16} /> : <><Search size={16} /> Check</>}
        </button>
      </form>
      {err && <div style={{ color: "#ff7591", fontSize: 13, marginTop: 12 }} data-testid="link-checker-error">{err}</div>}
      {res && res.configured === false && (
        <div className="muted" style={{ marginTop: 12, fontSize: 13 }} data-testid="link-checker-unconfigured">Scanner isn't configured yet — add a VirusTotal API key to enable it.</div>
      )}
      {res?.verdict === "pending" && <div className="muted" style={{ marginTop: 12, fontSize: 13 }} data-testid="link-checker-pending">Still analysing — please check again in a few seconds.</div>}
      {(res?.verdict === "safe" || res?.verdict === "unsafe") && (
        <div data-testid="link-checker-result" className="glass" style={{ marginTop: 14, padding: 16, borderRadius: 12, borderColor: res.verdict === "unsafe" ? "rgba(255,59,92,.5)" : "rgba(52,211,153,.5)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: res.verdict === "unsafe" ? "#ff7591" : "#34d399", fontWeight: 800, fontSize: 16 }}>
            {res.verdict === "unsafe" ? <><ShieldX size={22} /> Unsafe — avoid this link</> : <><ShieldCheck size={22} /> No known threat detected</>}
          </div>
          {res.stats && (
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10, fontSize: 12.5 }} className="muted">
              <span style={{ color: "#ff7591" }}>Malicious: {res.stats.malicious ?? 0}</span>
              <span style={{ color: "#f5a524" }}>Suspicious: {res.stats.suspicious ?? 0}</span>
              <span style={{ color: "#34d399" }}>Harmless: {res.stats.harmless ?? 0}</span>
              <span>Undetected: {res.stats.undetected ?? 0}</span>
            </div>
          )}
          <p className="muted" style={{ fontSize: 11.5, marginTop: 10, marginBottom: 0 }}>Powered by VirusTotal · a strong signal, not an absolute guarantee.</p>
        </div>
      )}
    </div>
  );
}

function NearbyPolice() {
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
      setErr(e?.code === 1 ? "Location permission denied. Allow location to find nearby stations." : (e?.response?.data?.detail || "Could not find nearby police stations."));
    } finally { setBusy(false); }
  };

  const drawMap = (lat, lng, list) => {
    loadLeaflet().then((L) => {
      if (!mapEl.current) return;
      if (mapObj.current) { mapObj.current.remove(); mapObj.current = null; }
      const map = L.map(mapEl.current, { zoomControl: true }).setView([lat, lng], 13);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(map);
      L.circleMarker([lat, lng], { radius: 8, color: "#22d3ee", fillColor: "#7c3aed", fillOpacity: 1, weight: 3 }).addTo(map).bindPopup("You are here");
      list.forEach((s) => {
        L.marker([s.latitude, s.longitude]).addTo(map).bindPopup(`<b>${s.name}</b><br/>${s.distance_km} km away`);
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
            <h2 style={{ margin: 0, fontSize: 18 }}>Nearby Police Stations</h2>
            <p className="muted" style={{ margin: "2px 0 0", fontSize: 12.5 }}>Find the closest stations around you, with directions.</p>
          </div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={find} disabled={busy} data-testid="police-find-btn">
          {busy ? <Loader2 className="spin" size={16} /> : <><Navigation size={16} /> Find near me</>}
        </button>
      </div>
      {err && <div style={{ color: "#ff7591", fontSize: 13, marginBottom: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }} data-testid="police-error">{err}<button className="btn btn-ghost btn-sm" onClick={find} disabled={busy} data-testid="police-retry-btn">Retry</button></div>}
      {stations && (
        <>
          <div ref={mapEl} data-testid="police-map" style={{ height: 300, borderRadius: 12, overflow: "hidden", border: "1px solid var(--panel-brd)", marginBottom: 12 }} />
          {stations.length === 0 ? (
            <p className="muted" data-testid="police-empty">No police stations found within 8 km.</p>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {stations.slice(0, 8).map((s) => (
                <div key={s.id} data-testid="police-row" className="glass" style={{ padding: "10px 14px", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</div>
                    <div className="muted" style={{ fontSize: 12.5 }}>{s.distance_km} km away{s.address ? ` · ${s.address}` : ""}</div>
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

export default function Safety() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "", relation: "", is_primary: false });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState([]);
  const siren = useSiren();

  const load = async () => {
    setLoading(true);
    try {
      const [c, h] = await Promise.all([api.get("/me/emergency-contacts"), api.get("/me/sos-events")]);
      setContacts(c.data); setHistory(h.data);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openAdd = () => { setEditing(null); setForm({ name: "", phone: "", relation: "", is_primary: false }); setErr(""); setShow(true); };
  const openEdit = (c) => { setEditing(c.id); setForm({ name: c.name, phone: c.phone, relation: c.relation || "", is_primary: c.is_primary }); setErr(""); setShow(true); };

  const save = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      if (editing) await api.put(`/me/emergency-contacts/${editing}`, form);
      else await api.post("/me/emergency-contacts", form);
      setShow(false); load();
    } catch (e) { setErr(e?.response?.data?.detail || "Could not save contact"); } finally { setBusy(false); }
  };
  const remove = async (id) => {
    if (!window.confirm("Remove this emergency contact?")) return;
    await api.delete(`/me/emergency-contacts/${id}`); load();
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="page" data-testid="safety-page" style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 20px 80px" }}>
      <style>{`@keyframes sosPulse{0%,100%{box-shadow:0 0 0 10px rgba(255,59,92,.12),0 20px 50px -10px rgba(255,59,92,.7)}50%{box-shadow:0 0 0 22px rgba(255,59,92,0),0 20px 50px -10px rgba(255,59,92,.7)}}.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <div style={{ marginBottom: 22 }}>
        <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800 }}>Safety Center</h1>
        <p className="muted" style={{ marginTop: 6 }}>Your personal panic button, trusted contacts, siren and helplines — all in one place.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 18, alignItems: "start" }} className="safety-grid">
        <Sos contactsCount={contacts.length} onSent={load} />

        {/* Siren */}
        <div className="glass" style={{ padding: 24, borderRadius: 20, textAlign: "center" }} data-testid="siren-panel">
          <p className="muted" style={{ marginTop: 0, fontSize: 13, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Emergency Siren</p>
          <p className="muted" style={{ marginTop: 4, fontSize: 14 }}>Sound a loud alarm to scare off a threat or draw attention.</p>
          <button
            data-testid="siren-toggle-btn"
            onClick={siren.toggle}
            style={{
              width: 130, height: 130, borderRadius: "50%", border: "none", cursor: "pointer", margin: "18px auto 10px",
              display: "grid", placeItems: "center", color: "#fff",
              background: siren.on ? "radial-gradient(circle at 30% 30%,#f5a524,#e0770a)" : "radial-gradient(circle at 30% 30%,#7c3aed,#06b6d4)",
              boxShadow: siren.on ? "0 0 0 10px rgba(245,165,36,.2)" : "0 14px 40px -10px rgba(34,211,238,.6)",
              animation: siren.on ? "sosPulse 0.7s ease-in-out infinite" : "none",
            }}>
            <Siren size={46} />
          </button>
          <div>
            <button className={`btn ${siren.on ? "btn-danger" : "btn-ghost"}`} onClick={siren.toggle} data-testid="siren-label-btn">
              {siren.on ? <><VolumeX size={16} /> Stop siren</> : <><Volume2 size={16} /> Start siren</>}
            </button>
          </div>
        </div>
      </div>

      {/* Emergency contacts */}
      <div className="glass" style={{ padding: 22, borderRadius: 18, marginTop: 18 }} data-testid="contacts-panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Users size={20} className="neon" />
            <div>
              <h2 style={{ margin: 0, fontSize: 18 }}>Trusted Contacts</h2>
              <p className="muted" style={{ margin: "2px 0 0", fontSize: 12.5 }}>Unlimited — everyone here is alerted when you press SOS.</p>
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={openAdd} data-testid="add-contact-btn"><Plus size={16} /> Add contact</button>
        </div>

        {loading ? (
          <div className="spinner" data-testid="contacts-loading" />
        ) : contacts.length === 0 ? (
          <p className="muted" data-testid="contacts-empty" style={{ textAlign: "center", padding: "18px 0" }}>No contacts yet. Add family or friends who should be alerted in an emergency.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {contacts.map((c) => (
              <div key={c.id} data-testid={`contact-row-${c.id}`} className="glass" style={{ padding: "12px 14px", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                  <span style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0, background: "linear-gradient(135deg,#7c3aed,#22d3ee)", display: "grid", placeItems: "center", fontWeight: 800, color: "#fff" }}>{c.name?.[0]?.toUpperCase() || "?"}</span>
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

      {/* Safe link checker */}
      <LinkChecker />

      {/* Nearby police */}
      <NearbyPolice />

      {/* Helplines */}
      <div className="glass" style={{ padding: 22, borderRadius: 18, marginTop: 18 }} data-testid="helplines-panel">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <Phone size={20} className="neon" />
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>Important Helplines</h2>
            <p className="muted" style={{ margin: "2px 0 0", fontSize: 12.5 }}>Tap any number to call instantly (India).</p>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))", gap: 10 }}>
          {HELPLINES.map((h) => (
            <a key={h.num} href={`tel:${h.num}`} data-testid={`helpline-${h.num}`} className="glass glass-hover"
              style={{ padding: "12px 14px", borderRadius: 12, display: "flex", alignItems: "center", gap: 12, textDecoration: "none", color: "var(--text)" }}>
              <span style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, display: "grid", placeItems: "center", color: h.tone, background: "rgba(255,255,255,.05)" }}>{h.icon}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 18 }}>{h.num}</div>
                <div className="muted" style={{ fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.label}</div>
              </div>
            </a>
          ))}
        </div>
      </div>

      {/* SOS history */}
      {history.length > 0 && (
        <div className="glass" style={{ padding: 22, borderRadius: 18, marginTop: 18 }} data-testid="sos-history-panel">
          <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Recent SOS activity</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {history.map((e) => (
              <div key={e.id} data-testid={`sos-event-${e.id}`} className="glass" style={{ padding: "10px 14px", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <ShieldAlert size={16} style={{ color: "#ff3b5c" }} />
                  <span style={{ fontSize: 13.5 }}>Alerted {e.notified} contact{e.notified === 1 ? "" : "s"} · {(e.channels || []).join(", ") || "—"}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {e.latitude != null && (
                    <a href={`https://maps.google.com/?q=${e.latitude},${e.longitude}`} target="_blank" rel="noreferrer" className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12.5 }}><MapPin size={13} /> Map</a>
                  )}
                  <span className="muted" style={{ fontSize: 12 }}>{new Date(e.created_at).toLocaleString()}</span>
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
              <h3 style={{ margin: 0 }}>{editing ? "Edit contact" : "Add emergency contact"}</h3>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShow(false)} data-testid="contact-modal-close"><X size={16} /></button>
            </div>
            {err && <div style={{ color: "#ff7591", fontSize: 13, marginBottom: 10 }} data-testid="contact-error">{err}</div>}
            <div className="field" style={{ marginBottom: 12 }}>
              <label>Name</label>
              <input className="input" value={form.name} onChange={set("name")} required data-testid="contact-name-input" placeholder="e.g. Mom" />
            </div>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>Phone number</label>
              <input className="input" value={form.phone} onChange={set("phone")} required data-testid="contact-phone-input" placeholder="10-digit mobile" />
            </div>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>Relation (optional)</label>
              <input className="input" value={form.relation} onChange={set("relation")} data-testid="contact-relation-input" placeholder="Mother, Friend, Neighbour…" />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 18 }} data-testid="contact-primary-toggle" onClick={() => setForm({ ...form, is_primary: !form.is_primary })}>
              <span style={{ width: 20, height: 20, borderRadius: 6, border: "1px solid var(--panel-brd)", background: form.is_primary ? "linear-gradient(100deg,#7c3aed,#22d3ee)" : "transparent", display: "grid", placeItems: "center" }}>{form.is_primary && <CheckCircle2 size={14} color="#fff" />}</span>
              <span style={{ fontSize: 13.5 }}>Mark as primary contact</span>
            </label>
            <button className="btn btn-primary btn-block" disabled={busy} type="submit" data-testid="contact-save-btn">
              {busy ? <Loader2 className="spin" size={16} /> : (editing ? "Save changes" : "Add contact")}
            </button>
          </form>
        </div>
      )}
      <style>{`@media(max-width:820px){.safety-grid{grid-template-columns:1fr!important}}`}</style>
    </div>
  );
}
