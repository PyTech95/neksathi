import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { ArrowLeft, ShieldAlert, Lock, MapPin, RefreshCw } from "lucide-react";

export default function AdminIntruder() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => { setLoading(true); try { setData((await api.get("/admin/intruder-events?limit=100")).data); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);

  return (
    <div className="page" data-testid="admin-intruder-page" style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 20px 80px" }}>
      <Link to="/admin" className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }} data-testid="intruder-admin-back"><ArrowLeft size={15} /> Admin</Link>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}><ShieldAlert size={24} style={{ color: "#ff3b5c" }} /><h1 style={{ margin: 0, fontSize: 24 }}>Intruder Captures (All Users)</h1></div>
        <button className="btn btn-ghost btn-sm" onClick={load} data-testid="intruder-admin-refresh"><RefreshCw size={15} /> Refresh</button>
      </div>
      {loading ? <div className="spinner" data-testid="admin-intruder-loading" /> : !data?.items?.length ? (
        <p className="muted" data-testid="admin-intruder-empty" style={{ textAlign: "center", padding: "30px 0" }}>No intruder captures reported yet.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 14 }}>
          {data.items.map((ev) => (
            <div key={ev.id} data-testid={`admin-intruder-${ev.id}`} className="glass" style={{ padding: 14, borderRadius: 14 }}>
              {ev.photo_base64 ? (
                <img src={ev.photo_base64.startsWith("data:") ? ev.photo_base64 : `data:image/jpeg;base64,${ev.photo_base64}`} alt="intruder" style={{ width: "100%", height: 180, objectFit: "cover", borderRadius: 10 }} />
              ) : <div style={{ height: 180, borderRadius: 10, background: "rgba(255,255,255,.05)", display: "grid", placeItems: "center" }} className="muted">No photo</div>}
              <div style={{ fontWeight: 700, marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}><ShieldAlert size={15} style={{ color: "#ff3b5c" }} /> {ev.attempt_count} attempts · {ev.device_name}{ev.triggered_lock && <Lock size={13} style={{ color: "#ff3b5c" }} />}</div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>Owner: {ev.owner_name || "—"} {ev.owner_phone ? `· ${ev.owner_phone}` : ""}</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{ev.created_at ? new Date(ev.created_at).toLocaleString() : ""}</div>
              {ev.latitude != null && <a className="neon" href={`https://maps.google.com/?q=${ev.latitude},${ev.longitude}`} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 4, marginTop: 4 }}><MapPin size={13} /> Location</a>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
