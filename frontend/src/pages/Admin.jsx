import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Users, Car, Bell, ShieldAlert, Siren, ParkingCircle, Video, Ban, CheckCircle2, Download, Filter } from "lucide-react";

function Stat({ icon, label, value, color }) {
  return (
    <div className="glass card-pad" data-testid={`stat-${label}`}>
      <div style={{ color, marginBottom: 8 }}>{icon}</div>
      <div className="stat-num">{value ?? "—"}</div>
      <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{label}</div>
    </div>
  );
}

export default function Admin() {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState("");
  const [alerts, setAlerts] = useState([]);
  const [aType, setAType] = useState("");
  const [aDays, setADays] = useState(30);
  const [aq, setAq] = useState("");
  const [exporting, setExporting] = useState(false);

  const loadStats = async () => setStats((await api.get("/admin/stats")).data);
  const loadUsers = async (query = "") => setUsers((await api.get(`/admin/users${query ? `?q=${encodeURIComponent(query)}` : ""}`)).data.results);
  const loadAlerts = async (type = aType, days = aDays, query = aq) => {
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    params.set("days", days);
    if (query) params.set("q", query);
    setAlerts((await api.get(`/admin/alerts?${params.toString()}`)).data.results);
  };

  useEffect(() => { loadStats(); loadUsers(); loadAlerts(); }, []);

  const exportCSV = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (aType) params.set("type", aType);
      params.set("days", aDays);
      const res = await api.get(`/admin/alerts/export?${params.toString()}`, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url; a.download = `neksaathi-alerts-${aDays}d.csv`; a.click();
      URL.revokeObjectURL(url);
    } finally { setExporting(false); }
  };

  const toggleSuspend = async (u) => {
    await api.post(`/admin/users/${u.id}/suspend`, { suspended: !u.suspended });
    loadUsers(q);
  };

  return (
    <div className="page" data-testid="admin-page">
      <div className="container-nk">
        <span className="chip">Super admin</span>
        <h1 style={{ fontSize: 34, marginTop: 12, marginBottom: 22 }}>Console <span className="neon">overview</span></h1>

        <div className="grid grid-4" style={{ marginBottom: 16 }}>
          <Stat icon={<Users size={22} />} label="Users" value={stats?.users} color="#22d3ee" />
          <Stat icon={<Car size={22} />} label="Vehicles" value={stats?.vehicles} color="#8b5cf6" />
          <Stat icon={<Bell size={22} />} label="Alerts (total)" value={stats?.alerts_total} color="#f5a524" />
          <Stat icon={<ShieldAlert size={22} />} label="Alerts 24h" value={stats?.alerts_24h} color="#ff3b5c" />
        </div>
        <div className="grid grid-4" style={{ marginBottom: 30 }}>
          <Stat icon={<Siren size={22} />} label="Emergencies" value={stats?.emergencies} color="#ff3b5c" />
          <Stat icon={<ParkingCircle size={22} />} label="Wrong parking" value={stats?.wrong_parking} color="#f5a524" />
          <Stat icon={<ShieldAlert size={22} />} label="Accidents" value={stats?.accidents} color="#f97316" />
          <Stat icon={<Video size={22} />} label="SOS videos" value={stats?.sos_videos} color="#22d3ee" />
        </div>

        <div className="glass card-pad" style={{ padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <h2 style={{ fontSize: 22 }}>Users</h2>
            <input className="input" style={{ maxWidth: 280 }} placeholder="Search name / email / phone" value={q}
              onChange={(e) => { setQ(e.target.value); loadUsers(e.target.value); }} data-testid="admin-user-search" />
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                  <th style={th}>Name</th><th style={th}>Email</th><th style={th}>Phone</th><th style={th}>Vehicles</th><th style={th}>Status</th><th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} data-testid={`user-row-${u.email}`} style={{ borderTop: "1px solid rgba(124,58,237,.12)" }}>
                    <td style={td}>{u.name}{u.is_admin && <span className="chip" style={{ marginLeft: 8, padding: "2px 8px" }}>admin</span>}</td>
                    <td style={td}>{u.email}</td>
                    <td style={td}>{u.phone}</td>
                    <td style={td}>{u.vehicles}</td>
                    <td style={td}>
                      {u.suspended
                        ? <span style={{ color: "#ff3b5c", fontWeight: 700 }}>Suspended</span>
                        : <span style={{ color: "#22d3ee", fontWeight: 700 }}>Active</span>}
                    </td>
                    <td style={td}>
                      {!u.is_admin && (
                        <button className="btn btn-ghost btn-sm" onClick={() => toggleSuspend(u)} data-testid={`suspend-${u.email}`}>
                          {u.suspended ? <><CheckCircle2 size={14} /> Reactivate</> : <><Ban size={14} color="#ff3b5c" /> Suspend</>}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="glass card-pad" style={{ padding: 24, marginTop: 18 }} data-testid="admin-alerts-section">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <h2 style={{ fontSize: 22 }}><Bell size={18} style={{ verticalAlign: "-3px" }} /> Alerts</h2>
            <button className="btn btn-primary btn-sm" onClick={exportCSV} disabled={exporting} data-testid="export-csv-btn"><Download size={15} /> {exporting ? "Exporting…" : "Export CSV"}</button>
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            <Filter size={16} className="muted" />
            <select className="input" style={{ maxWidth: 180 }} value={aType} onChange={(e) => { setAType(e.target.value); loadAlerts(e.target.value, aDays, aq); }} data-testid="alert-type-filter">
              <option value="">All types</option>
              <option value="emergency">Emergency</option>
              <option value="wrong_parking">Wrong parking</option>
              <option value="theft">Theft</option>
              <option value="fire">Fire</option>
              <option value="towing">Towing</option>
              <option value="speed_alert">Overspeed</option>
              <option value="accident">Accident</option>
              <option value="sos_video">SOS video</option>
              <option value="found">Tag found</option>
              <option value="card_message">Card message</option>
            </select>
            <select className="input" style={{ maxWidth: 140 }} value={aDays} onChange={(e) => { setADays(Number(e.target.value)); loadAlerts(aType, Number(e.target.value), aq); }} data-testid="alert-days-filter">
              <option value={1}>Last 24h</option>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={0}>All time</option>
            </select>
            <input className="input" style={{ maxWidth: 200 }} placeholder="Search plate" value={aq} onChange={(e) => { setAq(e.target.value); loadAlerts(aType, aDays, e.target.value); }} data-testid="alert-plate-filter" />
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead><tr style={{ textAlign: "left", color: "var(--muted)" }}>
                <th style={th}>Plate</th><th style={th}>Type</th><th style={th}>Note</th><th style={th}>When</th><th style={th}>Notified</th>
              </tr></thead>
              <tbody>
                {alerts.length === 0 && <tr><td style={td} colSpan={5}><span className="muted">No alerts for this filter.</span></td></tr>}
                {alerts.map((a) => (
                  <tr key={a.id} data-testid={`admin-alert-${a.id}`} style={{ borderTop: "1px solid rgba(124,58,237,.12)" }}>
                    <td style={td}>{a.number_plate}</td>
                    <td style={td}><span className="chip" style={{ padding: "2px 8px", fontSize: 11 }}>{a.type}</span></td>
                    <td style={td} className="muted">{a.scanner_note || "—"}</td>
                    <td style={td} className="muted">{new Date(a.created_at).toLocaleString()}</td>
                    <td style={td}>{a.contact_channels_count}</td>
                  </tr>
                ))}
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
