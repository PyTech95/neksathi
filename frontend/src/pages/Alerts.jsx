import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Siren, ParkingCircle, Lock, Flame, Truck, Gauge, Video, Bell, MapPin, Phone, RefreshCw } from "lucide-react";

const META = {
  emergency: { icon: <Siren size={18} />, color: "#ff3b5c", label: "Emergency" },
  wrong_parking: { icon: <ParkingCircle size={18} />, color: "#f5a524", label: "Wrong parking" },
  theft: { icon: <Lock size={18} />, color: "#8b5cf6", label: "Theft" },
  fire: { icon: <Flame size={18} />, color: "#f97316", label: "Fire" },
  towing: { icon: <Truck size={18} />, color: "#22d3ee", label: "Towing" },
  speed_alert: { icon: <Gauge size={18} />, color: "#f5a524", label: "Overspeed" },
  sos: { icon: <Siren size={18} />, color: "#ff3b5c", label: "SOS" },
  sos_video: { icon: <Video size={18} />, color: "#ff3b5c", label: "SOS video" },
};

const fmt = (d) => {
  const dt = new Date(d);
  return dt.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

export default function Alerts() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/alerts");
      setAlerts(r.data);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="page" data-testid="alerts-page">
      <div className="container-nk" style={{ maxWidth: 760 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <div>
            <span className="chip">Activity</span>
            <h1 style={{ fontSize: 34, marginTop: 12 }}>Alert <span className="neon">feed</span></h1>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={load} data-testid="refresh-alerts"><RefreshCw size={15} /> Refresh</button>
        </div>

        {loading ? (
          <div className="spinner" />
        ) : alerts.length === 0 ? (
          <div className="glass card-pad center" style={{ padding: 50 }} data-testid="empty-alerts">
            <Bell size={40} color="#7c3aed" />
            <h3 style={{ fontSize: 22, margin: "12px 0 6px" }}>No alerts yet</h3>
            <p className="muted">When someone scans your QR, it'll appear here in real time.</p>
          </div>
        ) : (
          <div className="glass" style={{ overflow: "hidden" }}>
            {alerts.map((a) => {
              const m = META[a.type] || { icon: <Bell size={18} />, color: "#8b5cf6", label: a.type };
              return (
                <div key={a.id} className="alert-row" data-testid={`alert-row-${a.id}`}>
                  <div className="alert-ico" style={{ background: `${m.color}22`, color: m.color }}>{m.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <span style={{ fontWeight: 700 }}>{m.label} · {a.number_plate}</span>
                      <span className="muted" style={{ fontSize: 12 }}>{fmt(a.created_at)}</span>
                    </div>
                    {a.scanner_note && <p className="muted" style={{ fontSize: 14, marginTop: 4 }}>{a.scanner_note}</p>}
                    <div style={{ display: "flex", gap: 14, marginTop: 6, flexWrap: "wrap" }}>
                      {a.scanner_phone && (
                        <a href={`tel:${a.scanner_phone}`} className="neon" style={{ fontSize: 13, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <Phone size={13} /> {a.scanner_phone}
                        </a>
                      )}
                      {a.scanner_lat != null && a.scanner_lng != null && (
                        <a href={`https://www.openstreetmap.org/?mlat=${a.scanner_lat}&mlon=${a.scanner_lng}#map=17/${a.scanner_lat}/${a.scanner_lng}`} target="_blank" rel="noreferrer" className="muted" style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <MapPin size={13} /> View on map
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
