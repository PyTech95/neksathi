import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { ParkingCircle, Siren, ShieldAlert, ArrowLeft, BellRing } from "lucide-react";

const META = {
  wrong_parking: { icon: <ParkingCircle size={16} />, color: "#f5a524", label: "Wrong parking" },
  accident: { icon: <Siren size={16} />, color: "#ff3b5c", label: "Accident" },
  theft: { icon: <ShieldAlert size={16} />, color: "#8b5cf6", label: "Theft" },
};

function Stat({ label, value, color }) {
  return <div className="glass card-pad" data-testid={`inc-stat-${label}`}><div className="stat-num" style={{ color }}>{value ?? 0}</div><div className="muted" style={{ fontSize: 13 }}>{label}</div></div>;
}

export default function AdminIncidents() {
  const [data, setData] = useState({ results: [], stats: {} });
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");

  const load = useCallback(async (t = type, s = status) => {
    const p = new URLSearchParams(); if (t) p.set("type", t); if (s) p.set("status", s); p.set("days", 90);
    setData((await api.get(`/admin/incidents?${p.toString()}`)).data);
  }, [type, status]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="page" data-testid="admin-incidents-page">
      <div className="container-nk">
        <Link to="/admin" className="nav-link" style={{ display: "inline-flex", marginBottom: 12 }}><ArrowLeft size={16} /> Admin</Link>
        <h1 style={{ fontSize: 32, marginBottom: 18 }}><BellRing size={26} style={{ verticalAlign: "-4px" }} /> Incident <span className="neon">history</span></h1>

        <div className="grid grid-4" style={{ marginBottom: 12 }}>
          <Stat label="Total" value={data.stats.total} color="#22d3ee" />
          <Stat label="Wrong parking" value={data.stats.wrong_parking} color="#f5a524" />
          <Stat label="Accidents" value={data.stats.accident} color="#ff3b5c" />
          <Stat label="Theft" value={data.stats.theft} color="#8b5cf6" />
        </div>
        <div className="grid grid-2" style={{ marginBottom: 20 }}>
          <Stat label="Active" value={data.stats.active} color="#f5a524" />
          <Stat label="Resolved" value={data.stats.resolved} color="#22d3ee" />
        </div>

        <div className="glass card-pad" style={{ padding: 22 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            <select className="input" style={{ maxWidth: 180 }} value={type} onChange={(e) => { setType(e.target.value); load(e.target.value, status); }} data-testid="inc-type-filter">
              <option value="">All types</option><option value="wrong_parking">Wrong parking</option><option value="accident">Accident</option><option value="theft">Theft</option>
            </select>
            <select className="input" style={{ maxWidth: 180 }} value={status} onChange={(e) => { setStatus(e.target.value); load(type, e.target.value); }} data-testid="inc-status-filter">
              <option value="">All statuses</option><option value="alert_sent">Alert sent</option><option value="coming">Coming</option><option value="no_response">No response</option><option value="resolved">Resolved</option>
            </select>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead><tr style={{ textAlign: "left", color: "var(--muted)" }}><th style={th}>Plate</th><th style={th}>Type</th><th style={th}>Status</th><th style={th}>Response</th><th style={th}>Call</th><th style={th}>When</th></tr></thead>
              <tbody>
                {data.results.length === 0 && <tr><td style={td} colSpan={6} className="muted">No incidents for this filter.</td></tr>}
                {data.results.map((it) => {
                  const m = META[it.type] || META.wrong_parking;
                  return (
                    <tr key={it.id} style={{ borderTop: "1px solid rgba(124,58,237,.12)" }} data-testid={`admin-incident-${it.id}`}>
                      <td style={td}><b>{it.number_plate}</b></td>
                      <td style={td}><span style={{ color: m.color, display: "inline-flex", gap: 5, alignItems: "center" }}>{m.icon} {m.label}</span></td>
                      <td style={td}>{it.resolved ? <span style={{ color: "#22d3ee" }}>resolved</span> : it.status}</td>
                      <td style={td} className="muted">{it.owner_response || "—"}</td>
                      <td style={td} className="muted">{it.call_attempted ? "yes" : "—"}</td>
                      <td style={td} className="muted">{new Date(it.created_at).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
const th = { padding: "8px 10px", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em" };
const td = { padding: "12px 10px" };
