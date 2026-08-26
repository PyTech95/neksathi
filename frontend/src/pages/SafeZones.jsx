import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { loadLeaflet } from "@/lib/leaflet";
import { Radar, ArrowLeft, Plus, Trash2, MapPin, Loader2, LocateFixed, LogIn, LogOut, X } from "lucide-react";

export default function SafeZones() {
  const [zones, setZones] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ name: "", latitude: null, longitude: null, radius_m: 300, notify: true });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkMsg, setCheckMsg] = useState("");
  const mapEl = useRef(null);
  const mapObj = useRef(null);
  const layer = useRef(null);
  const pickMarker = useRef(null);
  const centered = useRef(false);

  const load = async () => {
    try {
      const [z, e] = await Promise.all([api.get("/me/safe-zones"), api.get("/me/geofence-events")]);
      setZones(z.data); setEvents(e.data);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  // init + redraw map
  useEffect(() => {
    loadLeaflet().then((L) => {
      if (!mapEl.current) return;
      if (!mapObj.current) {
        const center = zones[0] ? [zones[0].latitude, zones[0].longitude] : [20.5937, 78.9629];
        const map = L.map(mapEl.current, { zoomControl: true }).setView(center, zones[0] ? 14 : 5);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(map);
        map.on("click", (e) => setForm((f) => ({ ...f, latitude: e.latlng.lat, longitude: e.latlng.lng })));
        mapObj.current = { L, map };
      }
      draw();
    });
    // eslint-disable-next-line
  }, [zones, form.latitude, form.longitude, form.radius_m]);

  const draw = () => {
    const ctx = mapObj.current; if (!ctx) return;
    const { L, map } = ctx;
    if (layer.current) { layer.current.remove(); }
    layer.current = L.layerGroup().addTo(map);
    zones.forEach((z) => {
      L.circle([z.latitude, z.longitude], { radius: z.radius_m, color: "#22d3ee", fillColor: "#22d3ee", fillOpacity: 0.12, weight: 2 }).addTo(layer.current).bindPopup(`<b>${z.name}</b><br/>${z.radius_m} m`);
    });
    if (!centered.current && zones.length) {
      map.setView([zones[0].latitude, zones[0].longitude], 14);
      centered.current = true;
    }
    if (form.latitude != null && form.longitude != null) {
      L.circle([form.latitude, form.longitude], { radius: form.radius_m, color: "#f5a524", fillColor: "#f5a524", fillOpacity: 0.15, weight: 2, dashArray: "6" }).addTo(layer.current);
    }
  };

  const useMyLocation = () => {
    navigator.geolocation.getCurrentPosition(
      (p) => { setForm((f) => ({ ...f, latitude: p.coords.latitude, longitude: p.coords.longitude })); if (mapObj.current) mapObj.current.map.setView([p.coords.latitude, p.coords.longitude], 15); },
      () => setErr("Location permission denied."), { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const openAdd = () => { setForm({ name: "", latitude: null, longitude: null, radius_m: 300, notify: true }); setErr(""); setShow(true); };
  const save = async (e) => {
    e.preventDefault(); setErr("");
    if (form.latitude == null || form.longitude == null) { setErr("Pick a center — tap the map or use your location."); return; }
    setBusy(true);
    try { await api.post("/me/safe-zones", form); setShow(false); load(); }
    catch (e) { setErr(e?.response?.data?.detail || "Could not save zone."); } finally { setBusy(false); }
  };
  const remove = async (id) => { if (!window.confirm("Delete this safe zone?")) return; await api.delete(`/me/safe-zones/${id}`); load(); };

  const checkNow = async () => {
    setCheckMsg("Checking…");
    navigator.geolocation.getCurrentPosition(async (p) => {
      try {
        const r = await api.post("/me/location", { latitude: p.coords.latitude, longitude: p.coords.longitude });
        const t = r.data.transitions || [];
        setCheckMsg(t.length ? t.map((x) => `${x.type === "enter" ? "Entered" : "Left"} ${x.zone_name}`).join(", ") : "Location updated — no zone changes.");
        load();
      } catch { setCheckMsg("Could not update location."); }
    }, () => setCheckMsg("Location permission denied."), { enableHighAccuracy: true, timeout: 8000 });
  };

  return (
    <div className="page" data-testid="safe-zones-page" style={{ maxWidth: 900, margin: "0 auto", padding: "24px 20px 80px" }}>
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <Link to="/safety" className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }} data-testid="safe-zones-back"><ArrowLeft size={15} /> Safety</Link>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Radar size={24} className="neon" />
          <div><h1 style={{ margin: 0, fontSize: 24 }}>Safe Zones</h1><p className="muted" style={{ margin: "2px 0 0", fontSize: 12.5 }}>Get alerted when you enter or leave a zone.</p></div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={checkNow} data-testid="check-location-btn"><LocateFixed size={15} /> Check my location</button>
          <button className="btn btn-primary btn-sm" onClick={openAdd} data-testid="add-zone-btn"><Plus size={15} /> Add zone</button>
        </div>
      </div>
      {checkMsg && <div className="glass" style={{ padding: "10px 14px", borderRadius: 10, marginBottom: 12, fontSize: 13.5 }} data-testid="check-msg">{checkMsg}</div>}

      <div ref={mapEl} data-testid="zones-map" style={{ height: 340, borderRadius: 14, overflow: "hidden", border: "1px solid var(--panel-brd)", marginBottom: 16 }} />

      {loading ? <div className="spinner" data-testid="zones-loading" /> : (
        <>
          <h2 style={{ fontSize: 17, margin: "0 0 10px" }}>Your zones</h2>
          {zones.length === 0 ? (
            <p className="muted" data-testid="zones-empty" style={{ textAlign: "center", padding: "16px 0" }}>No safe zones yet. Add your home, school or office.</p>
          ) : (
            <div style={{ display: "grid", gap: 8, marginBottom: 20 }}>
              {zones.map((z) => (
                <div key={z.id} data-testid={`zone-row-${z.id}`} className="glass" style={{ padding: "12px 14px", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <MapPin size={18} style={{ color: z.last_inside ? "#34d399" : "#22d3ee" }} />
                    <div>
                      <div style={{ fontWeight: 700 }}>{z.name} {z.last_inside === true && <span style={{ color: "#34d399", fontSize: 12 }}>· inside</span>}{z.last_inside === false && <span className="muted" style={{ fontSize: 12 }}>· outside</span>}</div>
                      <div className="muted" style={{ fontSize: 12.5 }}>{z.radius_m} m radius</div>
                    </div>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => remove(z.id)} data-testid={`zone-delete-${z.id}`}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}

          {events.length > 0 && (
            <>
              <h2 style={{ fontSize: 17, margin: "0 0 10px" }}>Recent activity</h2>
              <div style={{ display: "grid", gap: 6 }}>
                {events.map((e) => (
                  <div key={e.id} data-testid={`zone-event-${e.id}`} className="glass" style={{ padding: "8px 14px", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
                      {e.type === "enter" ? <LogIn size={15} style={{ color: "#34d399" }} /> : <LogOut size={15} style={{ color: "#f5a524" }} />}
                      {e.type === "enter" ? "Entered" : "Left"} <b>{e.zone_name}</b>
                    </span>
                    <span className="muted" style={{ fontSize: 12 }}>{new Date(e.created_at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {show && (
        <div className="modal-overlay" data-testid="zone-modal" onClick={() => setShow(false)} style={{ position: "fixed", inset: 0, background: "rgba(3,3,10,.7)", backdropFilter: "blur(6px)", display: "grid", placeItems: "center", zIndex: 100, padding: 16 }}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={save} className="glass" style={{ width: "100%", maxWidth: 440, padding: 24, borderRadius: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ margin: 0 }}>Add safe zone</h3>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShow(false)} data-testid="zone-modal-close"><X size={16} /></button>
            </div>
            {err && <div style={{ color: "#ff7591", fontSize: 13, marginBottom: 10 }} data-testid="zone-error">{err}</div>}
            <div className="field" style={{ marginBottom: 12 }}>
              <label>Zone name</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required data-testid="zone-name-input" placeholder="e.g. Home" />
            </div>
            <button type="button" className="btn btn-ghost btn-block" style={{ marginBottom: 12 }} onClick={useMyLocation} data-testid="zone-use-location-btn"><LocateFixed size={15} /> Use my current location as center</button>
            <p className="muted" style={{ fontSize: 12.5, marginTop: -4, marginBottom: 12 }}>{form.latitude != null ? `Center: ${form.latitude.toFixed(4)}, ${form.longitude.toFixed(4)}` : "…or tap anywhere on the map to set the center."}</p>
            <div className="field" style={{ marginBottom: 16 }}>
              <label>Radius: {form.radius_m} m</label>
              <input type="range" min={50} max={5000} step={50} value={form.radius_m} onChange={(e) => setForm({ ...form, radius_m: Number(e.target.value) })} data-testid="zone-radius-input" style={{ width: "100%" }} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 18 }} onClick={() => setForm({ ...form, notify: !form.notify })} data-testid="zone-notify-toggle">
              <span style={{ width: 20, height: 20, borderRadius: 6, border: "1px solid var(--panel-brd)", background: form.notify ? "linear-gradient(100deg,#7c3aed,#22d3ee)" : "transparent", display: "grid", placeItems: "center" }}>{form.notify && <MapPin size={12} color="#fff" />}</span>
              <span style={{ fontSize: 13.5 }}>Alert my contacts if I leave this zone</span>
            </label>
            <button className="btn btn-primary btn-block" disabled={busy} type="submit" data-testid="zone-save-btn">{busy ? <Loader2 className="spin" size={16} /> : "Save zone"}</button>
          </form>
        </div>
      )}
    </div>
  );
}
