import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { loadLeaflet } from "@/lib/leaflet";
import { Clock, Plus, Users, Copy, CheckCircle2, LogOut, LocateFixed, MapPin, Loader2, Timer, ArrowLeft, X } from "lucide-react";

function timeLeft(iso) {
  const ms = new Date(iso) - new Date();
  if (ms <= 0) return "expired";
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m left` : `${m}m left`;
}

export default function TemporaryCircles() {
  const [circles, setCircles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", hours: 6 });
  const [joinCode, setJoinCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null); // active circle detail
  const [copied, setCopied] = useState(false);
  const mapEl = useRef(null); const mapObj = useRef(null); const layer = useRef(null); const watchId = useRef(null);

  const load = async () => {
    setLoading(true);
    try { setCircles((await api.get("/circles/temp")).data.items || []); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.name.trim()) { setErr("Give your circle a name."); return; }
    setBusy(true); setErr("");
    try { const r = (await api.post("/circles/temp", { name: form.name.trim(), hours: Number(form.hours) })).data; setCreating(false); setForm({ name: "", hours: 6 }); await load(); openCircle(r.id); }
    catch (e) { setErr(e?.response?.data?.detail || "Could not create circle."); }
    finally { setBusy(false); }
  };
  const join = async () => {
    if (!joinCode.trim()) return;
    setBusy(true); setErr("");
    try { const r = (await api.post("/circles/temp/join", { code: joinCode.trim() })).data; setJoinCode(""); await load(); openCircle(r.id); }
    catch (e) { setErr(e?.response?.data?.detail || "Circle not found or expired."); }
    finally { setBusy(false); }
  };

  const openCircle = async (id) => {
    try { setOpen((await api.get(`/circles/temp/${id}`)).data); } catch (e) { setErr(e?.response?.data?.detail || "Could not open circle."); }
  };
  const closeCircle = () => { setOpen(null); };

  // While a circle is open: watch my geolocation and ping it; refresh members every 12s.
  useEffect(() => {
    if (!open) return;
    let stopped = false;
    const ping = (pos) => { api.post(`/circles/temp/${open.id}/ping`, { latitude: pos.coords.latitude, longitude: pos.coords.longitude }).catch(() => {}); };
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(ping, () => {}, { enableHighAccuracy: true });
      watchId.current = navigator.geolocation.watchPosition(ping, () => {}, { enableHighAccuracy: true, maximumAge: 10000 });
    }
    const refresh = setInterval(async () => {
      if (stopped) return;
      try { const d = (await api.get(`/circles/temp/${open.id}`)).data; setOpen(d); } catch (_) { setOpen(null); }
    }, 12000);
    return () => { stopped = true; clearInterval(refresh); if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current); };
  }, [open?.id]);

  // Render the members map when the open circle changes.
  useEffect(() => {
    if (!open) { mapObj.current = null; return; }
    const pts = (open.members || []).filter((m) => m.latitude != null);
    if (!pts.length) return;
    loadLeaflet().then((L) => {
      if (!mapEl.current) return;
      if (!mapObj.current) {
        mapObj.current = L.map(mapEl.current, { zoomControl: true }).setView([pts[0].latitude, pts[0].longitude], 13);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(mapObj.current);
      }
      if (layer.current) layer.current.remove();
      layer.current = L.layerGroup().addTo(mapObj.current);
      pts.forEach((m) => L.circleMarker([m.latitude, m.longitude], { radius: 9, color: m.is_me ? "#22d3ee" : "#8b5cf6", fillColor: m.is_me ? "#22d3ee" : "#8b5cf6", fillOpacity: .7, weight: 2 }).addTo(layer.current).bindPopup(`<b>${m.name}${m.is_me ? " (you)" : ""}</b>`));
      if (pts.length > 1) mapObj.current.fitBounds(pts.map((m) => [m.latitude, m.longitude]), { padding: [40, 40] });
    });
  }, [open]);

  const leave = async () => { await api.post(`/circles/temp/${open.id}/leave`); closeCircle(); load(); };
  const copyCode = () => { navigator.clipboard.writeText(open.join_code); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  if (open) {
    const shared = (open.members || []).filter((m) => m.latitude != null).length;
    return (
      <div className="container-nk" style={{ padding: "26px 20px 80px" }} data-testid="circle-detail">
        <button className="btn btn-ghost btn-sm" onClick={closeCircle} data-testid="circle-back" style={{ marginBottom: 14 }}><ArrowLeft size={15} /> All circles</button>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          <div>
            <h1 style={{ fontSize: 26, margin: 0, display: "flex", alignItems: "center", gap: 8 }}><Users size={22} className="neon" /> {open.name}</h1>
            <div className="muted" style={{ fontSize: 13, marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}><Timer size={14} /> {timeLeft(open.expires_at)} · {open.members.length} member{open.members.length === 1 ? "" : "s"}</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={copyCode} data-testid="circle-copy-code">{copied ? <><CheckCircle2 size={14} /> Copied</> : <><Copy size={14} /> Code {open.join_code}</>}</button>
            <button className="btn btn-danger btn-sm" onClick={leave} data-testid="circle-leave">{open.is_owner ? <><X size={14} /> End circle</> : <><LogOut size={14} /> Leave</>}</button>
          </div>
        </div>

        {shared > 0 ? (
          <div ref={mapEl} data-testid="circle-map" style={{ height: 340, borderRadius: 16, overflow: "hidden", border: "1px solid var(--panel-brd)", marginBottom: 16 }} />
        ) : (
          <div className="glass" data-testid="circle-map-empty" style={{ padding: 28, borderRadius: 16, textAlign: "center", marginBottom: 16 }}>
            <LocateFixed size={30} className="neon" /><p className="muted" style={{ marginTop: 10, fontSize: 14 }}>Waiting for members to share location. Keep this page open and allow location access.</p>
          </div>
        )}

        <div style={{ display: "grid", gap: 8 }}>
          {open.members.map((m) => (
            <div key={m.user_id} data-testid={`circle-member-${m.user_id}`} className="glass" style={{ padding: "11px 14px", borderRadius: 12, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 36, height: 36, borderRadius: "50%", background: m.is_me ? "linear-gradient(135deg,#22d3ee,#0891b2)" : "linear-gradient(135deg,#7c3aed,#22d3ee)", color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, flexShrink: 0 }}>{(m.name || "?")[0]}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{m.name}{m.is_me ? " (you)" : ""}{m.is_owner ? " · host" : ""}</div>
                <div className="muted" style={{ fontSize: 12 }}>{m.latitude != null ? `Sharing live · ${m.last_seen ? new Date(m.last_seen).toLocaleTimeString() : ""}` : "Not sharing yet"}</div>
              </div>
              {m.latitude != null && <a className="btn btn-ghost btn-sm" href={`https://maps.google.com/?q=${m.latitude},${m.longitude}`} target="_blank" rel="noreferrer" data-testid={`circle-member-map-${m.user_id}`}><MapPin size={14} /></a>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container-nk" style={{ padding: "26px 20px 80px" }} data-testid="temp-circles-page">
      <h1 style={{ fontSize: 28, margin: 0, display: "flex", alignItems: "center", gap: 10 }}><Clock size={24} className="neon" /> Temporary circles</h1>
      <p className="muted" style={{ fontSize: 15, marginTop: 6, marginBottom: 22 }}>Share live location with a group just for a trip or night out — it auto-expires, no long-term tracking.</p>

      {err && <div className="glass" data-testid="circle-err" style={{ padding: 12, borderRadius: 10, marginBottom: 14, color: "#ff7591", fontSize: 13.5 }}>{err}</div>}

      <div className="grid grid-2" style={{ gap: 16, marginBottom: 26 }}>
        <div className="glass card-pad" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 17, marginTop: 0, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}><Plus size={17} className="neon" /> Start a circle</h3>
          {!creating ? (
            <button className="btn btn-primary" onClick={() => setCreating(true)} data-testid="circle-new-btn"><Plus size={16} /> New temporary circle</button>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              <input className="input" data-testid="circle-name-input" placeholder="e.g. Goa road trip, Friday night out" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <div className="field">
                <label style={{ fontSize: 13 }}>Auto-expire after</label>
                <select className="input" data-testid="circle-hours-select" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })}>
                  {[1, 2, 3, 6, 8, 12, 24].map((h) => <option key={h} value={h}>{h} hour{h === 1 ? "" : "s"}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-primary" onClick={create} disabled={busy} data-testid="circle-create-btn">{busy ? <Loader2 className="spin" size={15} /> : <><CheckCircle2 size={15} /> Create</>}</button>
                <button className="btn btn-ghost" onClick={() => { setCreating(false); setErr(""); }} data-testid="circle-cancel-btn">Cancel</button>
              </div>
            </div>
          )}
        </div>
        <div className="glass card-pad" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 17, marginTop: 0, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}><Users size={17} className="neon" /> Join a circle</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <input className="input" data-testid="circle-join-input" placeholder="Enter 6-digit code" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} maxLength={6} style={{ textTransform: "uppercase", letterSpacing: ".15em" }} />
            <button className="btn btn-primary" onClick={join} disabled={busy} data-testid="circle-join-btn">Join</button>
          </div>
        </div>
      </div>

      <h2 style={{ fontSize: 18, marginBottom: 12 }}>Your active circles</h2>
      {loading ? (
        <div style={{ textAlign: "center", padding: 30 }}><Loader2 className="spin" size={22} /></div>
      ) : circles.length === 0 ? (
        <p className="muted" data-testid="circles-empty" style={{ textAlign: "center", padding: "24px 0" }}>No active circles. Start one above for your next trip or night out.</p>
      ) : (
        <div className="grid grid-3">
          {circles.map((c) => (
            <button key={c.id} data-testid={`circle-card-${c.id}`} className="glass glass-hover card-pad" onClick={() => openCircle(c.id)} style={{ padding: 18, textAlign: "left", cursor: "pointer", border: "1px solid var(--panel-brd)", borderRadius: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <h3 style={{ fontSize: 16, margin: 0 }}>{c.name}</h3>
                {c.is_owner && <span className="chip" style={{ fontSize: 11 }}>Host</span>}
              </div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}><Timer size={13} /> {timeLeft(c.expires_at)}</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Code <b style={{ color: "#d9c9ff", letterSpacing: ".1em" }}>{c.join_code}</b></div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
