import { useEffect, useState } from "react";
import api from "@/lib/api";
import { ShieldCheck, Smartphone, Plus, Trash2, Pencil, Lock, Unlock, X, Loader2, MapPin, Camera, AlertTriangle, Info, Volume2, VolumeX, Signal } from "lucide-react";

function PhotoThumb({ eventId, onOpen }) {
  const [src, setSrc] = useState(null);
  useEffect(() => { let m = true; api.get(`/intruder-events/${eventId}/photo`).then((r) => m && setSrc(r.data.photo_base64)).catch(() => {}); return () => { m = false; }; }, [eventId]);
  if (!src) return <div style={{ width: 88, height: 88, borderRadius: 10, background: "rgba(255,255,255,.05)", display: "grid", placeItems: "center" }}><Camera size={20} className="muted" /></div>;
  return <img src={src} alt="intruder" onClick={() => onOpen(src)} data-testid={`intruder-photo-${eventId}`} style={{ width: 88, height: 88, objectFit: "cover", borderRadius: 10, cursor: "pointer" }} />;
}

export default function TheftProtection() {
  const [devices, setDevices] = useState([]);
  const [events, setEvents] = useState([]);
  const [simEvents, setSimEvents] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", platform: "android", lock_threshold: 3, guardian_contact_id: "", super_admin_alerts: true });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [lightbox, setLightbox] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [d, e, c, s] = await Promise.all([api.get("/devices"), api.get("/intruder-events"), api.get("/me/emergency-contacts"), api.get("/sim-events")]);
      setDevices(d.data); setEvents(e.data); setContacts(c.data); setSimEvents(s.data.items || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openAdd = () => { setEditing(null); setForm({ name: "", platform: "android", lock_threshold: 3, guardian_contact_id: "", super_admin_alerts: true }); setErr(""); setShow(true); };
  const openEdit = (d) => { setEditing(d.id); setForm({ name: d.name, platform: d.platform || "android", lock_threshold: d.lock_threshold, guardian_contact_id: d.guardian_contact_id || "", super_admin_alerts: d.super_admin_alerts }); setErr(""); setShow(true); };
  const save = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    const body = { ...form, guardian_contact_id: form.guardian_contact_id || null };
    try {
      if (editing) await api.put(`/devices/${editing}`, body); else await api.post("/devices", body);
      setShow(false); load();
    } catch (e) { setErr(e?.response?.data?.detail || "Could not save device."); } finally { setBusy(false); }
  };
  const remove = async (id) => { if (!window.confirm("Remove this device?")) return; await api.delete(`/devices/${id}`); load(); };
  const toggleLock = async (d) => { await api.post(`/devices/${d.id}/${d.locked ? "unlock" : "lock"}`); load(); };
  const toggleSiren = async (d) => { await api.post(`/devices/${d.id}/siren`, { active: !d.siren_active }); load(); };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="page" data-testid="theft-page" style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 20px 80px" }}>
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <ShieldCheck size={26} className="neon" />
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>Theft Protection</h1>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>If your phone is stolen, an intruder photo is captured on failed unlocks and the phone auto-locks — alerting your family, guardian and admin.</p>

      <div className="glass" style={{ padding: 16, borderRadius: 14, marginBottom: 20, display: "flex", gap: 12, alignItems: "flex-start", borderColor: "rgba(34,211,238,.3)" }} data-testid="theft-mobile-note">
        <Info size={20} className="neon" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: 13.5 }}>Capture & auto-lock run inside the <b>Nek Sathi mobile app</b> (needs Device Admin permission). Register your device below — this portal manages settings, shows every intruder capture, and lets you remotely lock/unlock.</div>
      </div>

      {/* Devices */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>My devices</h2>
        <button className="btn btn-primary btn-sm" onClick={openAdd} data-testid="add-device-btn"><Plus size={16} /> Add device</button>
      </div>
      {loading ? <div className="spinner" data-testid="theft-loading" /> : devices.length === 0 ? (
        <p className="muted" data-testid="devices-empty" style={{ textAlign: "center", padding: "16px 0" }}>No devices yet. Add the phone you want to protect.</p>
      ) : (
        <div style={{ display: "grid", gap: 10, marginBottom: 26 }}>
          {devices.map((d) => (
            <div key={d.id} data-testid={`device-row-${d.id}`} className="glass" style={{ padding: "14px 16px", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ width: 42, height: 42, borderRadius: 11, display: "grid", placeItems: "center", background: d.locked ? "rgba(255,59,92,.15)" : "rgba(52,211,153,.12)", color: d.locked ? "#ff3b5c" : "#34d399", flexShrink: 0 }}><Smartphone size={20} /></span>
                <div>
                  <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>{d.name}
                    {d.locked ? <span style={{ color: "#ff3b5c", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}><Lock size={12} /> Locked</span>
                      : <span style={{ color: "#34d399", fontSize: 12 }}>Active</span>}
                  </div>
                  <div className="muted" style={{ fontSize: 12.5 }}>{d.platform || "device"} · locks after {d.lock_threshold} failed attempts{d.siren_active ? " · 🔊 siren ON" : ""}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className={`btn btn-sm ${d.siren_active ? "btn-danger" : "btn-ghost"}`} onClick={() => toggleSiren(d)} data-testid={`device-siren-${d.id}`} title={d.siren_active ? "Stop remote siren" : "Sound siren remotely"}>{d.siren_active ? <><VolumeX size={14} /> Stop siren</> : <><Volume2 size={14} /> Siren</>}</button>
                <button className={`btn btn-sm ${d.locked ? "btn-ghost" : "btn-danger"}`} onClick={() => toggleLock(d)} data-testid={`device-lock-${d.id}`}>{d.locked ? <><Unlock size={14} /> Unlock</> : <><Lock size={14} /> Lock</>}</button>
                <button className="btn btn-ghost btn-sm" onClick={() => openEdit(d)} data-testid={`device-edit-${d.id}`}><Pencil size={14} /></button>
                <button className="btn btn-ghost btn-sm" onClick={() => remove(d.id)} data-testid={`device-delete-${d.id}`}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Intruder captures */}
      <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Intruder captures</h2>
      {events.length === 0 ? (
        <p className="muted" data-testid="intruder-empty" style={{ textAlign: "center", padding: "16px 0" }}>No intruder captures yet. You'll see photos here if someone tries to unlock a protected phone.</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {events.map((ev) => (
            <div key={ev.id} data-testid={`intruder-row-${ev.id}`} className="glass" style={{ padding: 14, borderRadius: 12, display: "flex", gap: 14, alignItems: "center" }}>
              {ev.has_photo ? <PhotoThumb eventId={ev.id} onOpen={setLightbox} /> : <div style={{ width: 88, height: 88, borderRadius: 10, background: "rgba(255,255,255,.05)", display: "grid", placeItems: "center" }}><Camera size={20} className="muted" /></div>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                  <AlertTriangle size={15} style={{ color: "#ff3b5c" }} /> {ev.attempt_count} failed attempt{ev.attempt_count === 1 ? "" : "s"} · {ev.device_name}
                  {ev.triggered_lock && <span style={{ color: "#ff3b5c", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 3 }}><Lock size={11} /> auto-locked</span>}
                </div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>{new Date(ev.created_at).toLocaleString()}</div>
                {ev.latitude != null && <a href={`https://maps.google.com/?q=${ev.latitude},${ev.longitude}`} target="_blank" rel="noreferrer" className="neon" style={{ fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 4, marginTop: 4 }}><MapPin size={13} /> View location</a>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SIM change alerts */}
      <h2 style={{ margin: "26px 0 12px", fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}><Signal size={17} className="neon" /> SIM change alerts</h2>
      {simEvents.length === 0 ? (
        <p className="muted" data-testid="sim-empty" style={{ textAlign: "center", padding: "16px 0" }}>No SIM changes detected. If someone swaps the SIM in a protected phone, your family is alerted instantly.</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {simEvents.map((ev) => (
            <div key={ev.id} data-testid={`sim-row-${ev.id}`} className="glass" style={{ padding: 14, borderRadius: 12, display: "flex", gap: 12, alignItems: "center" }}>
              <span style={{ width: 42, height: 42, borderRadius: 11, display: "grid", placeItems: "center", background: "rgba(255,59,92,.15)", color: "#ff3b5c", flexShrink: 0 }}><Signal size={19} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><AlertTriangle size={15} style={{ color: "#ff3b5c" }} /> SIM changed · {ev.device_name}</div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>{new Date(ev.created_at).toLocaleString()}{ev.carrier ? ` · ${ev.carrier}` : ""}{ev.new_number ? ` · ${ev.new_number}` : ""}</div>
                {ev.latitude != null && <a href={`https://maps.google.com/?q=${ev.latitude},${ev.longitude}`} target="_blank" rel="noreferrer" className="neon" style={{ fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 4, marginTop: 4 }}><MapPin size={13} /> View location</a>}
              </div>
            </div>
          ))}
        </div>
      )}

      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", display: "grid", placeItems: "center", zIndex: 200, padding: 20 }} data-testid="intruder-lightbox">
          <img src={lightbox} alt="intruder" style={{ maxWidth: "90%", maxHeight: "90%", borderRadius: 12 }} />
        </div>
      )}

      {show && (
        <div className="modal-overlay" data-testid="device-modal" onClick={() => setShow(false)} style={{ position: "fixed", inset: 0, background: "rgba(3,3,10,.7)", backdropFilter: "blur(6px)", display: "grid", placeItems: "center", zIndex: 100, padding: 16 }}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={save} className="glass" style={{ width: "100%", maxWidth: 440, padding: 24, borderRadius: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ margin: 0 }}>{editing ? "Edit device" : "Add device"}</h3>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShow(false)} data-testid="device-modal-close"><X size={16} /></button>
            </div>
            {err && <div style={{ color: "#ff7591", fontSize: 13, marginBottom: 10 }} data-testid="device-error">{err}</div>}
            <div className="field" style={{ marginBottom: 12 }}><label>Device name</label><input className="input" value={form.name} onChange={set("name")} required data-testid="device-name-input" placeholder="e.g. My Pixel 8" /></div>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>Platform</label>
              <select className="input" value={form.platform} onChange={set("platform")} data-testid="device-platform-input"><option value="android">Android</option><option value="ios">iOS</option></select>
            </div>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>Lock after {form.lock_threshold} failed attempts</label>
              <input type="range" min={2} max={5} value={form.lock_threshold} onChange={(e) => setForm({ ...form, lock_threshold: Number(e.target.value) })} data-testid="device-threshold-input" style={{ width: "100%" }} />
            </div>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>Device guardian (optional)</label>
              <select className="input" value={form.guardian_contact_id} onChange={set("guardian_contact_id")} data-testid="device-guardian-input">
                <option value="">— none —</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>)}
              </select>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 18 }} onClick={() => setForm({ ...form, super_admin_alerts: !form.super_admin_alerts })} data-testid="device-superadmin-toggle">
              <span style={{ width: 20, height: 20, borderRadius: 6, border: "1px solid var(--panel-brd)", background: form.super_admin_alerts ? "linear-gradient(100deg,#7c3aed,#22d3ee)" : "transparent", display: "grid", placeItems: "center" }}>{form.super_admin_alerts && <ShieldCheck size={12} color="#fff" />}</span>
              <span style={{ fontSize: 13.5 }}>Also alert the platform super admin</span>
            </label>
            <button className="btn btn-primary btn-block" disabled={busy} type="submit" data-testid="device-save-btn">{busy ? <Loader2 className="spin" size={16} /> : (editing ? "Save changes" : "Add device")}</button>
          </form>
        </div>
      )}
    </div>
  );
}
