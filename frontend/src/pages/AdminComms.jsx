import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { ArrowLeft, MessageSquare, Mail, MessageCircle, RefreshCw, Loader2 } from "lucide-react";

const STATUS_COLORS = { sent: "#34d399", mock: "#f5a524", failed: "#ff3b5c", skipped: "#9a9ab5" };

function Stat({ label, value, color }) {
  return (
    <div className="glass card-pad" style={{ textAlign: "center" }} data-testid={`comms-stat-${label.toLowerCase()}`}>
      <div style={{ fontSize: 26, fontWeight: 800, color }}>{value ?? 0}</div>
      <div className="muted" style={{ fontSize: 12.5 }}>{label}</div>
    </div>
  );
}

export default function AdminComms() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState("all");
  const [status, setStatus] = useState("all");

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get(`/admin/notifications?channel=${channel}&status_filter=${status}&limit=150`);
      setData(r.data);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [channel, status]);

  const s = data?.stats || {};

  return (
    <div className="page" data-testid="admin-comms-page" style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 20px 80px" }}>
      <Link to="/admin" className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }} data-testid="comms-back"><ArrowLeft size={15} /> Admin</Link>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <MessageSquare size={24} className="neon" />
          <h1 style={{ margin: 0, fontSize: 24 }}>Delivery Reports</h1>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load} data-testid="comms-refresh"><RefreshCw size={15} /> Refresh</button>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 12 }}>
        <Stat label="Total" value={s.total} color="#e8e8f5" />
        <Stat label="Sent" value={s.sent} color="#34d399" />
        <Stat label="Mock" value={s.mock} color="#f5a524" />
        <Stat label="Failed" value={s.failed} color="#ff3b5c" />
        <Stat label="WhatsApp" value={s.whatsapp} color="#25d366" />
        <Stat label="SMS" value={s.sms} color="#22d3ee" />
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <select className="input" value={channel} onChange={(e) => setChannel(e.target.value)} data-testid="comms-channel-filter" style={{ maxWidth: 180 }}>
          <option value="all">All channels</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="sms">SMS</option>
        </select>
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} data-testid="comms-status-filter" style={{ maxWidth: 180 }}>
          <option value="all">All statuses</option>
          <option value="sent">Sent</option>
          <option value="mock">Mock</option>
          <option value="failed">Failed</option>
          <option value="skipped">Skipped</option>
        </select>
      </div>

      {loading ? (
        <div className="spinner" data-testid="comms-loading" />
      ) : !data?.items?.length ? (
        <p className="muted" data-testid="comms-empty" style={{ textAlign: "center", padding: "30px 0" }}>No messages match these filters yet.</p>
      ) : (
        <div className="glass" style={{ padding: 8, borderRadius: 14, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }} data-testid="comms-table">
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                <th style={{ padding: "10px 12px" }}>Channel</th>
                <th style={{ padding: "10px 12px" }}>To</th>
                <th style={{ padding: "10px 12px" }}>Message</th>
                <th style={{ padding: "10px 12px" }}>Status</th>
                <th style={{ padding: "10px 12px" }}>When</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((n) => (
                <tr key={n.id} data-testid={`comms-row-${n.id}`} style={{ borderTop: "1px solid var(--panel-brd)" }}>
                  <td style={{ padding: "10px 12px" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      {n.channel === "whatsapp" ? <MessageCircle size={15} style={{ color: "#25d366" }} /> : n.channel === "sms" ? <MessageSquare size={15} style={{ color: "#22d3ee" }} /> : <Mail size={15} />}
                      {n.channel}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px" }}>{n.to || "—"}</td>
                  <td style={{ padding: "10px 12px", maxWidth: 360, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={n.text}>{n.text}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <span style={{ color: STATUS_COLORS[n.status] || "#e8e8f5", fontWeight: 700, textTransform: "capitalize" }}>{n.status}</span>
                  </td>
                  <td style={{ padding: "10px 12px", color: "var(--muted)", whiteSpace: "nowrap" }}>{n.created_at ? new Date(n.created_at).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
