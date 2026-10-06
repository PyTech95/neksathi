import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { TAG_META } from "@/pages/Tags";
import { Building2, QrCode, CheckCircle2, Clock, BellRing, MapPin, School, HeartPulse, Briefcase, ExternalLink } from "lucide-react";

const ORG_ICON = { school: <School size={22} />, hospital: <HeartPulse size={22} />, office: <Briefcase size={22} />, other: <Building2 size={22} /> };

function Stat({ icon, label, value, color, testid }) {
  return (
    <div className="glass card-pad" data-testid={testid} style={{ padding: 20 }}>
      <div style={{ color, marginBottom: 8 }}>{icon}</div>
      <div className="stat-num" style={{ fontSize: 30 }}>{value}</div>
      <div className="muted" style={{ fontSize: 13 }}>{label}</div>
    </div>
  );
}

export default function OrgDashboard() {
  const [me, setMe] = useState(null);
  const [tags, setTags] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [tab, setTab] = useState("tags");

  const load = useCallback(async () => {
    const [m, t, a] = await Promise.all([
      api.get("/org/me"), api.get("/org/tags"), api.get("/org/alerts"),
    ]);
    setMe(m.data); setTags(t.data.results); setAlerts(a.data.results);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!me) return <div className="page"><div className="container-nk"><div className="spinner" /></div></div>;
  const { org, counts } = me;

  return (
    <div className="page" data-testid="org-dashboard">
      <div className="container-nk">
        <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 22 }}>
          <div className="brand-badge" style={{ width: 52, height: 52, borderRadius: 14 }}>{ORG_ICON[org.org_type] || ORG_ICON.other}</div>
          <div>
            <h1 style={{ fontSize: 30 }} data-testid="org-name">{org.name}</h1>
            <p className="muted" style={{ fontSize: 14 }}>{org.org_type?.[0]?.toUpperCase() + org.org_type?.slice(1)}{org.city ? ` · ${org.city}` : ""} · Organization portal</p>
          </div>
        </div>

        <div className="grid grid-3" style={{ marginBottom: 24 }}>
          <Stat testid="org-stat-issued" icon={<QrCode size={22} />} label="Tags issued" value={counts.issued} color="#22d3ee" />
          <Stat testid="org-stat-activated" icon={<CheckCircle2 size={22} />} label="Activated" value={counts.activated} color="#10b981" />
          <Stat testid="org-stat-unclaimed" icon={<Clock size={22} />} label="Yet to hand out" value={counts.unclaimed} color="#f5a524" />
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button className={`btn btn-sm ${tab === "tags" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("tags")} data-testid="org-tab-tags">Issued tags</button>
          <button className={`btn btn-sm ${tab === "alerts" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("alerts")} data-testid="org-tab-alerts"><BellRing size={14} /> Scan alerts</button>
        </div>

        {tab === "tags" && (
          <div className="glass card-pad" style={{ padding: 0, overflow: "hidden" }} data-testid="org-tags-table">
            {tags.length === 0 ? <p className="muted" style={{ padding: 22 }}>No tags activated yet. Once people scan and register their handed-out tags, they'll appear here.</p> : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ textAlign: "left", color: "#8891a7", fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em" }}>
                  <th style={th}>Name</th><th style={th}>Type</th><th style={th}>Guardian</th><th style={th}>Blood</th><th style={th}>Status</th>
                </tr></thead>
                <tbody>
                  {tags.map((t) => (
                    <tr key={t.id} data-testid={`org-tag-${t.id}`} style={{ borderTop: "1px solid rgba(124,58,237,.12)" }}>
                      <td style={td}><b>{t.name}</b></td>
                      <td style={td}>{(TAG_META[t.tag_type] || {}).label || t.tag_type}</td>
                      <td style={td} className="muted">{t.guardian_name || "—"}</td>
                      <td style={td} className="muted">{t.blood_group || "—"}</td>
                      <td style={td}>{t.lost_mode ? <span style={{ color: "#ff3b5c" }}>LOST</span> : <span style={{ color: "#10b981" }}>Active</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === "alerts" && (
          <div className="grid" style={{ gap: 10 }} data-testid="org-alerts-list">
            {alerts.length === 0 ? <p className="muted">No scan alerts yet.</p> : alerts.map((a) => (
              <div key={a.id} className="glass card-pad" style={{ padding: 16 }} data-testid={`org-alert-${a.id}`}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <b style={{ color: (a.type || "").includes("kid_help") || (a.type || "").includes("sos") ? "#ff3b5c" : "#22d3ee" }}>{(a.type || "").replace("tag_", "").replace("_", " ").toUpperCase()}</b>
                  <span className="muted" style={{ fontSize: 12 }}>{new Date(a.created_at).toLocaleString()}</span>
                </div>
                {a.note && <p className="muted" style={{ fontSize: 14, marginTop: 6 }}>{a.note}</p>}
                {a.lat != null && a.lng != null && <a href={`https://maps.google.com/?q=${a.lat},${a.lng}`} target="_blank" rel="noreferrer" className="nav-link" style={{ display: "inline-flex", gap: 4, marginTop: 6, fontSize: 13 }}><MapPin size={13} /> Live location <ExternalLink size={11} /></a>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
const th = { padding: "12px 14px" };
const td = { padding: "12px 14px", fontSize: 14 };
