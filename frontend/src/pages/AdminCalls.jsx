import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Phone, ArrowLeft, RefreshCw, ParkingCircle, ShieldAlert, PlayCircle } from "lucide-react";

const providerChip = (p) => ({
  vobiz: { bg: "rgba(52,211,153,.16)", bd: "rgba(52,211,153,.5)", c: "#34d399", label: "Vobiz (live)" },
  msg91: { bg: "rgba(34,211,238,.16)", bd: "rgba(34,211,238,.5)", c: "#22d3ee", label: "MSG91" },
  mock: { bg: "rgba(148,163,184,.16)", bd: "rgba(148,163,184,.4)", c: "#94a3b8", label: "Mock" },
}[p] || { bg: "rgba(148,163,184,.16)", bd: "rgba(148,163,184,.4)", c: "#94a3b8", label: p || "—" });

const fmtDur = (s) => (!s ? "—" : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`);

function Stat({ label, value, color }) {
  return <div className="glass card-pad" data-testid={`call-stat-${label}`}><div className="stat-num" style={{ color }}>{value ?? 0}</div><div className="muted" style={{ fontSize: 13 }}>{label}</div></div>;
}

export default function AdminCalls() {
  const [data, setData] = useState({ results: [], stats: {} });
  const [provider, setProvider] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p = provider) => {
    setLoading(true);
    try {
      const qs = p ? `?provider=${p}` : "";
      setData((await api.get(`/admin/call-records${qs}`)).data);
    } finally { setLoading(false); }
  }, [provider]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="page" data-testid="admin-calls-page">
      <div className="container-nk">
        <Link to="/admin" className="nav-link" style={{ display: "inline-flex", marginBottom: 12 }}><ArrowLeft size={16} /> Admin</Link>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <h1 style={{ fontSize: 32, marginBottom: 6 }}><Phone size={24} style={{ verticalAlign: "-3px" }} /> Masked <span className="neon">call logs</span></h1>
          <button className="btn btn-ghost btn-sm" onClick={() => load()} data-testid="calls-refresh"><RefreshCw size={15} /> Refresh</button>
        </div>
        <p className="muted" style={{ marginBottom: 18, fontSize: 13 }}>Every private call routed through Nek Sathi. Reporter numbers are masked; owner/guardian numbers are never shown.</p>

        <div className="grid grid-4" style={{ marginBottom: 18 }}>
          <Stat label="Total" value={data.stats.total} color="#22d3ee" />
          <Stat label="Via Vobiz" value={data.stats.vobiz} color="#34d399" />
          <Stat label="Connected" value={data.stats.connected} color="#a78bfa" />
          <Stat label="Mock/demo" value={data.stats.mock} color="#94a3b8" />
        </div>

        <div className="glass card-pad" style={{ padding: 22 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            <select className="input" style={{ maxWidth: 200 }} value={provider} onChange={(e) => { setProvider(e.target.value); load(e.target.value); }} data-testid="calls-provider-filter">
              <option value="">All providers</option>
              <option value="vobiz">Vobiz (live)</option>
              <option value="msg91">MSG91</option>
              <option value="mock">Mock / demo</option>
            </select>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead><tr style={{ textAlign: "left", color: "var(--muted)" }}>
                <th style={th}>Subject</th><th style={th}>Type</th><th style={th}>Provider</th><th style={th}>Status</th><th style={th}>Duration</th><th style={th}>Reporter</th><th style={th}>Recording</th><th style={th}>When</th>
              </tr></thead>
              <tbody>
                {loading && <tr><td style={td} colSpan={8} className="muted">Loading…</td></tr>}
                {!loading && data.results.length === 0 && <tr><td style={td} colSpan={8} className="muted">No call attempts yet.</td></tr>}
                {!loading && data.results.map((r) => {
                  const pc = providerChip(r.provider);
                  return (
                    <tr key={r.id} style={{ borderTop: "1px solid rgba(124,58,237,.12)" }} data-testid={`call-row-${r.id}`}>
                      <td style={td}><b>{r.subject || "—"}</b></td>
                      <td style={td}><span style={{ color: r.kind === "tag_guardian" ? "#8b5cf6" : "#f5a524", display: "inline-flex", gap: 5, alignItems: "center" }}>{r.kind === "tag_guardian" ? <ShieldAlert size={15} /> : <ParkingCircle size={15} />} {r.kind === "tag_guardian" ? "Tag / guardian" : "Vehicle"}</span></td>
                      <td style={td}><span className="chip" style={{ padding: "2px 10px", fontSize: 11, background: pc.bg, borderColor: pc.bd, color: pc.c }}>{pc.label}</span></td>
                      <td style={td} className="muted">{r.final_status || r.status || "—"}</td>
                      <td style={td} className="muted">{fmtDur(r.duration_sec)}</td>
                      <td style={td} className="muted">{r.reporter_phone || "—"}</td>
                      <td style={td}>
                        {r.recording_url
                          ? <a href={r.recording_url} target="_blank" rel="noreferrer" className="neon" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 700 }} data-testid={`call-recording-${r.id}`}><PlayCircle size={16} /> Play</a>
                          : <span className="muted">—</span>}
                      </td>
                      <td style={td} className="muted">{r.created_at ? new Date(r.created_at).toLocaleString() : "—"}</td>
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
