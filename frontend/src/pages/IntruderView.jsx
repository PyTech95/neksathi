import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { API } from "@/lib/api";
import { ShieldAlert, MapPin, Lock, Loader2 } from "lucide-react";

export default function IntruderView() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/public/intruder/${token}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then(setData).catch(() => setData({ error: true })).finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="page" data-testid="intruder-view-page" style={{ maxWidth: 560, margin: "0 auto", padding: "28px 20px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <ShieldAlert size={24} style={{ color: "#ff3b5c" }} />
        <h1 style={{ margin: 0, fontSize: 22 }}>Theft Alert</h1>
      </div>
      {loading ? <div className="spinner" data-testid="intruder-loading" /> : data?.error ? (
        <div className="glass" style={{ padding: 24, borderRadius: 16, textAlign: "center", color: "#ff7591" }} data-testid="intruder-error">This alert link is invalid or has expired.</div>
      ) : (
        <div className="glass" style={{ padding: 20, borderRadius: 16 }} data-testid="intruder-detail">
          <div style={{ fontWeight: 800, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <ShieldAlert size={18} style={{ color: "#ff3b5c" }} /> {data.attempt_count} failed unlock attempt{data.attempt_count === 1 ? "" : "s"}
          </div>
          <p className="muted" style={{ marginTop: 4, fontSize: 13.5 }}>on device <b style={{ color: "var(--text)" }}>{data.device_name}</b>{data.triggered_lock ? " — the phone has been locked." : ""}</p>
          {data.photo_base64 ? (
            <img src={data.photo_base64.startsWith("data:") ? data.photo_base64 : `data:image/jpeg;base64,${data.photo_base64}`} alt="intruder" data-testid="intruder-view-photo" style={{ width: "100%", borderRadius: 12, marginTop: 10 }} />
          ) : <p className="muted">No photo was captured.</p>}
          <div style={{ display: "flex", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
            {data.triggered_lock && <span style={{ color: "#ff3b5c", display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700 }}><Lock size={16} /> Device locked</span>}
            {data.latitude != null && <a className="neon" href={`https://maps.google.com/?q=${data.latitude},${data.longitude}`} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6 }} data-testid="intruder-view-map"><MapPin size={16} /> View location</a>}
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>{data.created_at ? new Date(data.created_at).toLocaleString() : ""}</p>
        </div>
      )}
    </div>
  );
}
