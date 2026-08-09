import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { ParkingCircle, Siren, ShieldAlert, Check, X, CheckCircle2, Clock, MapPin, Phone, RefreshCw, BellRing } from "lucide-react";

const META = {
  wrong_parking: { icon: <ParkingCircle size={18} />, color: "#f5a524", label: "Wrong parking" },
  accident: { icon: <Siren size={18} />, color: "#ff3b5c", label: "Accident" },
  theft: { icon: <ShieldAlert size={18} />, color: "#8b5cf6", label: "Theft / suspicious" },
};
const statusLabel = (s) => ({ alert_sent: "Alert sent", coming: "You're coming", no_response: "No response", call_attempted: "Call attempted", resolved: "Resolved" }[s] || s);

export default function Incidents() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems((await api.get("/incidents")).data.results); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const respond = async (id, response) => { await api.post(`/incidents/${id}/respond`, { response }); load(); };
  const resolve = async (id) => { await api.post(`/incidents/${id}/resolve`); load(); };

  return (
    <div className="page" data-testid="incidents-page">
      <div className="container-nk" style={{ maxWidth: 760 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <div><span className="chip"><BellRing size={13} /> Incidents</span><h1 style={{ fontSize: 34, marginTop: 12 }}>QR scan <span className="neon">incidents</span></h1></div>
          <button className="btn btn-ghost btn-sm" onClick={load} data-testid="refresh-incidents"><RefreshCw size={15} /> Refresh</button>
        </div>

        {loading ? <div className="spinner" /> : items.length === 0 ? (
          <div className="glass card-pad center" style={{ padding: 50 }} data-testid="empty-incidents">
            <BellRing size={40} color="#7c3aed" /><h3 style={{ fontSize: 22, margin: "12px 0 6px" }}>No incidents yet</h3>
            <p className="muted">When someone scans your QR and reports an issue, respond here.</p>
          </div>
        ) : (
          <div className="grid" style={{ gap: 14 }}>
            {items.map((it) => {
              const m = META[it.type] || META.wrong_parking;
              const pending = !it.resolved && (it.status === "alert_sent" || it.status === "no_response");
              return (
                <div key={it.id} className="glass card-pad" style={{ padding: 20 }} data-testid={`incident-${it.id}`}>
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <div className="alert-ico" style={{ background: `${m.color}22`, color: m.color }}>{m.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                        <span style={{ fontWeight: 700 }}>{m.label} · {it.number_plate}</span>
                        <span className="chip" style={{ padding: "2px 10px", fontSize: 11, background: it.resolved ? "rgba(34,211,238,.16)" : `${m.color}22`, borderColor: it.resolved ? "rgba(34,211,238,.4)" : `${m.color}55`, color: it.resolved ? "#22d3ee" : "#fff" }}>{statusLabel(it.status)}</span>
                      </div>
                      {it.scanner_note && <p className="muted" style={{ fontSize: 14, marginTop: 6 }}>{it.scanner_note}</p>}
                      <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap", fontSize: 13 }}>
                        {it.type === "wrong_parking" && !it.resolved && <span className="muted"><Clock size={13} style={{ verticalAlign: "-2px" }} /> {it.minutes_left} min left</span>}
                        {it.scanner_phone && <a href={`tel:${it.scanner_phone}`} className="neon" style={{ fontWeight: 700 }}><Phone size={12} style={{ verticalAlign: "-1px" }} /> Reporter: {it.scanner_phone}</a>}
                        {it.scanner_lat != null && <a href={`https://www.openstreetmap.org/?mlat=${it.scanner_lat}&mlon=${it.scanner_lng}#map=17/${it.scanner_lat}/${it.scanner_lng}`} target="_blank" rel="noreferrer" className="muted"><MapPin size={12} style={{ verticalAlign: "-1px" }} /> Location</a>}
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                        {pending && (
                          <>
                            <button className="btn btn-primary btn-sm" onClick={() => respond(it.id, "coming")} data-testid={`coming-${it.id}`}><Check size={15} /> I AM COMING</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => respond(it.id, "cant")} data-testid={`cant-${it.id}`}><X size={15} /> Can't respond</button>
                          </>
                        )}
                        {!it.resolved && <button className="btn btn-ghost btn-sm" onClick={() => resolve(it.id)} data-testid={`resolve-${it.id}`}><CheckCircle2 size={15} color="#22d3ee" /> Mark resolved</button>}
                      </div>
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
